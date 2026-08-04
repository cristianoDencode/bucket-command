import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import DatabaseConstructor from "better-sqlite3";
import { BucketCommandService } from "@bucket-command/core";
import {
  currentSchemaVersion,
  dataDirEnvName,
  resolveDataDir,
  resolveDatabasePath,
  SqliteBucketCommandStore
} from "../src/index.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const directory = mkdtempSync(join(tmpdir(), "bucket-command-"));
  tempDirs.push(directory);
  return directory;
};

const createService = (databasePath: string): { service: BucketCommandService; store: SqliteBucketCommandStore } => {
  let id = 0;
  const store = new SqliteBucketCommandStore({ databasePath });
  const service = new BucketCommandService(store, {
    idFactory: () => `id-${++id}`,
    now: () => new Date("2026-07-28T12:00:00.000Z")
  });

  return { service, store };
};

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("SQLite storage", () => {
  it("persists multiline commands and recovers them by alias after reopening", () => {
    const databasePath = join(makeTempDir(), "bucket-command.sqlite");
    const first = createService(databasePath);
    first.service.createCategory({ name: "SQL", iconKey: "database" });
    const multiline = "SELECT id,\n       name\nFROM users\nWHERE active = 1;";

    first.service.createCommand({
      title: "Active users",
      content: multiline,
      category: { name: "sql" },
      alias: "active-users",
      note: "Report query",
      language: "sql"
    });
    first.store.close();

    const second = createService(databasePath);
    const command = second.service.getCommandByAlias("ACTIVE-USERS");

    expect(command.content).toBe(multiline);
    expect(command.categoryName).toBe("SQL");
    expect(command.note).toBe("Report query");
    expect(second.service.listCategories()[0]?.iconKey).toBe("database");
    second.store.close();
  });

  it("keeps migration idempotent and records the schema version", () => {
    const databasePath = join(makeTempDir(), "bucket-command.sqlite");
    const first = new SqliteBucketCommandStore({ databasePath });
    first.close();

    const second = new SqliteBucketCommandStore({ databasePath });
    expect(second.listCategories()).toEqual([]);
    expect(currentSchemaVersion).toBe(5);
    second.close();
  });

  it("persists annotations after reopening", () => {
    const databasePath = join(makeTempDir(), "bucket-command.sqlite");
    const first = createService(databasePath);
    const annotation = first.service.createAnnotation({
      title: null,
      content: "SELECT *\nFROM tasks;",
      note: "Demand scratch",
      language: "sql"
    });
    first.service.updateAnnotation(annotation.id, { title: "1234", content: annotation.content, language: "sql" });
    first.store.close();

    const second = createService(databasePath);
    const [persisted] = second.service.listAnnotations();

    expect(persisted?.title).toBe("1234");
    expect(persisted?.content).toBe("SELECT *\nFROM tasks;");
    expect(persisted?.note).toBe("Demand scratch");
    expect(persisted?.language).toBe("sql");
    second.store.close();
  });

  it("persists sequences with ordered command items", () => {
    const databasePath = join(makeTempDir(), "bucket-command.sqlite");
    const first = createService(databasePath);
    first.service.createCategory({ name: "git" });
    first.service.createCommand({
      title: "Status",
      content: "git status",
      category: { name: "git" },
      alias: "gst",
      language: "bash"
    });
    first.service.createCommand({
      title: "Branch",
      content: "git branch --show-current",
      category: { name: "git" },
      alias: "gbranch",
      language: "bash"
    });
    first.service.createSequence({
      title: "Git overview",
      category: { name: "git" },
      alias: "goverview",
      shellTarget: "bash",
      commandAliases: ["gst", "gbranch"]
    });
    first.store.close();

    const second = createService(databasePath);
    const sequence = second.service.getSequenceByAlias("GOVERVIEW");

    expect(sequence.items.map((item) => item.command.alias)).toEqual(["gst", "gbranch"]);
    expect(() => second.service.deleteCommand(sequence.items[0].command.id)).toThrow(/used by a sequence/);
    second.store.close();
  });

  it("enforces case-insensitive uniqueness and occupied category protection", () => {
    const databasePath = join(makeTempDir(), "bucket-command.sqlite");
    const { service, store } = createService(databasePath);
    const category = service.createCategory({ name: "Bash" });

    expect(() => service.createCategory({ name: "bash" })).toThrow(/category name already exists/);

    service.createCommand({
      title: "Current directory",
      content: "pwd",
      category: { id: category.id },
      alias: "where-am-i",
      language: "bash"
    });

    expect(() =>
      service.createCommand({
        title: "Duplicate",
        content: "ls",
        category: { id: category.id },
        alias: "WHERE-AM-I",
        language: "bash"
      })
    ).toThrow(/alias already exists/);
    expect(() => service.deleteCategory(category.id)).toThrow(/contains commands/);
    store.close();
  });

  it("searches by text and filters by category and language", () => {
    const databasePath = join(makeTempDir(), "bucket-command.sqlite");
    const { service, store } = createService(databasePath);
    const bash = service.createCategory({ name: "bash" });
    service.createCategory({ name: "sql" });

    service.createCommand({
      title: "Find markdown",
      content: "find . -name '*.md'",
      category: { id: bash.id },
      alias: "find-md",
      note: "docs",
      language: "bash"
    });
    service.createCommand({
      title: "Count users",
      content: "select count(*) from users;",
      category: { name: "sql" },
      language: "sql"
    });

    expect(service.listCommands({ query: "users" })).toHaveLength(1);
    expect(service.listCommands({ category: { name: "BASH" }, language: "bash" })).toHaveLength(1);
    expect(service.listCommands({ category: { name: "bash" }, language: "sql" })).toHaveLength(0);
    store.close();
  });

  it("migrates a pre-existing shell_target database (with a sequence in use) to the language column", () => {
    const databasePath = join(makeTempDir(), "bucket-command.sqlite");

    // Hand-build the pre-rename schema (shell_target column, no "other"-aware language list)
    // exactly as an older release of the app would have left it on disk.
    const legacy = new DatabaseConstructor(databasePath);
    legacy.pragma("foreign_keys = ON");
    legacy.exec(`
      CREATE TABLE categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        name_key TEXT NOT NULL UNIQUE,
        icon_key TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE commands (
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
      CREATE TABLE sequences (
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
      CREATE TABLE sequence_items (
        sequence_id TEXT NOT NULL,
        command_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        PRIMARY KEY (sequence_id, position),
        FOREIGN KEY (sequence_id) REFERENCES sequences(id) ON UPDATE CASCADE ON DELETE CASCADE,
        FOREIGN KEY (command_id) REFERENCES commands(id) ON UPDATE CASCADE ON DELETE RESTRICT
      );
      INSERT INTO categories (id, name, name_key, icon_key, created_at, updated_at)
        VALUES ('cat-1', 'git', 'git', NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
      INSERT INTO commands (id, title, content, category_id, alias, alias_key, note, shell_target, created_at, updated_at)
        VALUES ('cmd-1', 'Status', 'git status', 'cat-1', 'gst', 'gst', NULL, 'bash', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
      INSERT INTO sequences (id, title, category_id, alias, alias_key, note, shell_target, created_at, updated_at)
        VALUES ('seq-1', 'Overview', 'cat-1', 'goverview', 'goverview', NULL, 'bash', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
      INSERT INTO sequence_items (sequence_id, command_id, position) VALUES ('seq-1', 'cmd-1', 1);
    `);
    legacy.close();

    // Opening through the store must migrate commands.shell_target -> language in place,
    // without the sequence's ON DELETE RESTRICT foreign key blocking the table rebuild.
    const { service, store } = createService(databasePath);

    const migratedCommand = service.getCommandByAlias("gst");
    expect(migratedCommand.language).toBe("bash");
    expect(service.getSequenceByAlias("goverview").items).toHaveLength(1);

    // Regression check for the reported bug: creating a brand-new command outside the
    // original bash/powershell/other set must work against the migrated table.
    const sqlCommand = service.createCommand({
      title: "Count users",
      content: "select count(*) from users;",
      category: { id: "cat-1" },
      alias: "count-users",
      language: "sql"
    });
    expect(sqlCommand.language).toBe("sql");

    store.close();
  });

  it("resolves cross-platform data paths and honors the product env override", () => {
    const override = join(makeTempDir(), "isolated");

    expect(resolveDataDir({ env: { [dataDirEnvName]: override } })).toBe(override);
    expect(resolveDatabasePath({ env: { [dataDirEnvName]: override } })).toBe(join(override, "bucket-command.sqlite"));
    expect(resolveDataDir({ env: { APPDATA: "C:\\Users\\dev\\AppData\\Roaming" }, platform: "win32" })).toContain(
      "bucket-command"
    );
    expect(resolveDataDir({ env: { XDG_DATA_HOME: "/tmp/data" }, platform: "linux" })).toBe("/tmp/data/bucket-command");
  });
});
