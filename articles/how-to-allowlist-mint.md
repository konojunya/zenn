---
title: "AllowList を用いた NFT の mint"
emoji: "🌲"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["nft", "merkletree"]
published: true
---

NFT Project ではよく「特定のアドレスの人だけが実行できる関数」を実装したくなります。例えば別のプロジェクトの NFT を保持してる人だけにこの NFT を mint させたいなどです。今回はこのユースケースをマークルツリーを使って実装したいと思います。

なお、マークルツリー自体は暗号理論において有名なものなのでこの記事の中では実装例を主に記述します。

マークルツリーについては以下の記事などを参考にしてください。

https://zenn.dev/sakuracase/articles/4f58609f3da6e8

（少し脱線）またユースケースとして特定の NFT を持ってる人のアドレス一覧をとる、スナップショットと言われるものを簡単にできるようにした cli もあるので是非活用してみてください。この snapshot-cli では全ホルダーの一覧だけでなく、特定のアトリビューションを持ってる人別に csv を吐き出す機能などもあります。

https://github.com/microverse-dev/snapshot-cli

# Contract の実装

まずはコントラクトの実装をします。今回は AllowList の部分を実装できれば良いので openzeppelin の ERC721URIStorage を継承し NFT を mint する `mint` 関数と、マークルツリーのハッシュ値を更新するための `setMerkleRoot` 関数だけ実装をします。

まずは単純な ERC721 を実装します。

```sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract MyERC721 is ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    constructor() ERC721("MyERC721", "MY721") {}

    function mint() public payable returns (uint256) {
        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();
        _mint(msg.sender, newTokenId);
        return newTokenId;
    }
}
```

mint 関数にて `ERC721URIStorage` の `_mint` を叩いています。これだけで mint をすることは可能ですね。

ではこの mint 関数を特定の人だけが叩ける関数へ実装を変更します。まず import 部で `@openzeppelin/contracts/utils/cryptography/MerkleProof.sol` と `@openzeppelin/contracts/access/Ownable.sol` を import してきます。

```diff
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
+ import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
+ import "@openzeppelin/contracts/access/Ownable.sol";
```

Ownable は ownership を持っているアドレスからしかその関数を叩けなくするものです。今回の場合、マークルツリーの hash をコントラクトに渡して更新をしますが、その更新が誰でも行えてしまうと自分自身を AllowList にいれることが可能になってしまい危険です。

ではまず Ownable をコントラクトに継承させます。

```diff
+ contract MyERC721 is ERC721URIStorage, Ownable {
```

続いてマークルツリーの RootHash を保持するための変数を用意します。このように変数を持って後から setter を実装しなくても要件を達成することはできますが一度デプロイしたコントラクトの中を新しい hash に変えることができなくなるため、運用上で後から漏れていた人を AllowList に追加するなどができなくなります。

```diff
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;
+   bytes32 public merkleRoot;

    constructor() ERC721("MyERC721", "MY721") {}
```

続いてこの変数に対してマークルルートを代入する setter を書きます。

```sol
function setMerkleRoot(bytes32 _merkleRoot) public onlyOwner {
    merkleRoot = _merkleRoot;
}
```

では mint 関数を AllowList の人だけが実行できる形に修正します。

```diff
function mint(
+   bytes32[] calldata _merkleProof
) public payable returns (uint256) {
+   bytes32 leaf = keccak256(abi.encodePacked(msg.sender));
+   require(
+       MerkleProof.verify(_merkleProof, merkleRoot, leaf),
+       "Invalid proof"
+   );

    _tokenIds.increment();
    uint256 newTokenId = _tokenIds.current();
    _mint(msg.sender, newTokenId);
    return newTokenId;
}
```

まず引数にはフロントエンドから渡された merkleProof を取ります。この merkleProof とコントラクトの持つ merkleRoot から caller が AllowList にいるユーザーなのかを判断します。

# テストコードで挙動の確認をする

単純なテストのためテストコードを以下に展開します。

