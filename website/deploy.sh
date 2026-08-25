#!/usr/bin/env bash
# 把 Mimir 官网同步到阿里云服务器。用法：
#   bash website/deploy.sh root@<服务器IP>
# 首次使用前在服务器上：mkdir -p /var/www/mimir 并放好 nginx 配置（见 website/README.md）
set -euo pipefail

HOST="${1:?用法: bash website/deploy.sh <user@host> [远程目录]}"
DEST="${2:-/var/www/mimir}"
SRC="$(cd "$(dirname "$0")" && pwd)"

rsync -avz --delete \
  --exclude deploy.sh --exclude nginx.conf --exclude README.md \
  "$SRC/" "$HOST:$DEST/"

echo "已同步到 $HOST:$DEST"
