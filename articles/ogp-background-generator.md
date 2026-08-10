---
title: "GoでOGP背景画像を冪等に生成する"
emoji: "🎨"
type: "tech"
topics: ["go", "ogp", "画像生成"]
published: true
published_at: 2026-02-28
---

`0xjj.dev` の OGP 背景は、記事タイトルから Go で生成しています。
同じタイトルと設定から同じ画像を作り、画像ファイルをリポジトリで管理できるようにしました。

# やりたいこと

記事ごとに異なるパステルカラーを出しつつ、生成処理は次の条件に収めます。

- 同じ記事タイトルと同じ生成環境からは同じ画像を生成する
- `math/rand` の乱数列に依存しない
- 外部サービスや GPU に依存しない

処理は `scripts/generate-ogp/` の Go スクリプトへ置きました。
外部の依存パッケージは `golang.org/x/image` だけで、`go run .` で実行できます。

# タイトルからシードを作る

記事タイトルからシードを作ります。
FNV-1a の offset basis と prime を使っていますが、バイト列ではなく Go の `range` で `rune` ごとに畳み込む実装です。

```go
func titleSeed(title string) float64 {
    var h uint64 = 14695981039346656037 // FNV offset basis
    for _, c := range title {
        h ^= uint64(c)
        h *= 1099511628211 // FNV prime
    }
    return float64(h&0xFFFFFF) / float64(0x1000000)
}
```

各 `rune` を XOR と乗算で畳み込み、下位 24 bit を `[0, 1)` の `float64` へ正規化します。
以降の色、座標、半径はすべてこの値から決まります。

`math/rand` を使わないので、標準ライブラリの乱数列には依存しません。
ただし、後段では `math.Exp` や `image/png` を使うため、異なる Go のバージョンをまたいだ PNG のビット一致まで保証するものではありません。

## 疑似乱数関数

シードとインデックスから、色や座標に使う `[0, 1)` の値を作ります。

```go
func prand(seed float64, idx int) float64 {
    h := math.Float64bits(seed) ^ uint64(idx)*2654435761
    h ^= h >> 17
    h *= 0xbf58476d1ce4e5b9
    h ^= h >> 31
    h *= 0x94d049bb133111eb
    h ^= h >> 32
    return float64(h&0xFFFFFF) / float64(0x1000000)
}
```

