import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

/** SQLite dùng chung cho toàn bộ config voxta — thay localStorage (mỗi browser 1 bản riêng,
 * không đồng bộ). File nằm ngoài git (data/ gitignored); voxta 1 user duy nhất nên 1 hàng
 * key-value đơn giản là đủ, không cần schema quan hệ.
 *
 * Mặc định `<cwd>/data` — đúng cho Docker (WORKDIR /app) và chạy native từ trong thư mục repo
 * (`scripts/voxta-ctl.sh` luôn `cd` vào repo trước khi chạy). Cài qua `bin/cli.js` (global npm
 * package) thì KHÔNG có "thư mục repo" nào để đứng vào — cwd lúc gõ `voxta start` là bất kỳ đâu —
 * nên `cli.js` tự set `VOXTA_DATA_DIR=~/.voxta/data` trước khi spawn server, ghi đè mặc định này. */
const DATA_DIR = process.env.VOXTA_DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'voxta.db');

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const instance = new Database(DB_PATH);
  instance.pragma('journal_mode = WAL');
  instance.exec(
    'CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)',
  );
  instance.exec(
    `CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      messages TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
  );
  db = instance;
  return instance;
}

export interface ConversationRow {
  id: string;
  title: string;
  messages: string;
  created_at: number;
  updated_at: number;
}

export function listConversations(): Omit<ConversationRow, 'messages'>[] {
  return getDb()
    .prepare('SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC')
    .all() as Omit<ConversationRow, 'messages'>[];
}

export function readConversation(id: string): ConversationRow | null {
  const row = getDb().prepare('SELECT * FROM conversations WHERE id = ?').get(id) as
    | ConversationRow
    | undefined;
  return row ?? null;
}

export function upsertConversation(row: { id: string; title: string; messages: string }): void {
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO conversations (id, title, messages, created_at, updated_at)
       VALUES (@id, @title, @messages, @now, @now)
       ON CONFLICT(id) DO UPDATE SET title = @title, messages = @messages, updated_at = @now`,
    )
    .run({ ...row, now });
}

export function deleteConversation(id: string): void {
  getDb().prepare('DELETE FROM conversations WHERE id = ?').run(id);
}

export function readSettingsJson(): string | null {
  const row = getDb().prepare('SELECT data FROM settings WHERE id = 1').get() as
    | { data: string }
    | undefined;
  return row?.data ?? null;
}

export function writeSettingsJson(json: string): void {
  getDb()
    .prepare(
      'INSERT INTO settings (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',
    )
    .run(json);
}
