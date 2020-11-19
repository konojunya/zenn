---
title: "Preactで作ったコンポーネントをWeb Components として公開する"
emoji: "🌎"
type: "tech"
topics: ["preact", "webcomponents", "shadowdom"]
published: true
---

Preact を使って作ったコンポーネントを Web Components として誰でも使えるように実装してみます。

# Preact とは

Preact は軽量な alternative React です。

>Fast 3kB alternative to React with the same modern API

https://preactjs.com/

React よりも軽量ながら React と同じような API で UI を作成できます。

# Web Components とは

Web Components は、Web のアプリケーションの中で再利用可能でカプセル化された独自の HTML タグを作成するための Web プラットフォームの API です。

https://www.webcomponents.org/introduction

Web Components は以下の 3 つの主な技術からなっているもので、それらを組み合わせることで独自の HTML タグを作成できます。

- カスタム要素
- Shadow DOM
- HTML テンプレート

# つくるもの

今回 [https://github.com/konojunya/video-hls](https://github.com/konojunya/video-hls) という Hls.js に対応した video 要素を自作してみます。


```html
<video-hls src="hoge.m3u8"></video-hls>
```

ゴールはこのように使えるようにすることとします。

# 開発環境

今回は preact と自分のコードをバンドルした成果物を読み込めばカスタム要素が使えるような状態にしたいので、ビルド環境を作成します。

```shell
$ yarn init -y
```

で雛形を作ります。

```shell
$ yarn hls.js preact
```

まずは今回使う題材の Hls.js と Preact をインストールしていきます。

その次にビルドを webpack で行うため webpack とその他もろもろのツールをインストールします。

```shell
$ yarn add -D webpack webpack-cli typescript ts-loader @types/hls.js html-webpack-plugin
```

`webpack.config.js` を設定します。

```js:webpack.config.js
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

const isProduction = process.env.NODE_ENV === "production";

module.exports = {
  mode: isProduction ? "production" : "development",
  entry: "./src/index.tsx",
  output: {
    path: path.resolve(__dirname, "./dist"),
    filename: "video-hls.js",
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: "ts-loader",
          },
        ],
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".tsx"],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: "./demo/index.html"
    })
  ]
};
```

`tsconfig.json` も作成しましょう。今回は `yarn tsx --init` で作ったものに Preact の設定をしたもので行います。

```json:tsconfig.json
{
  "compilerOptions": {
    ...
    "jsxFactory": "h",
    "jsx": "react"
  }
}
```

jsx と jsxFactory の説明は今回を省きます。詳細は以下をご覧ください。

- [jsx](https://www.typescriptlang.org/ja/tsconfig#jsx)
- [jsxFactory](https://www.typescriptlang.org/ja/tsconfig#jsxFactory)

# コンポーネントを書く

`src/index.tsx` にコンポーネントを作成していきます。

```tsx:src/index.tsx
import { h, JSX, render } from "preact";
import { useEffect, useRef } from "preact/hooks";
import Hls from "hls.js";

type Props = JSX.HTMLAttributes<HTMLVideoElement>;

const App = (props: Props) => {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (Hls.isSupported() && ref.current != null) {
      const hls = new Hls();
      hls.loadSource(props.src || "");
      hls.attachMedia(ref.current);
    }
  }, []);

  return <video ref={ref} {...props} src="https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"></video>;
}

render(<App/>, document.getElementById('app'));
```

ref を用いて video 要素を取得している以外は基本的に Hls.js のドキュメント通りです。

```html:demo/index.html
<html>
  <body>
    <div id="app"></div>
  </body>
</html>
```

ここまで書いたらビルドをしましょう。

```shell
$ yarn webpack
```

すると `dist` というフォルダに先ほどの HTML を含んだ成果物が誕生します。

```shell
$ open dist/index.html
```

として画面に video 要素が表示されているか確認しましょう。

# Web Components として登録する

Web Components と言えば `customElement.define` などで class を登録するコードを思い浮かべるかも知れませんが、今回は `preact-custom-element` というライブラリがその部分を行ってくれます。

```shell
$ yarn add preact-custom-element
$ yarn add -D @types/preact-custom-element
```

先ほど作ったコンポーネントを書き換えていきます。


```diff:src/index.tsx
import { h, JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";
import Hls from "hls.js";
+ import register from "preact-custom-element";

type Props = JSX.HTMLAttributes<HTMLVideoElement>;

const App = (props: Props) => {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (Hls.isSupported() && ref.current != null) {
      const hls = new Hls();
      hls.loadSource(props.src || "");
      hls.attachMedia(ref.current);
    }
  }, []);

-  return <video ref={ref} {...props} src="https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"></video>;
+  return <video ref={ref} {...props}></video>;
}

- render(<App/>, document.getElementById('app'));
+ register(
+  App,
+  "video-hls",
+  [
+    "src",
+    "autoplay",
+    "controls",
+    "width",
+    "height",
+    "loop",
+    "muted",
+    "poster",
+    "preload",
+    "style",
+    "class",
+  ],
+  { shadow: true }
+);
```

第 1 引数はコンポーネント自体で第 2 引数にカスタム要素の名前、第 3 引数に受け取る属性を記述し、第 4 引数に option を設定します。今回は Shadow DOM で展開したいので `{ shadow: true }` という設定をしました。

ではデモのコードを変えましょう。

```html:demo/index.html
<html>
  <body>
    <video-hls src="https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"></video-hls>
  </body>
</html>
```

再度ビルドをします。

```shell
$ yarn webpack
```

比較的簡単に Preact のコンポーネントを Web Components として公開できたのではないでしょうか。

これを使う側は何も意識せず `<video-hls></video-hls>` と記述し、 `dist/video-hls.js` を読み込めば動作します。