```ts
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai, { expect } from "chai";
import ChaiAsPromised from "chai-as-promised";
import { ethers } from "hardhat";
import keccak256 from "keccak256";
import { MerkleTree } from "merkletreejs";
import type { MyERC721 } from "../typechain-types";

chai.use(ChaiAsPromised);

describe("MyERC721", () => {
  it("mint", async () => {
    const deployContractFixture = async () => {
      return await ethers.deployContract("MyERC721");
    };

    const [owner, allowListedUser, notListedUser] = await ethers.getSigners();
    const allowList = [allowListedUser.address];
    const contract = (await loadFixture(deployContractFixture)) as MyERC721;
    const merkleTree = new MerkleTree(allowList.map(keccak256), keccak256, {
      sortPairs: true,
    });
    const hexProof = merkleTree.getHexProof(keccak256(allowListedUser.address));
    const rootHash = merkleTree.getRoot();

    await contract
      .connect(owner)
      .setMerkleRoot(`0x${rootHash.toString("hex")}`);

    // setMerkleRoot が onlyOwner であるテスト
    await expect(
      contract
        .connect(notListedUser)
        .setMerkleRoot(`0x${rootHash.toString("hex")}`)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    // 現状の balance をテスト
    expect(await contract.balanceOf(allowListedUser.address)).to.be.equal(
      BigInt(0)
    );
    expect(await contract.balanceOf(notListedUser.address)).to.be.equal(
      BigInt(0)
    );

    // mint 関数の call をテスト
    await contract.connect(allowListedUser).mint(hexProof);
    await expect(
      contract.connect(notListedUser).mint(hexProof)
    ).to.be.revertedWith("Invalid proof");

    // mint後の balance をテスト
    expect(await contract.balanceOf(allowListedUser.address)).to.be.equal(
      BigInt(1)
    );
    expect(await contract.balanceOf(notListedUser.address)).to.be.equal(
      BigInt(0)
    );
  });
});
```

上から順番にコードを追っていきましょう。

まず hardhat/ethers から signer を取ります。今回は 1 つ目がコントラクトのデプロイアドレス、2 つ目が AllowList にはいってるユーザー、3 つ目がはいってないユーザーとします。

```ts
const [owner, allowListedUser, notListedUser] = await ethers.getSigners();
```

AllowList を作ります。

```ts
const allowList = [allowListedUser.address];
```

マークルツリーの構築を行います。

```ts
const merkleTree = new MerkleTree(allowList.map(keccak256), keccak256, {
  sortPairs: true,
});
```

今回、単純なアドレスのリストを AllowList にしていますが、もしその中でもこの人は max 1 つしか mint できない。などアドレス別に登録しておきたい情報がある場合は `allowList.map(keccak256)` の map の中で単純にアドレスに対して keccak256 をあてるだけでなく amount などの情報も含めて keccak256 を当てるようにする必要があります。

次に hexProof を作ります。これは特定のアドレスの hex を取得しこれをコントラクトの mint 関数にいれることでコントラクト側でこのユーザーが AllowList にあるかどうかを計算します。

```ts
const hexProof = merkleTree.getHexProof(keccak256(allowListedUser.address));
```

次にこのマークルツリーの一番上になる Root を取得します。この値をコントラクトの変数として持たせます。

```ts
const rootHash = merkleTree.getRoot();
```

では実際に実装しておいた `setMerkleRoot` を call し、 `rootHash` を登録しましょう。

```ts
await contract.connect(owner).setMerkleRoot(`0x${rootHash.toString("hex")}`);
```

この関数は onlyOwner なので、念の為別の signer が `setMerkleRoot` を実行できないかどうかをテストします。

```ts
await expect(
  contract.connect(notListedUser).setMerkleRoot(`0x${rootHash.toString("hex")}`)
).to.be.revertedWith("Ownable: caller is not the owner");
```

では mint をしてみましょう。 `allowListedUser` は AllowList にあるので mint できますが `notListedUser` は AllowList として登録してないので mint できないはずです。
それぞれの NFT の保有数を見ながらテストコードを書きます。

```ts
// 現状の balance をテスト
expect(await contract.balanceOf(allowListedUser.address)).to.be.equal(
  BigInt(0)
);
expect(await contract.balanceOf(notListedUser.address)).to.be.equal(BigInt(0));

// mint 関数の call をテスト
await contract.connect(allowListedUser).mint(hexProof);
await expect(contract.connect(notListedUser).mint(hexProof)).to.be.revertedWith(
  "Invalid proof"
);

// mint後の balance をテスト
expect(await contract.balanceOf(allowListedUser.address)).to.be.equal(
  BigInt(1)
);
expect(await contract.balanceOf(notListedUser.address)).to.be.equal(BigInt(0));
```

ここまでテストコードを実装したらテストを実行してみましょう。

![](https://storage.googleapis.com/zenn-user-upload/a39945279864-20230517.png)

見事 pass しました！

# Outro

今回のコントラクト、テストコードは全て GitHub にあげているのでそちらをみてください。

https://github.com/konojunya/zenn/tree/main/examples/how-to-allowlist-mint
