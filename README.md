# sample-aws-lambda-web-functions

AWS **Lambda Web Functions** と **Event Functions（+ [Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter)）** を、SSE（Server-Sent Events）デモで比較するサンプルコードです。

「1 つの実行環境が複数リクエストを同時にさばけるか」を、同時接続を観測しながら見比べられます。

> このリポジトリは、以下の記事で使用したサンプルコード一式です。
> 記事: [Lambda Web Functions を触ってみた 〜SSE で「1 環境が複数リクエストをさばく」様子を Event Functions と比べる〜（Qiita）](https://qiita.com/h0uk1st4r/items/88afb72b7b5d0ebe52ff)

## 何を確認できるか

同じ SSE デモを 2 つの方式で実装し、同時接続時の挙動を比較します。

- **Web Functions**：`instanceId` が揃ったまま `activeConnections` が増える（= 1 環境が複数リクエストを相乗り）
- **Event Functions**：接続ごとに `instanceId` が必ず別々になる（= 1 環境 = 1 リクエスト）

この差が、Web Functions の同時処理モデルの本質です。

## ディレクトリ構成

| ディレクトリ | 方式 | 概要 |
| --- | --- | --- |
| [`web-functions-sse`](./web-functions-sse) | Lambda Web Functions | アダプター不要。標準の Node.js HTTP サーバが `AWS_LAMBDA_HTTP_ENDPOINT` を読んで listen するだけ。`aws lambda-web deploy` でデプロイ |
| [`event-functions-web-adapter-sse`](./event-functions-web-adapter-sse) | Event Functions + Lambda Web Adapter | 従来型 Lambda にアダプターをレイヤーとして足した構成。AWS SAM でデプロイ |

どちらのサンプルも、以下の 3 エンドポイントを持つシンプルな作りです。

- `GET /` … 接続状況を可視化するダッシュボード（ブラウザで開く）
- `GET /events` … SSE ストリーム。2 秒ごとに `instanceId` と `activeConnections` を push
- `GET /status` … 現在の `instanceId` / `activeConnections` を JSON で返す

## 使い方

各ディレクトリの README に、ローカル実行とデプロイの手順をまとめています。

- Web Functions 版: [`web-functions-sse/README.md`](./web-functions-sse/README.md)
- Event Functions 版: [`event-functions-web-adapter-sse/README.md`](./event-functions-web-adapter-sse/README.md)

おおまかな流れは次のとおりです。

1. 片方のディレクトリに移動する
2. ローカルで `node index.js` を起動して動作を確認する
3. それぞれの方式でデプロイする（`aws lambda-web deploy` / `sam deploy`）
4. ダッシュボードから接続を複数開き、`instanceId` と `activeConnections` の変化を見比べる

## 注意事項

> [!WARNING]
> どちらのサンプルもエンドポイントは**認証なしの公開設定**です。評価用途にとどめ、不要になったら削除してください（Web Functions 版はエンドポイントの削除、Event Functions 版は `sam delete`）。

## 出典

- AWS Lambda Web Functions: https://docs.aws.amazon.com/lambda/latest/dg/web-functions-how-it-works.html
- Lambda Web Adapter: https://github.com/awslabs/aws-lambda-web-adapter
