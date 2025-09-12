---
title: "Cloudflare Zero Trust で Worker を保護する"
emoji: "🐙"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["cloudflare", "zerotrust", "terraform"]
published: true
---

# モチベーション

社内の人向けや、外部の関係者に対してだけ特定の Web ページを見せたいような要件に対して Cloudflare Zero Trust で保護をしたいタイミングがあり、とても便利でしたが体系的な記事が少ないように思えるので執筆します。

## 対象読者

- 特定の Worker を invoke できる人を管理したい
- Zero Trust を使ってみたい
- Terraform で管理したい

# 準備

## Clouflare Zero Trust のチーム作成

Cloudflare Zero Trust のチームを作成しておきます。Cloudflare で初めて Zero Trust へアクセスした場合に `.cloudflareaccess.com` のサブドメインを決められるページにきてプランの設定などを行います。

![](https://storage.googleapis.com/zenn-user-upload/2d8ae812712e-20250912.png)

ここで設定したサブドメインは次の GitHub OAuth App で使います。

## GitHub OAuth App の作成

GitHub でログインできるように GitHub OAuth Apps を作成しておきましょう。

personal: `https://github.com/settings/applications/new`
organization: `https://github.com/organizations/<org>/settings/applications/new`

上記の URL で作成ができます。

```
personal: settings -> Developer settings -> OAuth Apps -> New OAuth App
organization: settings -> Developer settings -> OAuth Apps -> New OAuth app
```

今回は personal で話を進めます。

Authorization callback URL は上記、 Cloudflare Zero Trust のチームを作成した際のサブドメインを用いて以下のように設定します。

```
https://<your team id>.cloudflareaccess.com/cdn-cgi/access/callback
```

![](https://storage.googleapis.com/zenn-user-upload/95ff902b3d86-20250912.png)

その先のページの `Client ID` と `Client secrets` は手元で保存をしておきましょう。後ほど、 Terraform で Zero Trust のポリシーを作成する際に使います。

![](https://storage.googleapis.com/zenn-user-upload/9376cb2d6727-20250912.png)

# 実装

1. 簡単な worker を実装
2. terraform で zero trust application の追加
3. policy の設定

## worker を実装

今回、GitHub でログインした後に見ることのできるアプリケーションを適当に用意します。

```shell
bun create hono@latest
bun run deploy
```

![](https://storage.googleapis.com/zenn-user-upload/cb6552834526-20250912.png)

worker がデプロイされたら、一旦アクセスしてみましょう。

![](https://storage.googleapis.com/zenn-user-upload/e9cae904a218-20250912.png)

「Hello Hono!」とレスポンスされたら成功です。

## Terraform で構築する

まずは tfstate を管理する R2 bucket を作成します。

![](https://storage.googleapis.com/zenn-user-upload/dcfb36c0f2e3-20250912.png)

API Token を作成しましょう。カスタムトークンを作成し、適切な権限を付与していきます。

```
プロフィール -> API トークン -> トークンを作成する
```

![](https://storage.googleapis.com/zenn-user-upload/b10a5ea362be-20250912.png)

以下の権限を付与してください。

|service|permission|
|:--|:-:|
|Workers R2 Storage|Edit|
|Workers Script|Edit|
|Zero Trust|Edit|
|Access: Apps and Policy|Edit|
|Access: Organizations, Identity Providers, and Groups|Edit|

作成するアカウントを「アカウントリソース」の中で含めていることを確認してください。

![](https://storage.googleapis.com/zenn-user-upload/50eb493e4252-20250912.png)

この API Token では、 R2 の Access Key や Secret が表示されないので R2 側で設定をします。

R2 のページに帰ってきたら、「API トークンの管理」を押して進みます。「ユーザー API トークン」の欄に先ほど作った API Token が並んでいることを確認してください。

![](https://storage.googleapis.com/zenn-user-upload/34e94c5e2a40-20250912.png)

![](https://storage.googleapis.com/zenn-user-upload/9f1115c5c0ad-20250912.png)

![](https://storage.googleapis.com/zenn-user-upload/7518bad3ee51-20250912.png)

そうすると以下のようなページに切り替わり、トークン自体の他に S3 Client のアクセスキーやシークレット、エンドポイントが表示されるのでコピーしてメモしておきます。

![](https://storage.googleapis.com/zenn-user-upload/2bef886ad6f9-20250912.png)

### main.tf

まず `main.tf` を作成します。ここでは provider や version の設定を一気にやります。

```tf:main.tf
terraform {
  required_version = "1.12.2"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5"
    }
  }

  backend "s3" {
    endpoints = {
      s3 = ""
    }
    bucket                      = "zero-trust-example"
    key                         = "terraform.tfstate"
    region                      = "us-east-1"
    skip_credentials_validation = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
  }
}

provider "cloudflare" {
}

locals {
  account_id = "<your account id>"
}
```

環境変数も設定します。筆者の環境では direnv を使っているため direnv を用いて、 shell に流し込みます。

`AWS_ACCOUNT_ID` と `CLOUDFLARE_ACCOUNT_ID` はどちらも Worker のページなどでみれる「アカウント ID」を入れてください。

```env
AWS_ACCOUNT_ID=<your account id>
AWS_ACCESS_KEY_ID=c88b15d0bab88ece4b67762342027fec
AWS_SECRET_ACCESS_KEY=34ef2511cb2c88b6d992a6998c0ba2de542673d52de9ee672a9f00429536571c
CLOUDFLARE_ACCOUNT_ID=<your account id>
CLOUDFLARE_API_TOKEN=Xba4WyCD_okHLftHGfejRDQQHSGoLa6gu0RRVwsl
```

ここまで設定したら terraform init で初期化します。

```shell
terraform init
```

![](https://storage.googleapis.com/zenn-user-upload/c176258813f5-20250912.png)

### R2 の import

手動で作成しておいた R2 も同じように Terraform で管理するために import を行います。

https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs/resources/r2_bucket

```tf:r2.tf
resource "cloudflare_r2_bucket" "tfstate" {
    account_id    = local.account_id
    name          = "zero-trust-example"
}
```

```shell
terraform import cloudflare_r2_bucket.tfstate '<account_id>/zero-trust-example/default'
```

import が成功すると `terraform plan` で No Changes. と表示されます。

![](https://storage.googleapis.com/zenn-user-upload/00d14960fe7d-20250912.png)

### Zero Trust

では Zero Trust のリソースを作ります。IdP の作成、アプリケーションの作成、ポリシーの作成します。

#### IdP

まずは Identity Provider として GitHub を追加します。

https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs/resources/zero_trust_access_identity_provider

`main.tf` に `github_client_id` と `github_client_secret` を増やしてコマンド実行時、`TF_VAR_` prefix をつけて環境変数から指定します。

```tf:main.tf
variable "github_client_id" {
  type = string
}

variable "github_client_secret" {
  type = string
}
```

IdP の設定は以下のようにし、 config に client_id, client_secret を `var.github_client_id` のように渡します。

```tf:zero_trust.tf
resource "cloudflare_zero_trust_access_identity_provider" "github" {
    name = "github"
    account_id = local.account_id
    type = "github"
    config = {
        client_id = var.github_client_id
        client_secret = var.github_client_secret
    }
}
```

Terraform の実装を終えたら、 apply しましょう。 `TF_VAR_` を含んで実行することを忘れずにしてください。

```shell
TF_VAR_github_client_id=<github client id>
TF_VAR_github_client_secret=<github client secret>

terraform apply
```

![](https://storage.googleapis.com/zenn-user-upload/83a4e30147c4-20250912.png)

ここまできたら、 Zero Trust のページの設定 -> 認証を開くと `GitHub・github` が追加されているので、「テスト」というリンクをクリックしてうまく GitHub OAuth App とつながっているかを確認します。

![](https://storage.googleapis.com/zenn-user-upload/9a99a15a09f6-20250912.png)

うまく連携できていれば、以下のようによく見る OAuth の画面になります。

![](https://storage.googleapis.com/zenn-user-upload/396fe83d9875-20250912.png)

#### Zero Trust Application and Policy

https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs/resources/zero_trust_access_application

最後に Application とポリシーを作成して worker を保護します。

まず `main.tf` に許可するユーザーの GitHub に使っている Email を列挙しておきます。

```tf:main.tf
locals {
    allowed_users = [
        "許可したい人の GitHub のメールアドレス"
    ]
}
```

社内の人だけアクセスすると仮定する場合、 Google Workspace の domain や、特定の GitHub の org に所属している人に絞ることができます。今回は簡単にメールアドレスでのマッチングにします。

```tf:zero_trust.tf
resource "cloudflare_zero_trust_access_policy" "employee" {
  name             = "employee"
  account_id       = local.account_id
  decision         = "allow"
  session_duration = "6h"

  include = [
    for account in local.allowed_users : {
      email = {
        email = account
      }
    }
  ]
}
```

最後に Zero Trust Application を作成します。

domain には先ほどデプロイしておいた worker のドメインを記述しておきます。

```tf:zero_trust.tf
resource "cloudflare_zero_trust_access_application" "zero-trust-example" {
  name         = "zero trust example"
  account_id   = local.account_id
  allowed_idps = [cloudflare_zero_trust_access_identity_provider.github.id]
  type         = "self_hosted"

  policies = [{
    id         = cloudflare_zero_trust_access_policy.employee.id
    precedence = 1
  }]

  domain = "zero-trust-with-github.works-b49.workers.dev"
}
```

## アクセス制限できているか確認する

では、 worker のドメインにアクセスしてみます。すると worker の保護がされていて、 GitHub アカウントでログインすると認証の対象ユーザーであれば Hello Hono! のページへまた帰ってくるのが確認できます。

![](https://storage.googleapis.com/zenn-user-upload/c7493ca0820d-20250913.png)

![](https://storage.googleapis.com/zenn-user-upload/0117b04b1559-20250913.png)
