#!/usr/bin/env bash
# Cài voxta thành LaunchAgent — tự chạy mỗi khi bạn đăng nhập macOS, tự khởi động lại nếu crash
# (tương đương systemd service bên Linux). Chạy `node` TRỰC TIẾP trên máy — không qua Docker, nên
# có nguyên PATH/Keychain/session của chính bạn (né hẳn vấn đề Keychain gặp phải khi Claude Code
# chạy qua SSH từ container).
#
# LUÔN hỏi xác nhận trước khi `launchctl load` — đây là hành động cài 1 tiến trình tự chạy VĨNH
# VIỄN cùng máy, không tự động hoá bước này.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_JS="$REPO_ROOT/.next/standalone/server.js"
PLIST_LABEL="com.voxta.server"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"
LOG_DIR="$REPO_ROOT/data"

if [ ! -f "$SERVER_JS" ]; then
  echo "Chưa build — chạy ./scripts/build-native.sh trước." >&2
  exit 1
fi

mkdir -p "$LOG_DIR"

# NODE_EXTRA_PATH: LaunchAgent chạy KHÔNG qua shell login (PATH tối giản, giống vấn đề PATH đã gặp
# nhiều lần với nvm/tmux/ssh trong phiên này) — nhúng thẳng PATH thật của shell login vào plist để
# `claude`/`tmux`/`git` gọi từ bên trong voxta (backend Terminal Agent, Claude Code headless) vẫn
# thấy được, không phải sửa lại từng backend.
REAL_PATH="$("$SHELL" -lic 'echo $PATH' 2>/dev/null)"

cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$PLIST_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(command -v node)</string>
    <string>$SERVER_JS</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$REPO_ROOT</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key>
    <string>3000</string>
    <key>NODE_ENV</key>
    <string>production</string>
    <key>PATH</key>
    <string>$REAL_PATH</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/voxta.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/voxta.error.log</string>
</dict>
</plist>
PLIST

echo "Đã tạo $PLIST_PATH:"
echo ""
cat "$PLIST_PATH"
echo ""
read -r -p "Nạp LaunchAgent này ngay bây giờ (voxta sẽ chạy cùng lúc đăng nhập từ giờ)? (y/N) " CONFIRM
if [ "$CONFIRM" = "y" ] || [ "$CONFIRM" = "Y" ]; then
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
  launchctl load "$PLIST_PATH"
  echo "Đã nạp. Kiểm tra: curl http://localhost:3000"
  echo "Xem log:   tail -f $LOG_DIR/voxta.log"
  echo "Gỡ:        launchctl unload $PLIST_PATH && rm $PLIST_PATH"
else
  echo "Huỷ — plist vẫn nằm ở $PLIST_PATH, tự nạp bằng tay sau: launchctl load $PLIST_PATH"
fi
