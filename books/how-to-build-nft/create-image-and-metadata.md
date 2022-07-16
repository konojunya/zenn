---
title: "クリエイティブの作成と、メタデータの JSON を作成"
---

## クリエイティブの作成

まず最初に行わないといけないのは、クリエイティブの作成です。昨今の NFT はとてもクリエイティブ力の高い作品も多数でてきました。今回は p5.js を使って雑にそれっぽいクリエイティブを作成します。

![](https://storage.googleapis.com/zenn-user-upload/485c5c3814cd-20220716.png)

この実装自体は、p5.js の実装を深堀することになるため割愛しますが、実装した JavaScript だけ載せておきます。

https://github.com/konojunya/CreativeCert/blob/main/creative/main.js

プロジェクトのルートに `public` フォルダを作成して、 `public/images/1.png` として保存しておきましょう。

> This is the URL to the image of the item. Can be just about any type of image (including SVGs, which will be cached into PNGs by OpenSea), and can be IPFS URLs or paths. We recommend using a 350 x 350 image.

また、この画像の大きさは `350 x 350` が推奨と [OpenSea](https://docs.opensea.io/docs/metadata-standards#:~:text=these%20properties%20work%3A-,image,-This%20is%20the) のガイドラインに書かれています。そのため推奨サイズにトリミングしておきましょう。

## メタデータの作成

次にメタデータの作成を行います。メタデータの format も [Metadata Standards | OpenSea](https://docs.opensea.io/docs/metadata-standards) に記載されているので詳しく見たい方はこちらを参照してください。

今回は

- image
- description
- name
- attributes

をサポートしてみます。

`public/meta/1.json` というファイルを作成し、上記のキーを埋めていきます。

```json
{
  "name": "CreativeCert #1",
  "description": "CreativeCert is an experimental project to verify the use of NFT as a security key",
  "image": "<firebase deploy site origin>/image/1.png",
  "attributes": [
    {
      "trait_type": "Artist",
      "value": "JJ"
    },
    {
      "trait_type": "Design",
      "value": "Houndstooth"
    }
  ]
}
```

ここまで出来たら firebase に先にデプロイしておきましょう。

```shell
$ firebase deploy
```

`https://<firebase-project>.web.app/image/1.png` と `https://<firebase-project>.web.app/image/1.json` にアクセスしてそれぞれ中が閲覧できる状態になっているか確認しておいてください。
