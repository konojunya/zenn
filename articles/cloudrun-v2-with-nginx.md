---
title: "Cloud Run サイドカーを用いた責務の分離"
emoji: "🔎"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["googlecloud", "cloudrun", "nginx", "terraform"]
published: false
---

# Intro

[Google Developer Groups in Japan Advent Calendar 2023](https://adventar.org/calendars/9543) 12 日目の記事です。

「Cloud Run でサイドカーを使った責務の分離」と題して、Cloud Run サイドカーを構築するにはどのような手順で進めていけばいいのか。また、どんなことができるのかについて考えます。この記事では Google Cloud の全ての環境は Terraform によりコードで管理します。コンソールから行ったり、 gcloud コマンドを使って記事になっているものが多いためそれらを Terraform で書くとどうなるかも理解しやすくなるべくシンプルな形で実装していきます。

# Cloud Run マルチコンテナデプロイ

2023/11/23 Cloud Run のマルチコンテナデプロイが GA になりました🎉

https://cloud.google.com/run/docs/release-notes#November_13_2023

これがどんなものかを想像するには以下の資料が詳しく図解や活用方法が記載しているので参考にしてください。

https://cloud.google.com/blog/ja/products/serverless/cloud-run-now-supports-multi-container-deployments

このマルチコンテナデプロイは少し前からプレビューではあったので実際記事を探してみると事例がいくつか出てきます。その多くはロギングサービスをサイドカーにしたりとか、Data Dog Agent をサイドカーにデプロイしたりなどが目立ちます。

参考記事は以下になります。

- https://zenn.dev/google_cloud_jp/articles/20230516-cloud-run-otel
- https://qiita.com/AoTo0330/items/35a840462f219596e39d
- https://zenn.dev/google_cloud_jp/articles/grpc-web-with-envoy-using-cloud-run-sidecar
- https://blog.g-gen.co.jp/entry/cloudrun-with-alloydb-auth-proxy-using-sidecar

今回この記事ではもう少し思想っぽいことをやりたいと考えました。筆者は普段 CTO という役職にいますが現役の Web っ子フロントエンドエンジニアです。

## アプリケーションの中の責務の分離

一般的にアプリケーションには、ビジネスロジックが書かれている場所や他のサービスのユーティリティが書いてある部分、プレゼンテーションな部分（ここで言うプレゼンテーションな部分とは、フロントエンドにおいては UI などを指しておりバックエンドに関しては API のレスポンスの整形などを指している）などが存在します。その中で実際はもっと疎結合で良いけれど、密になってしまいがちな実装などがいくつか存在すると筆者は考えています。例としてあげると、Basic 認証などは特にいい例でしょう。

Next.js の Web アプリケーションを運用していて、特定の環境に対して [IAP](https://cloud.google.com/iap?hl=ja) などを活用することでアクセス制御をしたり、そこまでしてなくても Basic 認証をかけておくぐらいは行っていると想定しています。実際 Next.js で Basic 認証を実装しようとすると参考になるのは [vercel/examples](https://github.com/vercel/examples) の [basic-auth-password](https://github.com/vercel/examples/blob/main/edge-middleware/basic-auth-password/middleware.ts) あたりでしょう。実装は以下のようになります。

```ts:middleware.ts
import { NextRequest, NextResponse } from 'next/server'

export const config = {
  matcher: ['/', '/index'],
}

export function middleware(req: NextRequest) {
  const basicAuth = req.headers.get('authorization')
  const url = req.nextUrl

  if (basicAuth) {
    const authValue = basicAuth.split(' ')[1]
    const [user, pwd] = atob(authValue).split(':')

    if (user === '4dmin' && pwd === 'testpwd123') {
      return NextResponse.next()
    }
  }
  url.pathname = '/api/auth'

  return NextResponse.rewrite(url)
}
```

実際この実装はよく見かけますが、本来アプリケーションの達成したい要件ではなくあくまで開発者や社内のパスワードを知っているメンバーにだけ閲覧させたいという理由でこの実装をしています。筆者は特定の環境の保護のためにアプリケーションロジックとは全く関係ない実装をしているためやらなくて済むならやりたくないと考えています。ただし middleware.ts でやる意味がある場合もあります。TypeScript のエコシステムを活用しやすい環境であり、 TypeScript でこの middleware.ts にロジックを捩じ込みたい人も少なくないと思います。また最近の App Router 周りではここで HTTP Header を設定するパターンも見かけます。例えば Cache-Control などです。

この Cache-Control の実装もまたどちらかと言えば外部向きの実装だと捉えることができます。この Cache-Control などは対ブラウザであったり、対 CDN に向けたものになるためです。

これらの **「対外的実装」** をアプリケーションコードとは別で管理したいという発想からこの記事に至っています。

# 対外的実装のレイヤーを変える

今回例に出した 2 つはどちらもアプリケーションと言うよりは HTTP の概念で完結します。そのためレイヤーを 1 つあげて実装することで責務の分離を行います。イメージはこのような形です。

![](https://storage.googleapis.com/zenn-user-upload/44d043118690-20231202.png)

## サイドカーを用いて実現する

この対外的実装をサイドカーを用いて再構築してみます。

# Outro

実際の Cloud Run のドキュメントにも「サービスに複数のコンテナをデプロイする（サイドカー）」として記載されています。

https://cloud.google.com/run/docs/deploying?hl=ja#sidecars
