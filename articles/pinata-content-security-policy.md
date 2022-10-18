---
title: "NFTのコンテンツサーバーにPinataを使う場合の注意点"
emoji: "🦄"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["pinata", "nft"]
published: false
---

NFT を作成する際にその中でも、 JavaScript でアニメーションを描いたりしてインタラクティブなものを作成することがあります。今回はそのような事例の際に気をつけないといけない点を紹介します。

# Pinata とは

[Pinata](https://www.pinata.cloud/) とは、IPFS ピンニングサービスの１つです。ここに静的なファイルをアップロードが行えて、コンテンツの管理自体は IPFS が担ってくれているので Web3 界隈ではよく使われるイメージがあります。

# 注意すべき点とは

先に結論を述べてしまうと、 Pinata のコンテンツには以下のようなレスポンスヘッダーが付与されます。

```
access-control-allow-headers: Content-Type
access-control-allow-headers: Range
access-control-allow-headers: User-Agent
access-control-allow-headers: X-Requested-With
access-control-allow-methods: GET
access-control-allow-methods: HEAD
access-control-allow-origin: *
access-control-expose-headers: Content-Length
access-control-expose-headers: Content-Range
access-control-expose-headers: X-Chunked-Output
access-control-expose-headers: X-Ipfs-Path
access-control-expose-headers: X-Ipfs-Roots
access-control-expose-headers: X-Stream-Output
age: 891
cache-control: public, max-age=29030400
cf-cache-status: HIT
cf-ray: 75c0e8f3aa93e08a-NRT
content-encoding: gzip
content-security-policy: default-src 'self'; img-src * data: blob: 'unsafe-inline'; style-src * 'unsafe-inline';
content-type: text/html
date: Tue, 18 Oct 2022 11:24:51 GMT
expires: Tue, 19 Sep 2023 11:24:51 GMT
last-modified: Tue, 18 Oct 2022 11:10:00 GMT
server: cloudflare
vary: Accept-Encoding
x-ipfs-path: /ipfs/<ipfs hash>
x-ipfs-roots: <ipfs hash>
```

今回、このレスポンスヘッダーのうち特に注意しないといけない点は `content-security-policy` です。

## Content Security Policy とは？

では今回注意すべきと言った、 Content Security Policy とはなんでしょうか。

ref: https://developer.mozilla.org/ja/docs/Web/HTTP/CSP

> コンテンツセキュリティポリシー (CSP) は、クロスサイトスクリプティング (Cross-site_scripting) やデータインジェクション攻撃などのような、特定の種類の攻撃を検知し、影響を軽減するために追加できるセキュリティレイヤーです。

とあります。つまり、この設定をすることで XSS などの外部からの攻撃を検知し、ブラウザがそのリクエストを reject してしまうことで、影響を軽減するために追加するものになります。

今回のレスポンスヘッダーに関してはこちらでより詳細にヘッダーの説明がされています。

ref: https://developer.mozilla.org/ja/docs/Web/HTTP/Headers/Content-Security-Policy

## デモ

実際にデモ NFT のコンテンツを用意しましょう。とても単純なものでよいので以下のような実装にします。

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>p5.js example</title>
    <script src="https://cdn.jsdelivr.net/npm/p5@1.4.2/lib/p5.js"></script>
    <script>
      function setup() {
        createCanvas(400, 400);
      }

      function draw() {
        background(220);
        ellipse(50, 50, 80, 80);
      }
    </script>
  </head>
  <body></body>
</html>
```

この HTML をブラウザで確認すると以下のような表示になります。

![](https://storage.googleapis.com/zenn-user-upload/cb825f4c6b10-20221018.png)

ではこの HTML を Pinata を使ってアップロードしてみましょう。以下のような画面になりました。

エラーは以下です。

## 解決方法

この問題の解決方法は、 `content-security-policy` ヘッダーの `default-src` が `'self'` になっているため、自分自身で p5.js をホスティングする必要があります。

以下のようなディレクトリ構造を作ります。

```
- index.html
- p5.js
```

そして HTML の script タグの実装を以下のように変更します。

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>p5.js example</title>
    <script src="p5.js"></script>
    <script>
      function setup() {
        createCanvas(400, 400);
      }

      function draw() {
        background(220);
        ellipse(50, 50, 80, 80);
      }
    </script>
  </head>
  <body></body>
</html>
```

こうすることで、p5.js は pinata のドメインに乗るため、`default-src: 'self'` になっていても表示できます。
