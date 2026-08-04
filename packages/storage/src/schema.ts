import { commandLanguages } from "@bucket-command/core";
import type { Database } from "better-sqlite3";

export const currentSchemaVersion = 5;

const commandLanguageList = commandLanguages.map((language) => `'${language}'`).join(", ");

export const migrate = (database: Database): void => {
  database.pragma("foreign_keys = ON");
  database.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_key TEXT NOT NULL UNIQUE,
      icon_key TEXT,
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
      language TEXT NOT NULL CHECK (language IN (${commandLanguageList})),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON UPDATE CASCADE ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS sequences (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category_id TEXT NOT NULL,
      alias TEXT NOT NULL,
      alias_key TEXT NOT NULL UNIQUE,
      note TEXT,
      shell_target TEXT NOT NULL CHECK (shell_target IN ('bash', 'powershell')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON UPDATE CASCADE ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS sequence_items (
      sequence_id TEXT NOT NULL,
      command_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (sequence_id, position),
      UNIQUE (sequence_id, command_id, position),
      FOREIGN KEY (sequence_id) REFERENCES sequences(id) ON UPDATE CASCADE ON DELETE CASCADE,
      FOREIGN KEY (command_id) REFERENCES commands(id) ON UPDATE CASCADE ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS annotations (
      id TEXT PRIMARY KEY,
      title TEXT,
      content TEXT NOT NULL,
      note TEXT,
      language TEXT NOT NULL CHECK (language IN (${commandLanguageList})),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sequences_category_id ON sequences(category_id);
    CREATE INDEX IF NOT EXISTS idx_sequence_items_command_id ON sequence_items(command_id);
    CREATE INDEX IF NOT EXISTS idx_annotations_updated_at ON annotations(updated_at);
  `);
  ensureColumn(database, "categories", "icon_key", "TEXT");
  migrateCommandsShellTargetToLanguage(database);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_commands_category_id ON commands(category_id);
    CREATE INDEX IF NOT EXISTS idx_commands_language ON commands(language);
  `);
  database.pragma(`user_version = ${currentSchemaVersion}`);
};

const ensureColumn = (database: Database, table: string, column: string, definition: string): void => {
  const columns = database.pragma(`table_info(${table})`) as Array<{ name: string }>;

  if (!columns.some((item) => item.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
};

/**
 * Pre-existing databases created the `commands` table with a `shell_target` column whose
 * CHECK constraint only allowed a handful of shell names. SQLite can't widen a CHECK
 * constraint with ALTER TABLE, so the table is rebuilt in place. Any stored value that no
 * longer matches the curated language list falls back to "other" rather than failing the
 * migration.
 */
const migrateCommandsShellTargetToLanguage = (database: Database): void => {
  const columns = database.pragma("table_info(commands)") as Array<{ name: string }>;
  const hasLanguageColumn = columns.some((column) => column.name === "language");

  if (hasLanguageColumn) {
    return;
  }

  // Dropping "commands" below is a DDL statement, and with foreign_keys enforcement on,
  // SQLite performs an implicit delete of every row first — which sequence_items'
  // ON DELETE RESTRICT would then reject for any command used in a sequence. Enforcement
  // can only be toggled outside a transaction, so it's turned off for the whole rebuild
  // and restored right after, success or failure.
  database.pragma("foreign_keys = OFF");

  try {
    const rebuild = database.transaction(() => {
      database.exec(`
        CREATE TABLE commands_migration (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          category_id TEXT NOT NULL,
          alias TEXT,
          alias_key TEXT UNIQUE,
          note TEXT,
          language TEXT NOT NULL CHECK (language IN (${commandLanguageList})),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (category_id) REFERENCES categories(id) ON UPDATE CASCADE ON DELETE RESTRICT
        );

        INSERT INTO commands_migration (
          id, title, content, category_id, alias, alias_key, note, language, created_at, updated_at
        )
        SELECT
          id, title, content, category_id, alias, alias_key, note,
          CASE WHEN shell_target IN (${commandLanguageList}) THEN shell_target ELSE 'other' END,
          created_at, updated_at
        FROM commands;

        DROP TABLE commands;
        ALTER TABLE commands_migration RENAME TO commands;
      `);
    });

    rebuild();
  } finally {
    database.pragma("foreign_keys = ON");
  }
};
