#!/usr/bin/env node
// CLI quản lý voxta khi cài dạng global npm package — mirror đúng cấu trúc `opencode` CLI của
// repo vscode-remote (agent/src/cli.ts, cùng tác giả) theo yêu cầu "làm y hệt như thế kia": cùng
// bộ lệnh start/stop/restart/status/logs/run/install/uninstall/upgrade/purge, cùng cách quản lý
// PID file + log file, cùng cách đăng ký system service theo platform (systemd user service trên
// Linux, LaunchAgent trên macOS, Task Scheduler trên Windows).
//
// Khác biệt so với opencode: voxta không có "config.json" riêng (agentId/password) — toàn bộ cấu
// hình nằm trong SQLite, sửa qua chính Web UI của voxta (route `/settings`) sau khi server đã
// chạy, nên không có lệnh `id`/`password`/`setup` tương ứng; thay vào đó có `open` để mở thẳng
// trang Settings đó.

import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(os.homedir(), '.voxta');
const PID_FILE = path.join(DATA_DIR, 'voxta.pid');
const LOG_FILE = path.join(DATA_DIR, 'voxta.log');
// Không phải "config" theo nghĩa của opencode (settings thật nằm trong SQLite, trong chính
// VOXTA_DATA_DIR) — chỉ ghi lại port/thời điểm start gần nhất để `status`/`open` biết mở đúng URL.
const RUNTIME_FILE = path.join(DATA_DIR, 'runtime.json');
const SERVER_ENTRY = path.join(__dirname, '../.next/standalone/server.js');
const DEFAULT_PORT = 3000;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const command = process.argv[2];
const args = process.argv.slice(3);

const commands = {
  start: { description: 'Start voxta in background', handler: cmdStart },
  stop: { description: 'Stop the running voxta server', handler: cmdStop },
  restart: { description: 'Restart voxta', handler: cmdRestart },
  status: { description: 'Show voxta status', handler: cmdStatus },
  open: { description: 'Open the Settings page in your browser', handler: cmdOpen },
  logs: { description: 'Show voxta logs', handler: cmdLogs },
  run: { description: 'Run voxta in foreground (debug)', handler: cmdRun },
  install: { description: 'Register as system service (auto-start)', handler: cmdInstall },
  uninstall: { description: 'Remove system service', handler: cmdUninstall },
  upgrade: { description: 'Upgrade to latest (or specified) version', handler: cmdUpgrade },
  purge: { description: 'Completely remove voxta from this machine', handler: cmdPurge },
  help: { description: 'Show this help message', handler: cmdHelp },
};

if (command === '--version' || command === '-v') {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));
  console.log(pkg.version);
} else if (!command || command === 'help' || command === '--help' || command === '-h') {
  cmdHelp();
} else if (commands[command]) {
  commands[command].handler();
} else {
  console.error(`Unknown command: ${command}`);
  console.error('Run "voxta help" for available commands.');
  process.exit(1);
}

// ===== Commands =====

function cmdStart() {
  if (isRunning()) {
    console.log('voxta is already running (PID: ' + readPid() + ')');
    return;
  }
  if (!fs.existsSync(SERVER_ENTRY)) {
    console.error(`Không thấy server đã build: ${SERVER_ENTRY}`);
    console.error('Package này có vẻ thiếu .next/standalone — cài lại từ bản build đầy đủ.');
    process.exit(1);
  }

  console.log('Starting voxta...');
  const port = parsePortArg() ?? DEFAULT_PORT;

  const logStream = fs.openSync(LOG_FILE, 'a');
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    detached: true,
    stdio: ['ignore', logStream, logStream],
    env: {
      ...process.env,
      VOXTA_DATA_DIR: DATA_DIR,
      PORT: String(port),
      HOSTNAME: '0.0.0.0',
      NODE_ENV: 'production',
    },
  });
  child.unref();
  fs.writeFileSync(PID_FILE, String(child.pid));
  writeRuntime({ port, startedAt: new Date().toISOString() });

  setTimeout(() => {
    if (!isRunning()) {
      console.error('voxta failed to start. Check logs:');
      try {
        const lines = fs.readFileSync(LOG_FILE, 'utf-8').trim().split('\n').slice(-5);
        lines.forEach((l) => console.error('  ' + l));
      } catch {
        // Chưa có gì trong log — bỏ qua, thông báo lỗi ở trên là đủ.
      }
      cleanPid();
      process.exit(1);
    } else {
      console.log(`voxta started (PID: ${child.pid})`);
      showInfo();
    }
  }, 1500);
}

