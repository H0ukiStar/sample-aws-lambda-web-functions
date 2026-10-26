# web-functions-sse — Lambda Web Functions で SSE 同時接続を確認する

AWS Lambda **Web Functions** の「1つの実行環境が複数リクエストを同時に受け付けられる」特性を、SSE (Server-Sent Events) で可視化するサンプルです。

アダプター不要。標準の Node.js HTTP サーバーがランタイムの渡す `AWS_LAMBDA_HTTP_ENDPOINT`（`host:port`）を読んで listen するだけです。

## 何を確認できるか

- 各 SSE 接続（`/events`）はサーバー側で開いたまま保持され、2秒ごとに「この環境が今いくつ接続を抱えているか（`activeConnections`）」を push します。
- ブラウザのダッシュボードから接続を複数開くと、**`instanceId` が同じまま `activeConnections` が接続数ぶんに増える**のが見えます。これが「1環境が複数リクエストを同時にさばいている」証拠です。
- 1環境あたり最大 128 同時リクエスト（デフォルト 64）まで相乗りできます（出典: `../lambda-web-functions/steering/reference.md`）。

## ファイル

```
web-functions-sse/
├── index.js        # 標準 HTTP サーバー + SSE + ダッシュボード HTML
└── package.json
```

- `GET /`        … ダッシュボード（ブラウザで開く）
- `GET /events`  … SSE ストリーム（2秒ごとに tick）
- `GET /status`  … 現在の instanceId / activeConnections を JSON で返す

## ローカルで動かす

ランタイムが本番で渡す `AWS_LAMBDA_HTTP_ENDPOINT` を自分で設定するだけです。

```bash
# PowerShell
$env:AWS_LAMBDA_HTTP_ENDPOINT="127.0.0.1:3000"; node index.js

# bash
AWS_LAMBDA_HTTP_ENDPOINT=127.0.0.1:3000 node index.js
```

ブラウザで http://localhost:3000/ を開き、「+ 5本まとめて」で接続を増やすと、全カードの `instanceId` が揃い `activeConnections` が増えます。

同時接続を CLI で確認する例:

```bash
# 2本つなぎっぱなしにして、その最中に /status を見る
curl -N http://localhost:3000/events &
curl -N http://localhost:3000/events &
curl http://localhost:3000/status   # => "activeConnections":2, instanceId は同一
```

## デプロイ（aws lambda-web）

```bash
aws lambda-web deploy --name lambda-web-sse --code .
```

CLI がコードをバンドルし、Web Function・最初のリビジョン・公開 `dev` エンドポイント（HTTPS URL）・実行ロール・共有 S3 バケットを作成します。返ってきた URL をブラウザで開けば、同じダッシュボードが動きます。

> `dev` エンドポイントは公開かつ認証なしです。評価用途にとどめ、不要になったら削除してください（詳細は `../lambda-web-functions/steering/deploy-cli.md`）。

### 実環境での観測（CloudWatch Logs）

ランタイムは1分ごとに、環境ごとのサマリー（instanceId・リクエスト数・ピーク同時実行・CPU時間）を `/aws/lambda/web/<function-name>` に出力します。Logs Insights で `type="platform.invokeSummary"` を集計すると、少数の環境が多数の接続をさばいている様子が確認できます。

## Event Functions 版との違い

同じ SSE デモを従来型 Lambda + Lambda Web Adapter で実装したものが `../event-functions-web-adapter-sse` にあります。あちらは「1環境=1リクエスト」なので、接続ごとに別環境へ分散し、`instanceId` がばらけます。両者を見比べると Web Functions の同時処理モデルの違いがはっきりします。
