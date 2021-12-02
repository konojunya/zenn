---
title: "Synthetic Response"
---

第 1 章は Synthetic Response を作ってレスポンスを返す実装をします。

Synthetic Response とは Compute@Edge 内でレスポンスを作って返すもので、Fastly の VCL だと以下のような実装のものです。

```vcl
set obj.status = 200;
synthetic "Hello world";
return(deliver);
```

単純にリクエストが来たら `Hello world` という文字列を返すサーバーを Compute@Edge で作成してみましょう。

```rust:src/main.rs
use fastly::http::StatusCode;
use fastly::{mime, Error, Request, Response};

#[fastly::main]
fn main(_: Request) -> Result<Response, Error> {
  Ok(Response::from_status(StatusCode::OK)
    .with_content_type(mime::TEXT_HTML_UTF_8)
    .with_body("Hello world"))
}
```

実装が出来たら、サーバーを起動しましょう。

```shell
$ fastly compute serve
```

ブラウザで `http://127.0.0.1:7676` へアクセスすると以下のように `Hello world` を返すサーバーになっています。

![](https://storage.googleapis.com/zenn-user-upload/adbdad981e73-20211203.png)

では、次はあらかじめ HTML を作っておいてそのファイルを読み込んでレスポンスを作るようにしましょう。


まずは `src/main.rs` と同じ階層に HTML のファイルを配置します。今回は fastly 公式のサンプルにある HTML を返すようにしましょう。

```html:src/welcome-to-compute@edge.html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="x-ua-compatible" content="ie=edge" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, shrink-to-fit=no"
    />
    <title>Welcome to Compute@Edge</title>
    <link
      rel="icon"
      href="https://developer.fastly.com/favicon-32x32.png"
      type="image/png"
    />
  </head>
  <body>
    <iframe
      src="https://developer.fastly.com/compute-welcome"
      style="
        border: 0;
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
      "
    ></iframe>
  </body>
</html>
```

HTML を用意したらその内容を返すように実装します。

```diff
use fastly::http::StatusCode;
use fastly::{mime, Error, Request, Response};

#[fastly::main]
fn main(_: Request) -> Result<Response, Error> {
    Ok(Response::from_status(StatusCode::OK)
        .with_content_type(mime::TEXT_HTML_UTF_8)
-        .with_body("Hello world"))
+        .with_body(include_str!("welcome-to-compute@edge.html")))
}
```

ではサーバーを再起動して確認してみましょう。

![](https://storage.googleapis.com/zenn-user-upload/429e496a273e-20211203.png)

またはダークモードだと以下のような表示になっています。

![](https://storage.googleapis.com/zenn-user-upload/54000ceb0416-20211203.png)

実装は [konojunya/fastly-compute-at-edge-guide - Synthetic Response](https://github.com/konojunya/fastly-compute-at-edge-guide/tree/main/synthetic-response) においているので参照ください。