`2654435761` は Knuth の乗法ハッシュで使われる黄金比由来の定数です。
`0xbf58476d1ce4e5b9` と `0x94d049bb133111eb` は [splitmix64](https://xoshiro.di.unimi.it/splitmix64.c) 由来で、シフトと乗算を重ねてビットを攪拌します。

# パステルカラーの設計

色は 8 色のパレットから選びます。RGB は `[0, 1]` の `float64` で持ちます。

```go
var pastelPalette = [][3]float64{
    {1.00, 0.72, 0.77}, // pastel pink
    {1.00, 0.82, 0.70}, // peach
    {0.84, 0.74, 0.94}, // lavender
    {0.77, 0.60, 0.86}, // purple
    {0.68, 0.78, 0.92}, // soft blue
    {0.95, 0.77, 0.83}, // dusty rose
    {0.74, 0.70, 0.95}, // periwinkle
    {1.00, 0.90, 0.82}, // warm cream
}
```

ピンク、ラベンダー、ブルーを中心に、彩度を抑えた暖色寄りで揃えました。
隣の blob と混ぜても 1 色だけ浮かない範囲にしています。

## カラーブロブの生成

1 枚につき 7 個の blob を置き、位置、半径、色をシードから決めます。

```go
func generateBlobs(seed float64) []colorBlob {
    blobs := make([]colorBlob, numBlobs) // numBlobs = 7
    for i := range numBlobs {
        ci := int(prand(seed, i*7+3) * float64(len(pastelPalette)))
        blobs[i] = colorBlob{
            px:     prand(seed, i*7) * imgW,       // x: [0, 1200]
            py:     prand(seed, i*7+1) * imgH,     // y: [0, 630]
            radius: 180 + prand(seed, i*7+2)*350,  // radius: [180, 530]
            col:    pastelPalette[ci],
        }
    }
    return blobs
}
```

`i*7` でインデックスの利用範囲をずらし、同じインデックスを別のパラメータへ使わないようにしています。
これは統計的な独立性を保証するものではありません。
半径は、ブラー後に消えず、画面全体を 1 色にも覆わない `[180, 530]` にしました。

blob を 1 個だけ配置した状態がこちらです。ベースカラーの上にガウシアン減衰で 1 色だけ広がっています。

![](https://0xjj.dev/images/blog/ogp-background-generator/step1-1blob.png)

3 個に増やすと、色が重なり合って混色が始まります。

![](https://0xjj.dev/images/blog/ogp-background-generator/step2-3blobs.png)

7 個すべてを配置した状態がこちらです。パレットから選ばれた複数の色が画面全体に広がっています。

![](https://0xjj.dev/images/blog/ogp-background-generator/step3-7blobs.png)

# ピクセルシェーディング

各ピクセルでは、ベースカラーへ blob をガウシアン減衰で混ぜ、最後にノイズを足します。
GPU のフラグメントシェーダで書く処理を CPU 側で回す形です。

```go
func shadePixel(x, y int, seed float64, blobs []colorBlob) (float64, float64, float64) {
    col := [3]float64{0.96, 0.93, 0.95} // warm pastel base

    px, py := float64(x), float64(y)
    for _, b := range blobs {
        dx := px - b.px
        dy := py - b.py
        w := math.Exp(-(dx*dx + dy*dy) / (2 * b.radius * b.radius))
        s := w * 0.55
        col[0] = lerp(col[0], b.col[0], s)
        col[1] = lerp(col[1], b.col[1], s)
        col[2] = lerp(col[2], b.col[2], s)
    }

    n := noise(float64(x)*0.003+seed*97, float64(y)*0.003+seed*53)
    col[0] += (n - 0.5) * 0.04
    col[1] += (n - 0.5) * 0.03
    col[2] += (n - 0.5) * 0.04

    return col[0], col[1], col[2]
}
```

ベースカラーの `{0.96, 0.93, 0.95}` は、少しピンクを含む暖色です。
その上に各 blob を重ねます。

ガウシアン減衰 `exp(-(d²) / (2σ²))` で、blob の中心から離れるほど影響を小さくします。
最大でも `w * 0.55` に抑え、1 つの色で飽和しないようにしました。

最後に `noise()` で緩いムラを足します。
スケールの `0.003` は、1200px の幅に 3〜4 個の波が入る程度です。

## ノイズ関数

ノイズには Quintic（5 次）補間のバリューノイズを使います。

```go
func noise(x, y float64) float64 {
    ix := int(math.Floor(x))
    iy := int(math.Floor(y))
    fx := x - math.Floor(x)
    fy := y - math.Floor(y)
    // quintic interpolation: 6t^5 - 15t^4 + 10t^3
    ux := fx * fx * fx * (fx*(fx*6-15) + 10)
    uy := fy * fy * fy * (fy*(fy*6-15) + 10)
    return lerp(
        lerp(ihash(ix, iy), ihash(ix+1, iy), ux),
        lerp(ihash(ix, iy+1), ihash(ix+1, iy+1), ux),
        uy,
    )
}
```

`ihash()` は格子点の整数座標からハッシュ値を返します。
Perlin noise のような勾配ノイズではありませんが、今回ほしいのは目立たない揺らぎなのでバリューノイズで十分でした。
Quintic 補間を使うと、格子に沿った直線的なパターンも出にくくなります。

# ガウシアンブラー

レンダリング後のピクセルバッファには半径 40 のガウシアンブラーをかけます。

```go
func gaussianBlur(buf *floatBuf, radius int) {
    tmp := newFloatBuf(buf.w, buf.h)
    for range 3 {
        boxBlurH(buf, tmp, radius)
        boxBlurV(tmp, buf, radius)
    }
}
```

ボックスブラーを 3 回重ねてガウシアンブラーへ近似します。
水平と垂直に分離し、スライディングウィンドウを使うことで計算量は `O(w*h)` になります。

半径による差を確認するため、ガウシアン減衰を使わない円へブラーをかけました。

半径 5 だと blob の輪郭がまだ残っており、個々の色の配置がはっきり見えます。

![](https://0xjj.dev/images/blog/ogp-background-generator/blur-r5.png)

半径 15 にすると境界がだいぶ柔らかくなりますが、まだ色の濃淡の中心が分かる程度です。

![](https://0xjj.dev/images/blog/ogp-background-generator/blur-r15.png)

本番では半径 40 を使っています。blob の境界が完全に溶け合い、どこにどの色があったのか分からないくらい滑らかになります。

## スライディングウィンドウによるボックスブラー

水平方向のボックスブラーは次の実装です。

```go
func boxBlurH(src, dst *floatBuf, r int) {
    w, h := src.w, src.h
    d := 1.0 / float64(2*r+1)
    var wg sync.WaitGroup
    for row := range h {
        wg.Add(1)
        go func(y int) {
            defer wg.Done()
            var sr, sg, sb float64
            for i := -r; i <= r; i++ {
                cr, cg, cb := src.get(max(0, min(i, w-1)), y)
                sr += cr; sg += cg; sb += cb
            }
            dst.set(0, y, sr*d, sg*d, sb*d)
            for x := 1; x < w; x++ {
                ar, ag, ab := src.get(min(x+r, w-1), y)
                rr, rg, rb := src.get(max(x-r-1, 0), y)
                sr += ar - rr; sg += ag - rg; sb += ab - rb
                dst.set(x, y, sr*d, sg*d, sb*d)
            }
        }(row)
    }
    wg.Wait()
}
```

最初に幅 `2r+1` のウィンドウ合計を求め、以降は右端のピクセルを足して左端を引きます。
各 goroutine は別の行へ書き込むため、並列化しても同じ入力から同じバッファを得られます。

## float バッファを使う理由

ブラーの中間バッファは `uint8` ではなく `float64` です。

```go
type floatBuf struct {
    w, h int
    pix  []float64 // R, G, B が交互に並ぶ (w * h * 3)
}
```

`uint8` のまま各パスで量子化すると、丸めが積み重なってバンディングが出やすくなります。
`float64` のまま 3 パスを処理し、最後にだけ `uint8` へ変換します。

# レンダリングパイプライン

全体のレンダリングパイプラインは次の実装です。

```go
func renderBackground(seed float64) *image.RGBA {
    blobs := generateBlobs(seed)      // 1. シードから7個のblobを決定的に生成
    buf := newFloatBuf(imgW, imgH)    // 2. 1200×630のfloatバッファを確保

    var wg sync.WaitGroup
    for row := range imgH {           // 3. 各行を並列にシェーディング
        wg.Add(1)
        go func(y int) {
            defer wg.Done()
            for x := range imgW {
                r, g, b := shadePixel(x, y, seed, blobs)
                buf.set(x, y, r, g, b)
            }
        }(row)
    }
    wg.Wait()

    gaussianBlur(buf, blurR)          // 4. 半径40のガウシアンブラー
    return buf.toRGBA()               // 5. float→uint8に変換してRGBA画像へ
}
```

処理順だけ抜き出すと次のようになります。

```
タイトル → FNV-1a → seed → prand() → 7 blobs
                                         ↓
                              shadePixel (ガウシアン減衰 + ノイズ)
                                         ↓
                              float64 バッファ (1200×630×3)
                                         ↓
                              ボックスブラー × 3 (H+V)
                                         ↓
                              uint8 RGBA → PNG 出力
```

最終的な出力では、ブラーによって blob の境界が見えない程度まで混ざりました。

![](https://0xjj.dev/images/blog/ogp-background-generator/step4-blurred.png)

同じタイトル、設定、ツールチェーンなら、`make gen` を繰り返しても同じ PNG を生成できます。
Go のバージョンや標準ライブラリの実装を変えたときまでビット単位の一致が必要なら、生成環境も固定して比較する必要があります。
