---
title: "オリジンの切り替え"
---

第 4 章はパスによるオリジンの切り替えを実装します。

まずは Backend を設定します。

```toml:fastly.toml
[local_server]
  [local_server.backends]
    [local_server.backends.backend_a]
      url = "https://httpbin.org"
    [local_server.backends.backend_b]
      url = "https://example.com"
```

`fastly.toml` に設定したバックエンドの名前を Rust の実装内でも定数で持っておきたいのでまずは定数を定義します。

```rust:src/main.rs
const BACKEND_A: &str = "backend_a";
const BACKEND_B: &str = "backend_b";
```

今回は、 `/get` のリクエストに対するものは `ORIGIN_A` に、それ以外は `ORIGIN_B` にリクエストを振ることにします。

```rust:src/main.rs
fn main(mut req: Request) -> Result<Response, Error> {
  let backend = match req.get_path() {
    "/get" => {
      req.set_header(header::HOST, "httpbin.org");
      BACKEND_A
    }
    _ => {
      req.set_header(header::HOST, "example.com");
      BACKEND_B
    }
  };

  let resp = req.send(backend)?;
  Ok(resp)
}
```

この時に、 Backend に設定してるものは `https` のプロトコルを使っているため、 Host ヘッダーを書き換えないと TLS のエラーになる点だけ注意が必要です。

ここまで実装したらサーバーを起動しましょう。

```shell
$ fastly compute serve
```

まずは `/` にリクエストして確認してみます。 `/get` ではないので、 `example.com` の画面が表示されるはずです。

![](https://storage.googleapis.com/zenn-user-upload/4411f60953ae-20211203.png)

次に `/get` へリクエストして確認してみます。これは `httpbin.org` の JSON が表示されるはずです。

![](https://storage.googleapis.com/zenn-user-upload/5776c034670c-20211203.png)

実装は [konojunya/fastly-compute-at-edge-guide - Multiple Origin](https://github.com/konojunya/fastly-compute-at-edge-guide/tree/main/multiple-origin) においているので参照ください。
