---
title: "コントラクトの作成"
---

## 事前準備

いよいよここから Web3.0 っぽい実装が増えてきます。まず最初にスマートコントラクトの作成をします。有名なのは [hardhat](https://hardhat.org/) などを使って開発していく方法っぽいですが、最近使っている [foundry](https://book.getfoundry.sh/) を使って実装していきたいと思います。

https://github.com/foundry-rs/foundry

また、この記事を作成するにあたり foundry の記事で以下の記事がとても参考になったので是非読んでください。

https://zenn.dev/razokulover/articles/574eb471e6db1c

とりあえず foundry でプロジェクトを作成します。

```shell
$ forge init contract --no-commit
```

ルートディレクトリに `contract/` というフォルダが生まれてきたと思います。こちらの中を使って実装していきます。

とりあえずサンプルの Solidity のビルドとテストを実行してみましょう。

```shell
$ forge build
```

![](https://storage.googleapis.com/zenn-user-upload/0c56d65ea111-20220716.png)

```shell
$ forge test
```

![](https://storage.googleapis.com/zenn-user-upload/5d5c877af3fd-20220716.png)

## コントラクトを書いていく

まず使う依存のインストールをしましょう。

```shell
$ forge install Rari-Capital/solmate Openzeppelin/openzeppelin-contracts
```

インストールできたら早速コードを書いていきます。Solidity に関して、僕自身がまだまだ実装慣れしてないのもありますが
