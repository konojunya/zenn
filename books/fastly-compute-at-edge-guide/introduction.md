---
title: "はじめに"
---

この本では、Fastly の Compute@Edge について、ユースケース別によくやる実装例を紹介します。

[Fastly](https://fastly.com/) とは、エッジサイドでのロジック構築や、インスタントパージと言われる即時適応のキャッシュの破棄システムなどを持っている CDN サービスです。

Fastly では通常の CDN としての使い方、その CDN のエッジサイドでロジックを動かすための Custom VCL などが存在しますが、今回は Rust や JavaScript で記述したロジックをエッジサイドで動かす Compute@Edge の話に限定します。

また本書の中のサンプル実装は全て Rust で行うことにします。ただし、筆者が Rust 初心者なため本書自体は無料公開とし、Rust に対する実装の実力不足などは指摘していただけると大変嬉しいです。

Compute@Edge のサービスの作成や、デプロイ方法などは Fastly の方が記事を作ってくださっているためそちらを参照していただければ幸いです。

https://zenn.dev/hrmsk66/articles/74e2e890726e99

また Fastly の公式ドキュメントは以下になるので、適宜参照してください。
- https://docs.fastly.com/ja/guides/compute-at-edge
- https://developer.fastly.com/reference/compute/

基本的に全てのソースコードは [Fastly のサンプル実装](https://github.com/fastly/compute-starter-kit-rust-default)を改造して行く流れで行っていきます。
