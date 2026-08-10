---
title: "Cloudflare Zero Trust で Worker を保護する"
emoji: "🐙"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["cloudflare", "zerotrust", "terraform"]
published: true
---
社内や外部の関係者だけに Worker のページを見せたいとき、Cloudflare Access を使うとアプリケーション側へ認証を実装せずにアクセスを制限できます。
今回は GitHub を Identity Provider にして、許可するユーザーと Worker を Terraform で管理します。

# GitHub ログインを用意する

## Cloudflare Zero Trust のチームを作る

Cloudflare Zero Trust を初めて開くと、`.cloudflareaccess.com` で使うチームドメインとプランを設定する画面が表示されます。

![](https://storage.googleapis.com/zenn-user-upload/2d8ae812712e-20250912.png)

ここで設定したサブドメインは次の GitHub OAuth App で使います。

## GitHub OAuth App の作成

GitHub でログインできるように GitHub OAuth App を作成します。

personal: `https://github.com/settings/applications/new`
organization: `https://github.com/organizations/<org>/settings/applications/new`

設定画面から作成する場合は次の場所です。

```
personal: settings -> Developer settings -> OAuth Apps -> New OAuth App
organization: settings -> Developer settings -> OAuth Apps -> New OAuth app
```

今回は個人アカウントに作成します。

Authorization callback URL には、先ほど決めたチームドメインを使います。

```
https://<your team id>.cloudflareaccess.com/cdn-cgi/access/callback
```

![](https://storage.googleapis.com/zenn-user-upload/95ff902b3d86-20250912.png)

作成後に表示される `Client ID` と `Client secret` は、後ほど Terraform から Identity Provider を作るときに使います。

![](https://storage.googleapis.com/zenn-user-upload/9376cb2d6727-20250912.png)

# 保護する Worker を用意する

GitHub でログインした後に表示する Worker を Hono で用意します。

```shell
bun create hono@latest
bun run deploy
```

![](https://storage.googleapis.com/zenn-user-upload/cb6552834526-20250912.png)

デプロイした URL へ直接アクセスします。

![](https://storage.googleapis.com/zenn-user-upload/e9cae904a218-20250912.png)

この時点では Access を設定していないので、`Hello Hono!` がそのまま表示されます。

# Terraform state を R2 へ置く

tfstate を保存する R2 bucket を先に作成します。

![](https://storage.googleapis.com/zenn-user-upload/dcfb36c0f2e3-20250912.png)

次に Cloudflare API Token をカスタムトークンで作成します。

```
プロフィール -> API トークン -> トークンを作成する
```

![](https://storage.googleapis.com/zenn-user-upload/b10a5ea362be-20250912.png)

この記事の構成では次の権限を付与します。

|service|permission|
|:--|:-:|
|Workers R2 Storage|Edit|
|Workers Script|Edit|
|Zero Trust|Edit|
|Access: Apps and Policy|Edit|
|Access: Organizations, Identity Providers, and Groups|Edit|

対象のアカウントが「アカウントリソース」に含まれていることも確認します。

![](https://storage.googleapis.com/zenn-user-upload/50eb493e4252-20250912.png)

Cloudflare API Token とは別に、Terraform の S3 backend から R2 へ接続する Access Key ID と Secret Access Key が必要です。

R2 の「API トークンの管理」を開き、「ユーザー API トークン」から R2 用の認証情報を作成します。

![](https://storage.googleapis.com/zenn-user-upload/34e94c5e2a40-20250912.png)

![](https://storage.googleapis.com/zenn-user-upload/9f1115c5c0ad-20250912.png)

![](https://storage.googleapis.com/zenn-user-upload/7518bad3ee51-20250912.png)

作成後に表示される S3 client の Access Key ID、Secret Access Key、endpoint を保存しておきます。

![](https://storage.googleapis.com/zenn-user-upload/2bef886ad6f9-20250912.png)

## main.tf

`main.tf` に Terraform と Cloudflare provider、S3 backend を設定します。

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

認証情報はリポジトリへ commit せず、環境変数から渡します。筆者の環境では direnv を使っています。

```env
AWS_ACCESS_KEY_ID=<your R2 access key id>
AWS_SECRET_ACCESS_KEY=<your R2 secret access key>
CLOUDFLARE_ACCOUNT_ID=<your Cloudflare account id>
CLOUDFLARE_API_TOKEN=<your Cloudflare API token>
```

R2 の endpoint を `backend "s3"` へ設定したら、Terraform を初期化します。

```shell
terraform init
```

![](https://storage.googleapis.com/zenn-user-upload/c176258813f5-20250912.png)

## R2 bucket を import する

手動で作成した R2 bucket も Terraform で管理するため、resource を定義して import します。

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

import 後の `terraform plan` が `No Changes.` になれば、resource の定義と実体が一致しています。

![](https://storage.googleapis.com/zenn-user-upload/00d14960fe7d-20250912.png)

# GitHub IdP と Access policy を作る

## GitHub IdP

Identity Provider として GitHub を追加します。

https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs/resources/zero_trust_access_identity_provider

`github_client_id` と `github_client_secret` は variable として定義し、`TF_VAR_` prefix の環境変数から渡します。

```tf:main.tf
variable "github_client_id" {
  type = string
}

variable "github_client_secret" {
  type = string
}
```

IdP の `config` から variable を参照します。

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

GitHub OAuth App の認証情報を、そのプロセスだけに渡して apply します。

```shell
TF_VAR_github_client_id=<github client id> \
TF_VAR_github_client_secret=<github client secret> \
terraform apply
```

![](https://storage.googleapis.com/zenn-user-upload/83a4e30147c4-20250912.png)

Zero Trust の「設定」から「認証」を開くと `GitHub・github` が追加されています。「テスト」から GitHub OAuth App との接続を確認します。

![](https://storage.googleapis.com/zenn-user-upload/9a99a15a09f6-20250912.png)

接続できていれば GitHub の認可画面が表示されます。

![](https://storage.googleapis.com/zenn-user-upload/396fe83d9875-20250912.png)

## Access Application とポリシー

https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs/resources/zero_trust_access_application

Application とポリシーを作成して Worker を保護します。

許可するユーザーの GitHub アカウントで使っているメールアドレスを列挙します。

```tf:main.tf
locals {
    allowed_users = [
        "許可したい人の GitHub のメールアドレス"
    ]
}
```

Google Workspace のドメインや GitHub organization でも絞れますが、今回はメールアドレスで一致させます。

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

Application の `domain` には、先ほどデプロイした Worker のドメインを指定します。

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

# GitHub でログインする

Worker のドメインを開くと、直接 `Hello Hono!` を返さず Cloudflare Access のログイン画面へ移動します。
GitHub で認可し、ポリシーで許可したユーザーなら元の Worker へ戻れます。

![](https://storage.googleapis.com/zenn-user-upload/c7493ca0820d-20250913.png)

![](https://storage.googleapis.com/zenn-user-upload/0117b04b1559-20250913.png)
