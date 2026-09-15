import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

/** SQLite dùng chung cho toàn bộ config voxta — thay localStorage (mỗi browser 1 bản riêng,
 * không đồng bộ). File nằm ngoài git (data/ gitignored); voxta 1 user duy nhất nên 1 hàng
 * key-value đơn giản là đủ, không cần schema quan hệ. */
const DB_PATH = path.join(process.cwd(), 'data', 'voxta.db');

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const instance = new Database(DB_PATH);
  instance.pragma('journal_mode = WAL');
  instance.exec(
    'CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)',
  );
  db = instance;
  return instance;
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
