---
title: "IROIRO Remixを支える技術"
emoji: "💫"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["nft"]
published: false
publication_name: "microverse_dev"
---

# IROIRO とは？

万国共通で楽しめる「色」というコンセプトを元に、NFT プロジェクトを通じて、日本のイラスト文化、クリエイターの世界進出を目指すプロジェクトです。

https://www.iroiro.world

## ジェネレート

![](https://storage.googleapis.com/zenn-user-upload/d6e8b2804584-20230831.jpg)

NFT のプロジェクトでは色んな手法で NFT の画像自体の生成を行なっています。IROIRO では一般的な最も一般的な方法ですがレイヤー別に切り出した各パーツを組み合わせることで数千のパターン数の画像の生成をしています。

![](https://storage.googleapis.com/zenn-user-upload/3f520ca2020f-20230831.png)

IROIRO も Figma で見るとこのようになっています。同じように OpenSea の属性にもある程度反映されています。

microverse では、 `node-canvas` を用いてこれらの画像のパーツから NFT の画像となるものを生成しています。スクリプトは [hashlips_art_engine](https://github.com/HashLips/hashlips_art_engine) というオープンソースを参考に、実装しています。

画像の生成ですが、かなりマシンパワーを使いパーツもそれぞれ 1,000 x 1,000 のように大きいため生成後の画像だけでもかなりディスク容量を圧迫してしまいます。microverse では、この問題がとても大きかったため将来的には NFT の画像の生成をクラウドで行えるように調整したいと思っています。

## コントラクト

コントラクトの実装は uwu labs の [kiwi](https://twitter.com/0xKiwi_) さんにお願いしました。

https://uwulabs.com/

インタビュー形式で今回の IROIRO Remix について回答をいただいたので紹介します。

- Q1: 契約の設計に関して気をつけたことはありますか？
  A: 将来、簡単に運用できるようコントラクト設計の柔軟性にこだわりました。また、複雑さを軽減し、コードを監査しやすい状態に保つため、どうすれば最も効果的にスマートコントラクトを分割できるかなといつも考えています。

- Q2: 技術的な工夫はありますか？
  A2: 最大のイノベーションは、各リミックスの ID に式神 ID + Origin IROIRO + Remix Choice を記録する方法でした。 これによりメタデータのホスティングが容易になり、全体的なチェックを簡単にできるようになります。またガス使用量の削減され、よりシンプルで安全なコードになります。 このコードは、式神の購入とリミックスのための https://delegate.cash/ 経由の委譲もサポートしています。

- Q3: 契約設計や実装で気をつけている点はありますか？
  Q4: 私は開発する対象を 3 つの異なるコントラクトに分割しました。 NFT 関連の部分は変更される可能性が最も低いため、重要なロジックだけ残しました。セールコントラクトは、新しいタイプの販売形式が必要な場合に、将来的に販売構成を簡単に変更できるよう切り分けて作成しました。 また、メタデータサーバーの複雑さを軽減し、リミックス結果が一枚一枚ユニークで異なるものになるように、リミックスを再現するためのすべてのデータをオンチェーンに配置しました。

- Q4: Dapps 開発者に伝えたいことはありますか？
  A4: むやみに 1 つのコントラクトにロジックを多重定義したり、不必要なコントラクト間に接続を作成したりしていないか、注意してみましょう。 すべての式神が同じ方法で販売される想定なので、セールコントラクトに式神のロジックをさらに追加したり、式神 NFT コントラクト自体に販売ロジックを追加すればいいと考える人もいるでしょう。しかしこのやり方では、NFT がセールコントラクトに過度に依存したり、予期せぬロジックのギャップが発生しないように慎重な検討が必要になったりする可能性があります。他のコントラクトとの関係やコード自体の重要性に基づいてロジックをいくつかのコントラクトに分割することで、複雑なアプリケーションを作成しつつ、読みやすくシンプルで堅牢なスマートコントラクトのコードを維持できます 😄

## トップページ

今回のトップページ、Remix ページはどちらも [Chakra UI](https://chakra-ui.com/) を用いています。アニメーション周りは主に [framer-motion](https://www.framer.com/motion/) での実装になります。

[![shikigami animation](https://i.gyazo.com/dcbd528e8ad66cc868edcd55d5268ffc.gif)](https://gyazo.com/dcbd528e8ad66cc868edcd55d5268ffc)

背景には星空が浮かんでいるような情景を実装していますが、ここは canvas での実装になります。その上からグラデーションがかかった background-image をかぶせて夜空にしています。

[![Image from Gyazo](https://i.gyazo.com/d5636c2689c1be4f66e62af0f1336b90.gif)](https://gyazo.com/d5636c2689c1be4f66e62af0f1336b90)

色神は、スクロールに応じて左右にも少し移動します。これをレスポンシブで扱うために [useBreakpointValue](https://chakra-ui.com/docs/hooks/use-breakpoint-value) を用いて宣言的に Breakpoint 毎に位置を指定しています。

```ts
const responsiveShikigamiXOutput = useBreakpointValue({
  base: ["0%", "-50%", "-50%", "35%", "35%", "0%"],
  lg: ["0%", "-38%", "-38%", "22%", "22%", "0%"],
  xl: ["0%", "-38%", "-38%", "22%", "22%", "0%"],
  "2xl": ["0%", "-38%", "-38%", "22%", "22%", "0%"],
});
```

さらに下へスクロールすると、キューティーハニーに対して色神が張り付くようなアニメーションになっています。ここはリッチに演出したいので、動画で行います。しかしその後も色神が下へスクロールするため、DOM から削除したり見えなくしたりしたままだとアニメーションが続いてるように見えません。そのため、サイズをなるべく合わせて再度色神を出現させてその後のアニメーションを行わせています。

[![Image from Gyazo](https://i.gyazo.com/fc5efa3efe23a4674607c0aca9855ee1.gif)](https://gyazo.com/fc5efa3efe23a4674607c0aca9855ee1)

この際に、動画ファイルを `video` で埋め込んでいますが video は iOS の省電力モードなどの際に `video.play()` の Promise が rejected になります。

このため以下のように try-catch をするなりして fallback を用意しなければなりません。

```tsx
try {
  await videoRef.play();
} catch (e) {
  // video が自動再生できなかった場合の fallback
}
```

今回は、この動画の再生時間だけユーザーのスクロールをブロックしている処理が存在しますがそこをスキップさせることで、不快感を与えないように実装しました。

また CSS Animation の際にはいくつか気を付けることがありますが web.dev の [animations guide](https://web.dev/animations-guide) を読むとよいでしょう。例えば `top`, `left` を使って要素の位置を指定するのではなく、 `translate` を使って実装する例を挙げます。

![](https://storage.googleapis.com/zenn-user-upload/aa239e1f1071-20230831.jpeg)

top や left と translate ではレンダリングの、どのステージからやり直すのかが異なります。

例えば top, left を使って実装をした場合は、 `Layout` からやり直すのに対して、translate を使って実装をした場合は、 `Composite` だけを再度行うだけになりパフォーマンスが良い実装と言えます。

![](https://web-dev.imgix.net/image/admin/cMNQR2jBEwa6ku5POXtZ.jpg?auto=format&w=845)

![](https://web-dev.imgix.net/image/admin/3bn44P9h6lR93uBNRXY3.jpg?auto=format&w=845)

詳しくはこちらを見ると良いでしょう。

https://web.dev/animations-guide/#layout

## Remix

![ogp](https://shikigami.iroiro.world/cutiehoney_remix_ogp.png)

今回の 1st コラボレーションはキューティーハニーのコラボになっており色神の販売と REMIX を Remix ページで行なっています。セールでは、NFT プロジェクトではよくプライベートセールとパブリックセールと言われる 2 段階以上のセールフェーズを設けます。一般的にプライベートセールではパブリックセールに比べて安めの値段で買うことができたり、何か追加の特典があったりします。

REMIX では IROIRO のホルダーを事前にリストアップしておいてその保有数などを加味したリストを作成しています。このリストに入ってる人はプライベートセールで新しい NFT を買うことができます。

Remix ページではデジタルウォレットとの接続に [thirdweb](https://thirdweb.com/) を使っています。thirdweb sdk を使うことで React の便利な hooks を活用して実装できます。例えば contract への色神の購入は以下のようなコードになります。

### 色神セール

```ts
const buyShikigami = async (amount: number) => {
  /**
   * Private Sale: 0.02 ETH / 1 shikigami
   * Public Sale: 0.04 ETH / 1 shikigami
   */
  const cost = state.price * amount;
  const value = ethers.utils.parseEther(String(cost));
  const contract = await shikigamiSaleContract;

  await contract.call(
    "buyShikigami",
    [args.shikigamiId, amount, data.proof, data.value],
    { value }
  );
};
```

`shikigamiSaleContract` は thirdweb sdk の [sdk.getContract](https://portal.thirdweb.com/typescript/sdk.thirdwebsdk.smartcontract) を使って実装しています。hooks を使いたい場合は [useContract](https://portal.thirdweb.com/react/react.usecontract) を使うのがよいでしょう。今回のコード上は、様々なコントラクトがでてくるため hooks でやるよりも TypeScript SDK を直接使った方が柔軟にこちらの設計に合わせて実装できるメリットがあったため、直接 sdk を使ったコードになっています。

`buyShikigami` の引数にある `data.proof` が先ほど出てきたホルダーのリストを指しています。一般的に実装が分かりやすく、汎用性も高い MerkleTree をよく使います。MerkleTree の実装は以下のような utility を作ることで使い勝手が良く、 unit test も書けるので好ましいでしょう。

```ts
import { MerkleTree } from "merkletreejs";
import keccak256 from "keccak256";
import whiteList from "@_generated/al";
import { utils } from "ethers";

export function encodePacked(type: readonly string[], value: any[]) {
  return utils.solidityPack(type, value);
}

const leafNodes = whiteList.map((x) =>
  keccak256(encodePacked(["address", "uint256"], [x.address, x.maxMint]))
);

export const merkleTree = new MerkleTree(leafNodes, keccak256, {
  sortPairs: true,
});

export function getRoot() {
  return merkleTree.getHexRoot();
}

export function getMaxMintByAddress(address: string) {
  return (
    whiteList.find(
      (x) => x.address.toLocaleLowerCase() === address.toLocaleLowerCase()
    )?.maxMint ?? 0
  );
}

export function getProof(address: string) {
  const maxMint = getMaxMintByAddress(address);
  const leafIndex = merkleTree.getLeafIndex(
    keccak256(encodePacked(["address", "uint256"], [address, maxMint]))
  );
  const leaf = merkleTree.getLeaf(leafIndex);
  const proof = merkleTree.getHexProof(leaf);

  return proof;
}
```

whileList はオンチェーンの情報を持ってくるため `_generated` に対してホルダー情報をダウンロードするスクリプトを書いておくと便利です。MerkleTree はコントラクト側に root hash を書き込むためクライアント側も頻繁に書き換えるモノではないです。また csv や json で管理されるのがほとんどですが、これらはプロジェクトの規模によってもファイルサイズとして少し大きなものになりがちです。そのため、フロントエンドの chunk には含めたくないので API Route で API として提供する形にしました。ただユーザーのウォレットアドレスを path に入れてもらって API をコールしますが書き換えが頻繁ではないので、cache-control は攻め気味なものを付けることができます。

今回 proof は `Cache-Control: public, max-age=3600, immutable, stale-if-error=60` としました。cache-control の immutable に関しては [jxck さんのブログ](https://blog.jxck.io/entries/2016-07-12/cache-control-immutable.html)が参考になりました。

proof 以外にも IROIRO の NFT の情報自体などは [Alchemy](https://www.alchemy.com/nft-api) の NFT API を用いて実装していますが、このリクエストを減らすのと API Key が外部に露出しないように API Route で wrap して cache-control を適切につけています。

### Remix の実装

色神を使って新しい IROIRO を作ることを [Remix](https://etherscan.io/address/0x07493f6d027de62a9a84d1f6359c85f66d55ff70) と呼んでいます。コントラクトでは色神の burn と新しい IROIRO の mint を同時に行います。

![](https://storage.googleapis.com/zenn-user-upload/8636955854e6-20230904.png)

```solidity
function remixIROIROWithShikigami(uint256 shikigamiId, uint256 iroiroId, uint256 choice, address vault) external returns(uint256) {
  uint iroiroRemixId = constructRemixId(shikigamiId,iroiroId,choice); // Creates ID for IROIRORemix by calling constructRemixId

  require(mintActive, "Mint is not active!");
  require(!_exists(iroiroRemixId), "You've already remixed this IROIRO with this Shikigami!"); // Checks if already minted

  // Check for delegation
  if (vault == address(0)) {
      vault = msg.sender;
  } else {
      require(registry.checkDelegateForContract(msg.sender, vault, address(this)), "Sender is not delegated!"); // Checks delegation
  }

  require(vault == iroiro.ownerOf(iroiroId), "Ownership of IROIRO Id is not confirmed!"); // Checks IROIRO ownership

  shikigami.burnShikigami(vault, shikigamiId, choice); // Burns one Shikigami of shikigamiId
  _mint(vault, iroiroRemixId); // Mints one IROIRORemix

  emit IROIRORemixed(shikigamiId, iroiroId,  choice, iroiroRemixId);
  return iroiroRemixId;
}
```

コントラクトのコールは上記と同じ実装で行いますが、今回は remix する前の段階で remix 後どんなクリエイティブになるのかを見せています。ユーザーは自分の好きな方を選んで mint 可能になります。

![](https://storage.googleapis.com/zenn-user-upload/1a58ed67bea9-20230904.png)

この際に、NFT の画像は IPFS という分散ストレージにアップロードするのがよいとされてるものが多いでしょう。ただし IPFS はデータの保存に対して強いですが表示したりするのに専用のプロトコルを使うため一般的には gateway と言われるサーバーを介してアクセスすることがほとんどでしょう。IROIRO ではこの選択肢の画像は GCP のサーバーにおいておき、NFT の image には IPFS のアドレスを指すような設計にして gateway を挟まなくてもよいようにしました。gateway は色々なサービスが存在しますが、我らが（？）Cloudflare もだしてくれています。

https://developers.cloudflare.com/web3#ipfs-gateway

proof の取得などは [swr](https://swr.vercel.app/ja) を使っていますが、取得したデータに対して何か特殊な変更をしてそれをグローバルステートへ入れたい場合少し困りました。変更するだけであれば custom hooks の中などで `return` する前に変更するだけで問題ないですが、グローバルステートにいれたいとなるとデータが変わった時だけを扱いたいので [`onSuccess`](https://swr.vercel.app/ja/docs/mutation.ja#useswrmutation-parameters) を活用しました。`useEffect` で値を見ておくことはできるのですが、[escape hatches](https://react.dev/learn/escape-hatches#you-might-not-need-an-effect) の中で紹介されてる通り避けた方がよいでしょう。

# Collaborator 🤝

この記事は様々な方の貢献により寄稿できました。

## [kiwi.eth](https://twitter.com/0xKiwi_/photo)

![kiwi icon](https://i.seadn.io/gcs/files/52da1f847f222edf5d3e7b7d7fd056f3.png?auto=format&dpr=2&w=800)

Hi! I'm Kiwi!
I've been a dev in crypto since falling in love with Ethereum in 2017, I even worked for Ethereum towards the Proof of Stake and Merge effort for 2 years!
Nowadays I work closely with hundreds of anime artists as a I lead the teams of uwucrew and Killer GF.
I'm a huge fan of anime art and believe collecting anime art is something every anime fan can truly enjoy!

IROIRO Remix ではコントラクトの実装を担当していただき、記事ではコントラクトの設計についてインタビューさせていただきました。

## [じょあんな-Joanna- @web3 お姉さん](https://twitter.com/aonisai_natuki)

![joanna icon](https://i.seadn.io/gcs/files/39edb50ed019572a119f4cb0ba826bb5.png?auto=format&dpr=2&w=800)

IROIRO のコラボマネージャー。

複数の人気 NFT プロジェクトの運営に携わり、英語・中国語を生かした海外ファンとのコミュニケーションを得意とする。

本記事の和訳を担当していただきました。
