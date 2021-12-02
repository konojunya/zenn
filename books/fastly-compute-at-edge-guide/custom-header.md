---
title: "Custom Headerの付与"
---

第 3 章は Custom Header をリクエストとレスポンスに追加してみましょう。

まずは Edge からのレスポンスにカスタムヘッダーを追加します。

```rust:src/main.rs
use fastly::http::StatusCode;
use fastly::{mime, Error, Request, Response};

#[fastly::main]
fn main(_: Request) -> Result<Response, Error> {
    let mut resp = Response::from_status(StatusCode::OK)
        .with_content_type(mime::TEXT_HTML_UTF_8)
        .with_body(include_str!("welcome-to-compute@edge.html"));

    resp.set_header("X-Custom-Header", "from edge");

    Ok(resp)
}
```

サーバーを起動して確認してみましょう。

```shell
$ fastly compute serve
```

![](https://storage.googleapis.com/zenn-user-upload/7036d9acd60b-20211203.png)

次に、リクエストヘッダーにカスタムヘッダーを追加します。
この時に確認しやすいように [httpbin.org](https://httpbin.org) という便利なサービスを使います。

httpbin.org を Fastly の backend として設定します。

```toml:fastly.toml
[local_server]
  [local_server.backends]
    [local_server.backends.backend_a]
      url = "https://httpbin.org"
```

実装を書き換えます。

```rust:src/main.rs
use fastly::{Error, Request, Response};

#[fastly::main]
fn main(mut req: Request) -> Result<Response, Error> {
    req.set_header("X-Custom-Header", "from edge");
    let resp = req.send("backend_a")?;

    Ok(resp)
}
```

リクエストにカスタムヘッダーを追加し、サーバーを再起動して cURL を送ってみます。

![](https://storage.googleapis.com/zenn-user-upload/4af439974e3d-20211203.png)

実装は [konojunya/fastly-compute-at-edge-guide - Custom Header](https://github.com/konojunya/fastly-compute-at-edge-guide/tree/main/custom-header) においているので参照ください。

