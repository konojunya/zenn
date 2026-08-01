# zenn
zenn contents

## 0xjj.dev sync

`main` の `articles/*.md` が更新されると、`.github/workflows/notify-0xjj-dev.yml` がGitHub App経由で `konojunya/0xjj.dev` の同期workflowを起動する。公開済みの記事だけが `https://0xjj.dev/blog/` のリンク一覧へ反映される。

Zennリポジトリには次のActions設定が必要。

- Variable: `JJ_GITHUB_APP_CLIENT_ID`
- Secret: `JJ_GITHUB_APP_PRIVATE_KEY`

GitHub Appは `konojunya/0xjj.dev` にインストールし、Repository permissionsの `Contents` を `Read and write` にする。WebhookとClient Secretは使用しない。

Actions画面の `workflow_dispatch` から通知経路だけを手動で再実行できる。
