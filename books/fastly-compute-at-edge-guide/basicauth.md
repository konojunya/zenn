---
title: "Basic 認証"
---

第 2 章は Basic 認証を Compute@Edge で実装します。

Basic 認証の実装の流れは以下のようになります。

1. 全てのリクエストの `Authorization` ヘッダーを確認
2. あらかじめ base64 でエンコードしておいた id/password とマッチするかを確認
3. マッチしなければ 401 エラーを返却する

まずは 401 の場合に返却する HTML を実装します。

```html:src/unauthorized.html
<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Error</title>
  </head>
  <body>
    <h1>401 Unauthorized Error from Compute@Edge</h1>
  </body>
</html>
```

まずは `Authorization` ヘッダーを取得できなかったら問答無用で 401 を返してしまう実装をしていきます。

```rust:src/main.rs
fn main(req: Request) -> Result<Response, Error> {
  if let Some(v) = req.get_header_str("Authorization") {
    return Ok(Response::from_status(StatusCode::OK)
        .with_content_type(mime::TEXT_HTML_UTF_8)
        .with_body(include_str!("welcome-to-compute@edge.html")));
  }

  Ok(Response::from_status(StatusCode::UNAUTHORIZED)
    .with_content_type(mime::TEXT_HTML_UTF_8)
    .with_body(include_str!("unauthorized.html")))
}
```

この時点でローカルのサーバーを立ち上げて確認してみます。
まだ `WWW-Authenticate` ヘッダーを返していないので特に認証を聞かれることなく、401 のページが表示されます。

```shell
$ fastly compute serve
```

![](https://storage.googleapis.com/zenn-user-upload/fdecd27acbbd-20211202.png)

では Rust 側の実装に Basic 認証の id/password を base64 エンコードした結果を定数として定義しておいて比較して合わなければ 401 を返すように変更します。

```rust:src/main.rs
use fastly::http::{header, StatusCode};
use fastly::{mime, Error, Request, Response};

static BASIC_AUTH: &str = "Basic aWQ6cGFzc3dvcmQ=";
```

今回はそのまま `id:password` を認証のキーとしました。

401 エラーを返す部分は関数にまとめてしまった方が実装の都合上楽ができそうです。
その際に `WWW-Authenticate` ヘッダーも付与してしまいます。

```rust:src/main.rs
fn response_unauthorized() -> Result<Response, Error> {
  Ok(Response::from_status(StatusCode::UNAUTHORIZED)
    .with_content_type(mime::TEXT_HTML_UTF_8)
    .with_header(header::WWW_AUTHENTICATE, "Basic")
    .with_body(include_str!("unauthorized.html")))
}
```

では文字列を比較して合わなければ 401 を返すように実装を変更します。

```diff
  if let Some(v) = req.get_header_str("Authorization") {
+    if v != BASIC_AUTH {
+      return response_unauthorized();
+    }

    return Ok(Response::from_status(StatusCode::OK)
      .with_content_type(mime::TEXT_HTML_UTF_8)
      .with_body(include_str!("welcome-to-compute@edge.html")));
  }
```

以上でもう一度サーバーを起動しなおします。
ブラウザで `http://127.0.0.1:7676` を開くと Basic 認証を聞いてくるモーダルが開かれます。

![](https://storage.googleapis.com/zenn-user-upload/1485919237c4-20211202.png)

Id: `id`
Password: `password`

を入力すると welcome ページが表示されます！

![](https://storage.googleapis.com/zenn-user-upload/09ad5c3b3c73-20211202.png)

実装は [konojunya/fastly-compute-at-edge-guide - BasicAuth](https://github.com/konojunya/fastly-compute-at-edge-guide/tree/main/basicauth) においているので参照ください。
