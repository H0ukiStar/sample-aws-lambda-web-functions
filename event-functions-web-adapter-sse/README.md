# event-functions-web-adapter-sse — 従来型 Lambda + Lambda Web Adapter で SSE

同じ SSE デモを **Event Functions（従来型 Lambda）+ [Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter)** で実装したパターンです。`web-functions-sse` との対比用です。

Web Adapter は、ポートを待ち受ける標準 HTTP サーバーをそのまま Lambda で動かすための拡張（レイヤー / Dockerイメージ）です。Web Functions が「アダプター不要」なのに対し、こちらはアダプターをレイヤーとして足し、`AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap` で有効化します。

## Web Functions 版との違い（観測ポイント）

- **1環境 = 1リクエスト**。SSE のように開きっぱなしのストリーム1本が実行環境を丸ごと占有します。
- 複数クライアントが同時接続すると、接続数ぶんの実行環境が立ち上がり、各環境の `activeConnections` は必ず 1 となります。並行して張った接続は **`instanceId` が必ず別々になります**（1環境が同時に複数リクエストを抱えることはないため）。
- 対して Web Functions は 1 環境が最大 128 接続を相乗りできる（`instanceId` が揃い `activeConnections` が増える）。ここが本質的な差です。

## ファイル

```
event-functions-web-adapter-sse/
├── template.yaml       # SAM テンプレート(レイヤー / 環境変数 / Function URL)
└── app/
    ├── index.js        # 標準 HTTP サーバー + SSE + ダッシュボード
    ├── run.sh          # アダプターのラッパーから起動されるスタートアップ
    └── package.json
```

## 肝になる設定（template.yaml）

- **レイヤー**: `arn:aws:lambda:<region>:753240598075:layer:LambdaAdapterLayerX86:30`（arm64 は `LambdaAdapterLayerArm64`）
- **`AWS_LAMBDA_EXEC_WRAPPER: /opt/bootstrap`** … アダプター有効化
- **`AWS_LWA_INVOKE_MODE: response_stream`** … SSE/ストリーミングに必須
- **`Handler: run.sh`** … アダプター経由で `node index.js` を起動
- **Function URL の `InvokeMode: RESPONSE_STREAM`** … URL 側もストリーミング有効化
- **`AWS_LWA_PORT` / `PORT`** … アプリが listen するポート（デフォルト 8080）

## ローカルで動かす

アプリ本体はただの HTTP サーバーなので、アダプターなしでそのまま起動できます（挙動確認用）。

```bash
cd app
# PowerShell
$env:AWS_LWA_PORT="8080"; node index.js
# bash
AWS_LWA_PORT=8080 node index.js
```

http://localhost:8080/ を開いて動作を確認できます。ただしローカルは単一プロセスなので `instanceId` は揃います。「接続ごとに環境が分散する」挙動は実際に Lambda へデプロイして観測してください。

## デプロイ（AWS SAM）

```bash
sam build
sam deploy --guided
```

デプロイ後、出力 `FunctionUrl` をブラウザで開くか、`curl -N <FunctionUrl>events` で SSE を確認します。複数接続を張ると、接続ごとに別の `instanceId` が割り当てられる様子が見られます。

> Function URL は `AuthType: NONE`（公開）です。評価用途にとどめ、不要になったら `sam delete` で削除してください。

## 出典

- Lambda Web Adapter: https://github.com/awslabs/aws-lambda-web-adapter
- レスポンスストリーミング設定: https://aws.github.io/aws-lambda-web-adapter/configuration/response-streaming.html
