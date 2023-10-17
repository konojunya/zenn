---
title: "OpenAIを使って分析を楽にさせる"
emoji: "🤖"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["openai"]
published: true
---

# 背景

Twitter で予想外にいいねをたくさん頂いていたため解説記事として出します。

https://twitter.com/konojunya/status/1714204469754478637?s=20

OpenAI の API を活用してその会社のサービスに沿った SQL を返してくれる slack bot を開発しました。主に「OpenAI の API でものを作ってみたい人」「slack bot を簡単に開発したいと思っている人」「Cloudflare Workers に手を出したいと思っている人」などが対象の記事です。

作るものとしては、以下の 2 つです。

- slack bot
- OpenAI に対してリクエストを送るバックエンド

今回使うモデルは `gpt-3.5-turbo` になります。単純に prompt としてデータベースの DDL を与えてあげれば bot が精度の高い SQL を返してくれるのではないかと考え作成しました。着想から設計、実装、リリースまで 5 時間ほどで出来たのですごく便利な世界になりました。

## シチュエーション

```
マーケ「この商品を購入したユーザーの数を月別に知りたいんだけど、調べられますか？」
エンジニア「承知しました（BQ開いてSQL書いてスプシに export っと...）」
マーケ「ありがとうございます！ちなみになんですが、週別もお願いできますか？」
エンジニア「ふむふむ。（SQL修正...）」
```

定常的なレポートが必要であれば Looker Studio や redash など様々なサービスが世の中にはあるので、これらを活用し誰でも重要な追うべき数字は見ることができる状態にするのが健全でしょう。ただし、突発的にある特定のデータだけみたいという要件は出てくるでしょう。

エンジニアとしては毎度 SQL を書いてデータを出しても良いのですがきっと自分のタスクもあるでしょう。分析者が欲しい情報にすぐアクセスできるのが結果的に良いと考えました。そこで chatGPT に適当なリレーションのある DDL を渡して、そのコンテキストの上で会話をしてみると簡単な SQL なら特に間違えることなく、さらに注意点まで考慮して回答してくれます。

そこで以下のような図の構成で扱えると便利だろうということで slack bot と OpenAI に対するリクエストを行うためのバックエンドを実装しました。もちろん slack bot 内から直接 OpenAI に対してリクエストしてもよいのですが、こういうものを単純なバックエンドとして実装しておくと後で web UI にしたい、別のサービスから同じようなフローを行いたいとなった際に、重宝します。

