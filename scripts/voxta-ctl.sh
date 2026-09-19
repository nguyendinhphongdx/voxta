#!/usr/bin/env bash
# CLI quản lý voxta chạy native trên máy (không qua Docker) — PID file + log file thuần, không cần
# biết launchd/systemd là gì, giống hệt cách `opencode start/stop/status/logs` (repo vscode-remote)
# quản lý agent của nó.
#
#   ./scripts/voxta-ctl.sh start           # build trước bằng scripts/build-native.sh
#   ./scripts/voxta-ctl.sh stop
#   ./scripts/voxta-ctl.sh restart
#   ./scripts/voxta-ctl.sh status
#   ./scripts/voxta-ctl.sh logs [-f]       # -f = tail theo dõi liên tục
#
# LƯU Ý: cách này KHÔNG tự chạy lại sau khi restart máy, KHÔNG tự restart nếu crash — đó là việc
# của launchd (xem scripts/install-native-service.sh nếu muốn thêm phần đó). Script này chỉ lo
# start/stop/xem log thủ công, y hệt tinh thần opencode.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$REPO_ROOT/data"
PID_FILE="$DATA_DIR/voxta.pid"
LOG_FILE="$DATA_DIR/voxta.log"
SERVER_JS="$REPO_ROOT/.next/standalone/server.js"
PORT="${PORT:-3000}"

mkdir -p "$DATA_DIR"

is_running() {
  [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

cmd_start() {
  if is_running; then
    echo "voxta đã chạy (PID $(cat "$PID_FILE"))."
    exit 0
  fi
  if [ ! -f "$SERVER_JS" ]; then
    echo "Chưa build — chạy ./scripts/build-native.sh trước." >&2
    exit 1
  fi
  cd "$REPO_ROOT"
  nohup env PORT="$PORT" NODE_ENV=production node "$SERVER_JS" >> "$LOG_FILE" 2>&1 &
  disown
  echo $! > "$PID_FILE"
  sleep 1
  if is_running; then
    echo "Đã chạy (PID $(cat "$PID_FILE")), cổng $PORT. Log: $LOG_FILE"
  else
    echo "Khởi động thất bại — xem $LOG_FILE" >&2
    exit 1
  fi
}

cmd_stop() {
  if ! is_running; then
    echo "voxta không chạy."
    rm -f "$PID_FILE"
    exit 0
  fi
  kill "$(cat "$PID_FILE")"
  rm -f "$PID_FILE"
  echo "Đã dừng."
}

cmd_status() {
  if is_running; then
    echo "Đang chạy (PID $(cat "$PID_FILE"))."
  else
    echo "Không chạy."
  fi
}

cmd_logs() {
  touch "$LOG_FILE"
  if [ "${1:-}" = "-f" ]; then
    tail -f "$LOG_FILE"
  else
    tail -n 50 "$LOG_FILE"
  fi
}

case "${1:-}" in
  start) cmd_start ;;
  stop) cmd_stop ;;
  restart)
    cmd_stop
    cmd_start
    ;;
  status) cmd_status ;;
  logs) cmd_logs "${2:-}" ;;
  *)
    echo "Dùng: $0 start|stop|restart|status|logs [-f]" >&2
    exit 1
    ;;
esac
