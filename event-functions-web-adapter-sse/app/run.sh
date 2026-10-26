#!/bin/bash
# Lambda Web Adapter のラッパーから起動されるスタートアップスクリプト。
# 関数ハンドラーをこの run.sh に設定し、AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap で
# アダプターが先に立ち上がってから、このスクリプトが実アプリ(HTTPサーバー)を起動する。
exec node index.js