![](https://storage.googleapis.com/zenn-user-upload/a5ee62fc9077-20231018.png)

# バックエンド

バックエンドは手軽にデプロイできて安価であり開発者体験の良いものが嬉しいと考え Cloudflare Workers にしました。実装は [Hono](https://github.com/honojs/hono) を使います。

```ts:src/index.ts
import {Hono} from "hono";

app.post("/ai/query", async c => {
  const body = await c.req.text();

  return body;
})
```

```toml:wrangler.toml
name = "sql-generator"
main = "dist/index.js"
compatibility_date = "2023-08-03"
account_id = "<your account id>"
```

ここまで書いたら `tsc` でビルドしましょう。Cloudflare Workers はそのまま TypeScript のコードをデプロイしても動いてくれますが、今回は Public リポジトリにコードを置いたので DDL は伏せたいためビルドしています。

```shell
tsc -p .
```

:::message
この時 `tsconfig.json` の `rootDir` が `.` になっていると `dist/src/index.js` に吐かれるので `rootDir` を `src` と設定するのを忘れないようにしてください
:::

ビルドが終わったらサーバーを立ち上げて確認しましょう。

```shell
wrangler dev
```

## OpenAI の実装

prompt を実行する `OpenAI` class を実装します。またドキュメントは以下になるので参考にしてください。

https://platform.openai.com/docs/introduction

また今回は JavaScript 以外での実装を試みてもわかりやすいように、SDK ではなく HTTP Request を自分で組み立てています。SDK を使うともっと簡単に実装できるので参考にしてください。

https://www.npmjs.com/package/openai

実装する際の prompt や設定値は先に [Playground](https://platform.openai.com/playground) で試すとよいでしょう。

```ts:src/openai.ts
interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: 'user' | 'system' | 'assistant';
      content: string;
      finish_reason: 'stop' | 'max_tokens' | 'timeout';
    };
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenAI {
  private headers: Record<string, string>; // 今回はどちらも string なので value 側も string にしていますが、unknown でもよいでしょう
  private readonly promptBase = `あなたはSQLマスターです。質問に対して適切なSQLを返答してください。また使うデータベースのDDLは以下です。\n`;
  private readonly baseURL = 'https://api.openai.com/v1/chat/completions'; // model によってエンドポイントが違うようなのでこちらを参考にしてください。ref: https://platform.openai.com/docs/guides/gpt
  private readonly settings = {
    model: 'gpt-3.5-turbo',
    temperature: 1,
    max_tokens: 500,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
  };

  constructor() {
    // ヘッダーは上記変数定義時点で書いても問題ありませんが、 constructor の引数から得たものを元に設定する考慮が入っています。
    this.headers = {
      'content-type': 'application/json',
    };
  }

  public setupAPIKey(apiKey: string): void {
    this.headers['authorization'] = `Bearer ${apiKey}`;
  }
}
```

ここまでの実装では、単純に baseURL の設定やモデル、今回の設定値などを含んだだけの class になっています。 実際に OpenAI に対してリクエストするための `ask` メソッドを実装します。

```ts
class OpenAI {
  public ask(prompt: string): Promise<string> {
    const messages = [
      { role: "system", content: this.promptBase },
      { role: "user", content: prompt },
    ];

    const res = await fetch(this.baseURL, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        ...this.settings,
        messages,
      }),
    });

    if (!res.ok) {
      throw new Error(res.statusText);
    }

    const json: OpenAIResponse = await res.json();

    return json.choices[0].message.content;
  }
}
```

重要なのは messages 配列の 0 番目に当たる `{role: "system", content: this.promptBase}` です。これによりこの `ask` でコールされる OpenAI のレスポンスはこの `role: system` で設定された人格となります。つまりこの時点で DDL を渡していればうまく SQL を返してきてくれます。

では DDL を追加しましょう。今回は横着してテンプレートリテラルでそのまま DDL をコピーしてきたものを export します。

```ts:src/ddl.ts
export default `
CREATE TABLE users
(
  id bigserial NOT NULL PRIMARY KEY,
  email varchar(255) NOT NULL UNIQUE,
  created_at timestampz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestampz NOT NULL DEFAULT CURRENT_TIMESTAMP,
)

-- データとして分析しそう / 必要なテーブルとリレーションしてるテーブルの DDL をずらずらとコピーしてくる
`
```

`ddl.ts` が完成したら少しだけ修正を加えます。

:::message
DDL は非公開だが、コードを公開するような場合は `.gitignore` に `ddl.ts` を入れ忘れないようにしましょう。
:::

```diff
+ import ddl from "./ddl";

export class OpenAI {

  constructor() {
+   this.promptBase += ddl;
    this.headers = {
      'content-type': 'application/json',
    };
  }
}
```

あとはこれを先ほどおうむ返しをしてた Hono のルーティングに乗せます。

```ts:src/index.ts
app.post("/ai/query", async c => {
  const API_KEY = c.env.OPENAI_API_KEY;
  const body = await c.req.text();
  ai.setupAPIKey(API_KEY);

  const message = await ai.ask(body);

  return c.json({message});
});
```

ローカルで実行し、実際にリクエストボディーに問い合わせて欲しい SQL を得ることができるかを確認しましょう。あとはデプロイすれば Cloudflare Workers に Hono で作った OpenAI の wrapper が完成します。

```shell
wrangler deploy
```

今回実装したコードは以下のリポジトリに配置しています。この記事では書いてませんが、 Cloudflare Workers にデプロイしたエンドポイントがバレると DB の設計や OpenAI のトークン数が足らないようにするための攻撃をされる恐れがあるため、何らかの認証をかけておくのがよいでしょう。

https://github.com/konojunya/sql-generator

またリポジトリでも実装していませんが、 `ask` の `messages` には文脈がのるので Cloudflare Workers を使っているならそのまま D1 などを利用してやり取りを保存することで精度の向上が見込めるでしょう。

# slack bot

slack bot と言えば、[Bolt](https://slack.dev/bolt-js/ja-jp/tutorial/getting-started) を使うのが多いと思われます。しかし最近の開発では [automation](https://api.slack.com/automation) と呼ばれているやり方で slack の cloud 上にデプロイができるものをよく使っています。 slack cli から簡単にプロジェクトが作れたり、コードをデプロイ出来たりするので bot 開発がとても楽になりました。また Deno の環境で動くため TypeScript の型をゴリゴリ使って実装可能です。

まずはプロジェクトを作成します。slack cli か GUI から作成してください。 cli からだと [`slack create`](https://api.slack.com/automation/cli/commands#create) で作成できます。アプリを追加すると以下のようなディレクトリが作られます。

```.slack/apps.json
{
  "apps": {
    "<org name>": {
      "name": "app name",
      "app_id": "xxxxxx",
      "team_id": "xxxxxx",
      "IsDev": false
    }
  },
  "default": "<org name>"
}
```

slack cli は `slack login` で認証でき、特定のコマンドを実行すると OTP が発行され、OTP を cli に入力することで認証が完了します。

slack の automation において最重要なのは `manifest.ts` というファイルです。これがこのアプリの設定のファイルになります。

```ts
import {Manifest} from "deno-slack-sdk/mod.ts";

export default Manifest({
  name: "bot name",
  displayName: "bot-name",
  description: "description",
  icon: "assets/icon.png",
  workflows: [],
  outgoingDomains: [<先ほど deploy した cloudflare workers の origin>],
  botScopes: [
    "app_mentions:read",
    "chat:write",
  ],
});
```

この設定で、bot の基礎が完成します。 `name` は slack に表示される名前、 `displayName` は `@bot-name` で呼ぶ時の名前になります。また `icon` は `assets/icon.png` としていますが、同じプロジェクトの画像の path を指定してください。今回は `@bot 総ユーザー数を教えて` などとメッセージするとそのメッセージのスレッドに対して回答してくれる bot を作成したいと考えているため、 bot の scope には `app_mentions:read` と `chat:write` が必要になります。

アプリを作るために今回は `sql_generate` というディレクトリを作ります。

```ts:sql_generate/index.ts
import {DefineWorkflow, Schema} from "deno-slack-sdk/mod.ts";

export const workflow = DefineWorkflow({
  callback_id: "sql_generate_workflow",
  title: "SQL Generate Workflow",
  input_parameters: {
    properties: {
      channel_id: { type: Schema.types.string },
      thread_ts: { type: Schema.types.string },
      prompt: { type: Schema.types.string },
    },
    required: ["channel_id", "thread_ts", "prompt"]
  }
});
```

まず workflow を定義します。ここに step を追加していくことでこの workflow がトリガーされた際、順番に処理を行うことになります。

step の追加は後にして、先にトリガーを作成します。

```ts:sql_generate/index.ts
import {Trigger} from "deno-slack-api/types.ts";

const trigger: Trigger<typeof workflow.definition> = {
  type: "event", // mention というイベントのため。その他に webhook などいくつか存在するがやりたいことに合わせて設定する。
  name: "sql generate trigger",
  workflow: `#/workflows/${workflow.definition.callback_id}`,
  inputs: {
    channel_id: {value: "{{data.channel_id}}"},
    thread_ts: {value: "{{data.message_ts}}"}, // メッセージを一意に決めるためのもの
    prompt: {value: "{{data.text}}"}, // 送られてきた本文
  },
  event: {
    event_type: "slack#/events/app_mentioned",
    channel_ids: ["xxxx", "yyyy"], // この workflow が使えるチャンネルを設定する必要がある。最大20個
  }
};

export default trigger;
```

workflow を実装したので `manifest.ts` にも加えましょう。

```diff
import {Manifest} from "deno-slack-sdk/mod.ts";
+ import {workflow} from "./sql_generate/index.ts";

export default Manifest({
  name: "bot name",
  displayName: "bot-name",
  description: "description",
  icon: "assets/icon.png",
-  workflows: [],
+  workflows: [workflow]
  outgoingDomains: [<先ほど deploy した cloudflare workers の origin>],
  botScopes: [
    "app_mentions:read",
    "chat:write",
  ],
});
```

workflow の設定が終われば一旦 deploy をしてしまいましょう。

```shell
slack deploy
```

deploy したら trigger の登録します。trigger の登録は少しややこしいコマンドになってますが help などを見ながら進められるとよいでしょう。

```shell
slack triggers create --trigger-def ./sql_generate/index.ts
```

これでトリガーの登録も完了しました。しかしまだ workflow の step を追加していません。最後にこの step を追加すれば slack 上から OpenAI の API を Cloudflare Workers 越しに叩くことができます。

```ts:sql_generate/function.ts
import {DefineFunction, Schema, SlackFunction} from "deno-slack-sdk/mod.ts";

export const SqlGenerateFunctionDefinition = DefineFunction({
  callback_id: "sql_generate_function",
  title: "SQL Generate Function",
  source_file: "sql_generate/function.ts", // manifest.ts から見て自分自身のファイルの path を記述する
  input_parameters: {
    properties: {
      channel_id: {type: Schema.types.string},
      thread_ts: {type: Schema.types.string},
      prompt: {type: Schema.types.string},
    },
    required: ["channel_id", "thread_ts", "prompt"],
  },
});

export default SlackFunction(SqlGenerateFunctionDefinition, async ({inputs, client}) => {
  const {channel_id, thread_ts, prompt} = inputs;

  // 一旦 slack へメッセージを送る。loading 状態をユーザーに認知させるため
  await client.chat.postMessage({
    channel: channel_id,
    text: "SQLを考えています...",
    thread_ts,
  });

  // 先ほどの cloudflare から gpt の返答を待ってレスポンスを得る
  const res = await fetch("<cloudflare workers の origin>", {
    method: "POST",
    body: prompt,
  });

  if(!res.ok) {
    const err = await res.text();

    // エラーがあった場合、その旨をメッセージに載せる
    await client.chat.postMessage({
      channel: channel_id,
      text: "エラーが発生しました",
      thread_ts,
    });

    return {outputs: {err}};
  }

  const {message} = await res.json();

  // gpt が回答した文章をそのまま postMessage する
  await client.chat.postMessage({
    channel: channel_id,
    text: message,
    thread_ts,
  });

  return {outputs: {}};
});
```

function の実装をしたら、 workflow に step として追加します。

```ts:sql_generate/index.ts
workflow.addStep(SqlGenerateFunctionDefinition, {
  channel_id: workflow.inputs.channel_id,
  thread_ts: workflow.inputs.thread_ts,
  prompt: workflow.inputs.prompt,
});
```

これで全ての実装ができました。再度 slack にデプロイすればテストを行いましょう。

```shell
slack deploy
```

![](https://storage.googleapis.com/zenn-user-upload/bf5b8677425e-20231018.jpeg)

これで SQL に自信がなくても分析したいと思ったタイミングで SQL を発行できるようになりました。

# outro

今現状返ってくる SQL はそのまま postgres など DB client で実行すればうまく動きますが Big Query などに貼り付けても動かない SQL になっていたりします。ここは prompt の時点でもう少し細かく指定をしてチューニングしたり、 SQL を発言者に対して答えるだけなのでその文章の中でうまく伝えるのが改善点でしょう。