function cmdStop() {
  const pid = readPid();
  if (!pid || !isRunning()) {
    console.log('voxta is not running.');
    cleanPid();
    return;
  }
  console.log(`Stopping voxta (PID: ${pid})...`);
  try {
    process.kill(pid, 'SIGTERM');
    console.log('voxta stopped.');
  } catch {
    console.log('Process not found, cleaning up.');
  }
  cleanPid();
}

function cmdRestart() {
  cmdStop();
  setTimeout(() => cmdStart(), 500);
}

function cmdStatus() {
  if (isRunning()) {
    console.log(`voxta is running (PID: ${readPid()})`);
    showInfo();
  } else {
    console.log('voxta is not running.');
    cleanPid();
  }
}

function cmdOpen() {
  const runtime = readRuntime();
  const port = runtime?.port ?? DEFAULT_PORT;
  const url = `http://localhost:${port}/settings`;
  console.log(`Opening ${url}`);
  openBrowser(url);
}

function cmdLogs() {
  const lines = args.find((a) => a !== '-f' && a !== '--follow') || '50';
  if (!fs.existsSync(LOG_FILE)) {
    console.log('No log file found.');
    return;
  }
  if (args.includes('-f') || args.includes('--follow')) {
    followLogFile(parseInt(lines, 10));
    return;
  }
  const content = fs.readFileSync(LOG_FILE, 'utf-8');
  console.log(content.split('\n').slice(-parseInt(lines, 10)).join('\n'));
}

/** Poll kích thước file thay vì shell ra `tail -f` — không có sẵn `tail` trên Windows, và `-f`
 * theo dõi theo file descriptor nên không bám lại được sau khi `restart` tạo file log mới (inode
 * khác). Đọc lại từ đầu nếu file bị truncate/thay thế (size giảm). */
function followLogFile(initialLines) {
  const initialContent = fs.readFileSync(LOG_FILE, 'utf-8');
  const lastLines = initialContent.split('\n').slice(-initialLines).join('\n');
  if (lastLines) process.stdout.write(lastLines + '\n');

  let position = fs.statSync(LOG_FILE).size;
  const interval = setInterval(() => {
    let stat;
    try {
      stat = fs.statSync(LOG_FILE);
    } catch {
      return;
    }
    if (stat.size < position) position = 0;
    if (stat.size <= position) return;
    const fd = fs.openSync(LOG_FILE, 'r');
    const buffer = Buffer.alloc(stat.size - position);
    fs.readSync(fd, buffer, 0, buffer.length, position);
    fs.closeSync(fd);
    position = stat.size;
    process.stdout.write(buffer.toString('utf-8'));
  }, 1000);

  process.on('SIGINT', () => {
    clearInterval(interval);
    process.exit(0);
  });
}

