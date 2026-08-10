---
title: "@opennextjs/cloudflare から vinext に移行して戻した"
emoji: "🚚"
type: "tech"
topics: ["cloudflare", "nextjs", "vinext", "vite"]
published: true
published_at: 2026-02-28
---

:::message alert
この記事は 2026-02-28 に vinext へ移行したときの記録です。
移行後、vinext の RSC dev build が workerd で `WeakRef` を要求して起動できない問題があり、同日中に `@opennextjs/cloudflare` へ戻しました。
以下は移行中に確認した設定とハマりどころとして残しています。
:::

playground.0xjj.dev を `@opennextjs/cloudflare` から [vinext](https://vinext.io/) へ移行しました。
vinext は Next.js の App Router を Vite 上で再実装していて、`@cloudflare/vite-plugin` と組み合わせて Cloudflare Workers へデプロイできます。

`@opennextjs/cloudflare` の変換処理を外し、Vite のビルドパイプラインへ寄せたときに何を変更したかを記録します。
移行には [Claude Code](https://docs.anthropic.com/en/docs/claude-code) と、vinext 公式の agent skill を使いました。

```sh
npx skills add cloudflare/vinext
```

skill を入れた状態で移行を指示すると、互換性チェックから `package.json`、`vite.config.ts`、`wrangler.jsonc` まで変更されました。
定型的な差分は任せられたので、ここでは手で判断した箇所と、Cloudflare Workers 上で止まった箇所を中心に残します。

## 移行前の構成

移行前は Next.js 16 + `@opennextjs/cloudflare` の構成でした。

```json:package.json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "build:opennext": "opennextjs-cloudflare build",
    "preview": "opennextjs-cloudflare preview",
    "deploy": "opennextjs-cloudflare deploy"
  }
}
```

ビルドは `next build` → `opennextjs-cloudflare build` の 2 段階で、`open-next.config.ts` も必要でした。

## vinext check で互換性チェック

`vinext check` を実行すると `91% compatible` で、検出された issue は `package.json` に `"type": "module"` がないことだけでした。
ただし、このチェックは後述する workerd 上の実行可否までは判定しません。

## package.json の変更

依存パッケージと scripts を次のように変更しました。

```diff:package.json
+  "type": "module",
   "scripts": {
-    "dev": "next dev --turbopack",
-    "build": "next build",
-    "build:opennext": "opennextjs-cloudflare build",
-    "preview": "opennextjs-cloudflare preview",
-    "deploy": "opennextjs-cloudflare deploy",
+    "dev": "vinext dev",
+    "build": "vinext build",
+    "preview": "vinext start",
+    "deploy": "vinext deploy",
   }
```

依存パッケージも入れ替えます。

```diff:package.json
-    "@mdx-js/loader": "^3.1.1",
-    "@next/mdx": "^16",
+    "@mdx-js/rollup": "^3.1.1",
-    "next": "^16",
```

```diff:package.json
+    "@cloudflare/vite-plugin": "^1",
-    "@opennextjs/cloudflare": "^1.0.0",
+    "@vitejs/plugin-rsc": "^0",
+    "vinext": "^0",
+    "vite": "^7",
```

`next` と `@opennextjs/cloudflare` を外し、`vinext`、`vite`、`@cloudflare/vite-plugin` を追加します。
MDX は `@next/mdx` と `@mdx-js/loader` から、Vite プラグインの `@mdx-js/rollup` へ変更しました。

## vite.config.ts の作成

vinext の設定は `vite.config.ts` に書きます。

```ts:vite.config.ts
import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import mdx from "@mdx-js/rollup";
import remarkGfm from "remark-gfm";
import rehypePrettyCode from "rehype-pretty-code";

export default defineConfig({
  plugins: [
    {
      enforce: "pre",
      ...mdx({
        remarkPlugins: [remarkGfm],
        rehypePlugins: [
          [
            rehypePrettyCode,
            {
              theme: { dark: "github-dark", light: "github-light" },
              keepBackground: false,
            },
          ],
        ],
      }),
    },
    vinext(),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
    }),
  ],
});
```

この設定では、プラグインの登録順と重複で 2 回止まりました。

### `@vitejs/plugin-rsc` の duplicate エラー

最初 `@vitejs/plugin-rsc` を plugins に明示的に追加していたところ、以下のエラーが出ました。

```
Error: Duplicate plugin "vite:rsc"
```

vinext が内部で `@vitejs/plugin-rsc` を登録するため、`vite.config.ts` への追加は不要でした。
`devDependencies` には残し、plugins からだけ外します。

### MDX プラグインに `enforce: "pre"` が必要

MDX プラグインを `enforce` なしで登録すると、以下のエラーが出ます。

```
Parse error @:1:1
```

RSC の scan-strip plugin が MDX を先に処理し、`es-module-lexer` の parse で失敗していました。
`enforce: "pre"` を指定し、MDX の変換を RSC scan-strip より先に実行させます。

## wrangler.jsonc の更新

`main` のエントリーポイントと `assets` の設定を変更します。

```diff:wrangler.jsonc
-  "main": ".open-next/worker.js",
+  "main": "vinext/server/app-router-entry",
   "assets": {
-    "directory": ".open-next/assets",
-    "binding": "ASSETS"
+    "not_found_handling": "none"
   },
```

`@opennextjs/cloudflare` では `.open-next/` 配下のビルド結果を参照していました。
vinext では `vinext/server/app-router-entry` をエントリーポイントに指定し、assets のディレクトリ指定を外します。

## Cloudflare Workers 固有の問題

フレームワーク固有の API と `NextRequest` に依存していた 2 箇所を変更しました。

### `getCloudflareContext()` → `import { env } from 'cloudflare:workers'`

`@opennextjs/cloudflare` では `getCloudflareContext()` から環境変数や service binding にアクセスしていました。

```ts
// before
import { getCloudflareContext } from "@opennextjs/cloudflare";

const { env } = getCloudflareContext();
```

vinext にはこの API がないので、`cloudflare:workers` から `env` を import します。

```ts
// after
import { env } from "cloudflare:workers";
```

### `request.nextUrl` → `new URL(request.url)`

`request.nextUrl` も使えなかったため、標準の `URL` API へ置き換えました。

```ts
// before
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url");
}
```

引数の型も `NextRequest` から `Request` へ変更します。

```ts
// after
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("url");
}
```

## OGP 画像の動的生成が動かない

playground.0xjj.dev は各 tool の OGP 画像を `@vercel/og` で動的に生成していましたが、vinext へ移した状態では動きませんでした。

### WASM の初期化問題

satori の `yoga.wasm` と resvg-wasm の `index_bg.wasm` を、Cloudflare Workers でモジュールとして扱うため `?module` を付けて import しました。

```ts
// @ts-expect-error — wasm module imports handled by Vite/Cloudflare
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm?module";
// @ts-expect-error — wasm module imports handled by Vite/Cloudflare
import yogaWasm from "../../node_modules/satori/yoga.wasm?module";
```

この方法では `Already initialized` と初期化タイミングの競合が残り、安定して生成できませんでした。

### フォントの読み込み問題

satori に渡すフォントデータも必要です。
Google Fonts からの `fetch` ではなく `public/` へ置く構成を試しましたが、Worker 自身への self-fetch が制限されるため取得できませんでした。

`@fontsource/noto-sans` の TTF を base64 にして TypeScript へ埋め込むと、今度はバンドルサイズの制限に収まりませんでした。

### 解決策：ビルド時に静的生成

WASM とフォントの両方をランタイムで解決するのをやめ、ビルド前に Go で PNG を生成して `public/` へ置くことにしました。
Worker からは静的ファイルを返すだけになります。

## `@opennextjs/cloudflare` へ戻した理由

ここまでの移行自体は、`vinext check` の結果どおり大半が機械的な変更で済みました。
一方で、移行後に vinext の RSC dev build を workerd で起動すると、利用できない `WeakRef` を要求する問題が残りました。

この状態では移行を維持できなかったため、2026-02-28 のうちに `@opennextjs/cloudflare` へ戻しました。
この記事は vinext を現在の構成として勧めるものではなく、その日に確認できた移行手順と互換性の記録です。
