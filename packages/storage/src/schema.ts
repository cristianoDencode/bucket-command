import type { Database } from "better-sqlite3";

export const currentSchemaVersion = 1;

export const migrate = (database: Database): void => {
  database.pragma("foreign_keys = ON");
  database.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_key TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS commands (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category_id TEXT NOT NULL,
      alias TEXT,
      alias_key TEXT UNIQUE,
      note TEXT,
      shell_target TEXT NOT NULL CHECK (shell_target IN ('bash', 'powershell', 'other')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON UPDATE CASCADE ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_commands_category_id ON commands(category_id);
    CREATE INDEX IF NOT EXISTS idx_commands_shell_target ON commands(shell_target);
  `);
  database.pragma(`user_version = ${currentSchemaVersion}`);
};