function cmdRun() {
  console.log('Running voxta in foreground (Ctrl+C to stop)...');
  const port = parsePortArg() ?? DEFAULT_PORT;
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    stdio: 'inherit',
    env: {
      ...process.env,
      VOXTA_DATA_DIR: DATA_DIR,
      PORT: String(port),
      NODE_ENV: 'production',
    },
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

function cmdInstall() {
  const platform = process.platform;
  const nodePath = process.execPath;
  const cliPath = path.join(__dirname, 'cli.js');
  const port = parsePortArg() ?? DEFAULT_PORT;

  if (platform === 'linux') {
    const serviceDir = path.join(os.homedir(), '.config/systemd/user');
    const servicePath = path.join(serviceDir, 'voxta.service');
    const unit = `[Unit]
Description=voxta
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${nodePath} ${cliPath} run --port ${port}
Restart=on-failure
RestartSec=5
Environment=VOXTA_DATA_DIR=${DATA_DIR}

[Install]
WantedBy=default.target
`;
    fs.mkdirSync(serviceDir, { recursive: true });
    fs.writeFileSync(servicePath, unit);
    try {
      execSync('systemctl --user daemon-reload');
      execSync('systemctl --user enable voxta.service');
      execSync('systemctl --user start voxta.service');
      execSync(`loginctl enable-linger ${os.userInfo().username}`);
      console.log('Service installed and started.');
      console.log('  systemctl --user status voxta');
      console.log('  journalctl --user -u voxta -f');
    } catch (err) {
      console.error('Failed to enable service:', err.message);
      console.log(`Service file written to: ${servicePath}`);
    }
  } else if (platform === 'darwin') {
    const plistDir = path.join(os.homedir(), 'Library/LaunchAgents');
    const plistPath = path.join(plistDir, 'com.voxta.server.plist');
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.voxta.server</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${cliPath}</string>
    <string>run</string>
    <string>--port</string>
    <string>${port}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>VOXTA_DATA_DIR</key>
    <string>${DATA_DIR}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_FILE}</string>
  <key>StandardErrorPath</key>
  <string>${LOG_FILE}</string>
</dict>
</plist>
`;
    fs.mkdirSync(plistDir, { recursive: true });
    fs.writeFileSync(plistPath, plist);
    try {
      execSync(`launchctl load -w "${plistPath}"`);
      console.log('LaunchAgent installed and started.');
      console.log('  launchctl list | grep voxta');
      console.log(`  launchctl unload "${plistPath}"`);
    } catch (err) {
      console.error('Failed to load LaunchAgent:', err.message);
      console.log(`Plist written to: ${plistPath}`);
    }
  } else if (platform === 'win32') {
    const taskName = 'VoxtaServer';
    const cmd = `schtasks /Create /F /SC ONLOGON /TN "${taskName}" /TR "\\"${nodePath}\\" \\"${cliPath}\\" run --port ${port}" /RL HIGHEST`;
    try {
      execSync(cmd);
      execSync(`schtasks /Run /TN "${taskName}"`);
      console.log('Scheduled task created and started.');
      console.log(`  schtasks /Query /TN "${taskName}"`);
    } catch (err) {
      console.error('Failed to create scheduled task:', err.message);
      console.log('Try running this command as Administrator.');
    }
  } else {
    console.error(`Unsupported platform: ${platform}`);
  }
}

function cmdUninstall() {
  const platform = process.platform;
  if (platform === 'linux') {
    try {
      execSync('systemctl --user stop voxta.service 2>/dev/null');
      execSync('systemctl --user disable voxta.service 2>/dev/null');
    } catch {
      // Chưa từng cài/đã gỡ sẵn — không phải lỗi cần báo.
    }
    try {
      fs.unlinkSync(path.join(os.homedir(), '.config/systemd/user/voxta.service'));
    } catch {
      // File không tồn tại — bỏ qua.
    }
    try {
      execSync('systemctl --user daemon-reload');
    } catch {
      // systemd --user không khả dụng (hiếm) — không chặn phần còn lại của uninstall.
    }
    console.log('Service removed.');
  } else if (platform === 'darwin') {
    const plistPath = path.join(os.homedir(), 'Library/LaunchAgents/com.voxta.server.plist');
    try {
      execSync(`launchctl unload -w "${plistPath}" 2>/dev/null`);
    } catch {
      // Chưa load/đã unload sẵn — không phải lỗi cần báo.
    }
    try {
      fs.unlinkSync(plistPath);
    } catch {
      // File không tồn tại — bỏ qua.
    }
    console.log('LaunchAgent removed.');
  } else if (platform === 'win32') {
    const taskName = 'VoxtaServer';
    try {
      execSync(`schtasks /End /TN "${taskName}" 2>nul`);
      execSync(`schtasks /Delete /F /TN "${taskName}"`);
    } catch {
      // Task chưa từng tạo/đã xoá sẵn — không phải lỗi cần báo.
    }
    console.log('Scheduled task removed.');
  } else {
    console.error(`Unsupported platform: ${platform}`);
  }
}

function cmdUpgrade() {
  const target = args[0] || 'latest';
  const pkg = 'voxta';
  console.log(`Upgrading ${pkg} to ${target}...`);

  const wasRunning = isRunning();
  if (wasRunning) {
    console.log('Stopping voxta...');
    cmdStop();
  }

  const installCmd = `npm install -g ${pkg}@${target}`;
  try {
    execSync(installCmd, { stdio: 'inherit' });
  } catch {
    if (process.platform !== 'win32') {
      console.log('Permission denied, retrying with sudo...');
      try {
        execSync(`sudo ${installCmd}`, { stdio: 'inherit' });
      } catch (err) {
        console.error('Upgrade failed:', err.message);
        process.exit(1);
      }
    } else {
      console.error('Upgrade failed. Try running as Administrator.');
      process.exit(1);
    }
  }

  console.log('Upgrade complete.');
  if (wasRunning) {
    console.log('Restarting voxta...');
    cmdStart();
  }
}

function cmdPurge() {
  console.log('');
  console.log('  ⚠ This will completely remove voxta from this machine:');
  console.log('    - Stop the running server');
  console.log('    - Remove system service (if installed)');
  console.log(`    - Delete data directory (settings + SQLite db): ${DATA_DIR}`);
  console.log('    - Uninstall the npm package globally');
  console.log('');

  if (!args.includes('--yes') && !args.includes('-y')) {
    console.log('  Run with --yes to confirm:');
    console.log('    voxta purge --yes');
    console.log('');
    return;
  }

  console.log('Stopping voxta...');
  const pid = readPid();
  if (pid && isRunning()) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Đã chết sẵn — không phải lỗi cần báo.
    }
  }
  cleanPid();

  console.log('Removing system service...');
  cmdUninstall();

  console.log(`Deleting ${DATA_DIR}...`);
  try {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
    console.log('Data directory removed.');
  } catch (err) {
    console.error('Could not delete data directory:', err.message);
  }

  console.log('Uninstalling voxta globally...');
  try {
    execSync('npm uninstall -g voxta', { stdio: 'inherit' });
  } catch {
    console.log('Could not uninstall package (may not be installed globally).');
  }

  console.log('');
  console.log('voxta has been completely removed from this machine.');
}

function cmdHelp() {
  console.log('');
  console.log('  voxta');
  console.log('');
  console.log('  Usage: voxta <command> [options]');
  console.log('');
  console.log('  Commands:');
  const maxLen = Math.max(...Object.keys(commands).map((k) => k.length));
  for (const [name, info] of Object.entries(commands)) {
    console.log(`    ${name.padEnd(maxLen + 2)} ${info.description}`);
  }
  console.log('');
  console.log('  Examples:');
  console.log('    voxta start              Start in background (port 3000)');
  console.log('    voxta start --port 8080  Start on a custom port');
  console.log('    voxta status             Check if running');
  console.log('    voxta open               Open the Settings page');
  console.log('    voxta logs -f            Follow log output');
  console.log('    voxta install            Auto-start at login, restart on crash');
  console.log('    voxta purge --yes        Remove voxta completely');
  console.log('');
}

// ===== Helpers =====

function parsePortArg() {
  const idx = args.indexOf('--port');
  if (idx === -1) return null;
  const value = Number(args[idx + 1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function readPid() {
  try {
    return parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10);
  } catch {
    return null;
  }
}

function cleanPid() {
  try {
    fs.unlinkSync(PID_FILE);
  } catch {
    // File không tồn tại — bỏ qua.
  }
}

function isRunning() {
  const pid = readPid();
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function writeRuntime(data) {
  fs.writeFileSync(RUNTIME_FILE, JSON.stringify(data, null, 2));
}

function readRuntime() {
  try {
    return JSON.parse(fs.readFileSync(RUNTIME_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function showInfo() {
  const runtime = readRuntime();
  const port = runtime?.port ?? DEFAULT_PORT;
  console.log(`  URL  : http://localhost:${port}`);
  console.log(`  Logs : ${LOG_FILE}`);
}

function openBrowser(url) {
  const platform = process.platform;
  try {
    if (platform === 'darwin') execSync(`open "${url}"`);
    else if (platform === 'win32') execSync(`start "" "${url}"`);
    else execSync(`xdg-open "${url}"`);
  } catch {
    console.log(`Could not open browser. Visit: ${url}`);
  }
}
