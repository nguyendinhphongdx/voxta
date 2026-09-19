#!/usr/bin/env bash
# Tạo (nếu chưa có) 1 cặp SSH key RIÊNG chỉ dùng để container Docker của voxta SSH ngược vào máy
# host — dùng cho backend "Terminal Agent (tmux)" với lệnh kiểu:
#   ssh -t -o StrictHostKeyChecking=accept-new dinhphong@host.docker.internal claude
# (SSH ra máy đã có sẵn `claude`/`codex` đăng nhập, thay vì cài/login lại trong container).
#
# Key lưu ở .docker/ssh/ (đã gitignore — KHÔNG commit key thật). Script chỉ APPEND public key vào
# ~/.ssh/authorized_keys, không đụng gì tới key/entry khác đã có sẵn — và LUÔN hỏi xác nhận trước
# khi ghi, vì đây là hành động cấp quyền đăng nhập lâu dài vào máy bạn.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEY_DIR="$REPO_ROOT/.docker/ssh"
KEY_PATH="$KEY_DIR/id_ed25519"

mkdir -p "$KEY_DIR"
chmod 700 "$KEY_DIR"

if [ -f "$KEY_PATH" ]; then
  echo "Key đã tồn tại tại $KEY_PATH — bỏ qua bước tạo."
else
  ssh-keygen -t ed25519 -f "$KEY_PATH" -N "" -C "voxta-docker"
  echo "Đã tạo key mới tại $KEY_PATH"
fi
chmod 600 "$KEY_PATH"

PUB_CONTENT="$(cat "$KEY_PATH.pub")"
AUTH_KEYS="$HOME/.ssh/authorized_keys"

if [ -f "$AUTH_KEYS" ] && grep -qF "$PUB_CONTENT" "$AUTH_KEYS"; then
  echo "Public key đã có trong $AUTH_KEYS — không cần thêm lại."
else
  echo ""
  echo "Sắp APPEND dòng sau vào $AUTH_KEYS (cấp quyền SSH đăng nhập vào máy này bằng key vừa tạo):"
  echo "  $PUB_CONTENT"
  read -r -p "Xác nhận thêm? (y/N) " CONFIRM
  if [ "$CONFIRM" = "y" ] || [ "$CONFIRM" = "Y" ]; then
    mkdir -p "$HOME/.ssh"
    chmod 700 "$HOME/.ssh"
    touch "$AUTH_KEYS"
    chmod 600 "$AUTH_KEYS"
    echo "$PUB_CONTENT" >> "$AUTH_KEYS"
    echo "Đã thêm vào $AUTH_KEYS."
  else
    echo "Huỷ — không sửa $AUTH_KEYS. Bạn có thể tự thêm dòng ở trên bằng tay sau."
    exit 1
  fi
fi

echo ""
echo "Xong. Chạy container kèm mount key này:"
echo "  docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.ssh.yml up -d --build"
echo ""
echo "Lệnh gợi ý cho \"tmuxAgentCommand\" trong Settings UI (backend Terminal Agent):"
echo "  ssh -t -o StrictHostKeyChecking=accept-new -i /home/voxta/.ssh/id_ed25519 $(whoami)@host.docker.internal claude"
