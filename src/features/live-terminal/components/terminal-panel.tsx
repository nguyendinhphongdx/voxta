'use client';

import '@xterm/xterm/css/xterm.css';

import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { Settings } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { TERMINAL_COLS, TERMINAL_ROWS } from '../../../connectors/remote-terminal/RemoteTerminalConnector';
import { isTerminalCapable } from '../../conversation/agent-session';
import { useSettingsStore } from '../../settings/store';
import { ensureConnector, getLiveTerminal } from '../../call/store';

/** Terminal thật, tương tác trực tiếp — `@xterm/xterm` (bản DOM, khác `@xterm/headless` connector
 * dùng nội bộ cho TTS) render thẳng màn hình PTY (cursor, màu, mọi ANSI) và forward TỪNG PHÍM gõ
 * thẳng vào PTY qua `term.onData()`, y hệt terminal web thật (vd chính vscode-remote's web IDE
 * terminal) — không còn qua ô input + submit + buffer chờ quiet-period như trước.
 *
 * `FitAddon` co giãn theo đúng kích thước container (không cuộn ngang/dọc) — MỖI LẦN co giãn đều
 * gửi kèm `resizeTerminal()` cho PTY thật biết (qua `terminal:resize`), để cách ngắt dòng của
 * chương trình bên trong PTY luôn khớp với những gì đang hiển thị trên DOM. */
export function TerminalPanel() {
  const settings = useSettingsStore((s) => s.settings);
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Mặc định bật — "cứ có output terminal là đọc". Khó nhất là biết CHÍNH XÁC cái gì nên đọc (có
  // thể lẫn cả echo lệnh vừa gõ, dòng prompt...) nên thay vì cố đoán hoàn hảo, cho tắt tay khi ồn.
  const [autoReadOutput, setAutoReadOutput] = useState(true);

  // Mount xterm.js đúng 1 lần — sống suốt vòng đời component, không phụ thuộc isActive (giữ lại
  // nội dung cũ khi cuộc gọi dừng, giống 1 terminal thật bị ngắt kết nối chứ không phải bị xoá).
  useEffect(() => {
    const term = new Terminal({ cols: TERMINAL_COLS, rows: TERMINAL_ROWS, convertEol: true });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    if (containerRef.current) {
      term.open(containerRef.current);
      fitAddon.fit();
    }
    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Co giãn theo container mỗi khi nó đổi kích thước (mở/đóng panel, resize cửa sổ, xoay màn
    // hình...) — không chỉ 1 lần lúc mount.
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      const live = getLiveTerminal();
      live?.resizeTerminal(term.cols, term.rows);
    });
    if (containerRef.current) resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // Áp dụng ngay khi người dùng bật/tắt toggle trong lúc cuộc gọi đang active — effect kết nối
  // bên dưới chỉ chạy lại khi `isActive` đổi, không tự bắt được thay đổi của riêng toggle này.
  useEffect(() => {
    getLiveTerminal()?.setAutoReadOutput(autoReadOutput);
  }, [autoReadOutput]);

  // Tự kết nối PTY ngay khi mount — ĐỘC LẬP với việc có bấm nút voice hay không.
  // `ensureConnector` tạo connector nếu chưa có, KHÔNG đụng mic/STT (đó là việc riêng của
  // `useCallStore.start()`, chỉ chạy khi user bấm orb voice) — bấm orb sau đó sẽ gắn mic lên
  // ĐÚNG connector/phiên terminal này thay vì tạo lại từ đầu (xem comment trong call/store.ts).
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const live = ensureConnector(settings);
    if (!isTerminalCapable(live)) return; // backend khác remote-terminal — không có gì để làm ở đây

    let cancelled = false;
    let unsubscribeOutput: (() => void) | null = null;

    void live.connectTerminal().then(() => {
      if (cancelled) return;
      // PTY vừa tạo ở kích thước mặc định (`TERMINAL_COLS`/`TERMINAL_ROWS`) — báo ngay kích
      // thước THẬT đã fit theo container, phòng khi nó khác mặc định (khung hình đã mở từ trước).
      fitAddonRef.current?.fit();
      live.resizeTerminal(term.cols, term.rows);
      live.setAutoReadOutput(autoReadOutput);
      unsubscribeOutput = live.onRawOutput((chunk) => term.write(chunk));
    });

    const dataDisposable = term.onData((data) => {
      void live.writeRaw(data);
    });

    return () => {
      cancelled = true;
      unsubscribeOutput?.();
      dataDisposable.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ cần chạy lại khi backend đổi
    // (settings khác — vd relay URL — không cần reconnect PTY, connector tự đọc field mới nhất
    // qua `remoteConfig` lúc tạo; đổi field đó giữa chừng hiếm và không phải mục tiêu effect này).
  }, [settings.backend]);

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-black/40">
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="font-mono text-[11px] tracking-wide text-white/40">TERMINAL</span>
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          className="rounded p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
          aria-label="Cài đặt terminal"
        >
          <Settings className="size-3.5" />
        </button>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden p-1" />

      {settingsOpen && (
        <>
          {/* Backdrop trong suốt — bấm ra ngoài để đóng, không cần thư viện popover riêng. */}
          <div className="fixed inset-0 z-10" onClick={() => setSettingsOpen(false)} />
          <div className="absolute top-9 right-2 z-20 w-64 rounded-lg border border-white/10 bg-zinc-900 p-3 shadow-xl">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={autoReadOutput}
                onChange={(e) => setAutoReadOutput(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-emerald-500"
              />
              <span className="text-sm">
                <span className="block text-white/90">Tự đọc to output</span>
                <span className="block text-xs text-white/40">
                  Đọc output khi gõ tay trực tiếp vào terminal hoặc tiến trình chạy nền. Câu hỏi bằng
                  giọng nói luôn được đọc trả lời, không phụ thuộc cờ này.
                </span>
              </span>
            </label>
          </div>
        </>
      )}
    </div>
  );
}
