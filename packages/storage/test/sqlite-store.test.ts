import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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
    first.service.createCategory({ name: "SQL" });
    const multiline = "SELECT id,\n       name\nFROM users\nWHERE active = 1;";

    first.service.createCommand({
      title: "Active users",
      content: multiline,
      category: { name: "sql" },
      alias: "active-users",
      note: "Report query",
      shellTarget: "other"
    });
    first.store.close();

    const second = createService(databasePath);
    const command = second.service.getCommandByAlias("ACTIVE-USERS");

    expect(command.content).toBe(multiline);
    expect(command.categoryName).toBe("SQL");
    expect(command.note).toBe("Report query");
    second.store.close();
  });

  it("keeps migration idempotent and records the schema version", () => {
    const databasePath = join(makeTempDir(), "bucket-command.sqlite");
    const first = new SqliteBucketCommandStore({ databasePath });
    first.close();

    const second = new SqliteBucketCommandStore({ databasePath });
    expect(second.listCategories()).toEqual([]);
    expect(currentSchemaVersion).toBe(1);
    second.close();
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
      shellTarget: "bash"
    });

    expect(() =>
      service.createCommand({
        title: "Duplicate",
        content: "ls",
        category: { id: category.id },
        alias: "WHERE-AM-I",
        shellTarget: "bash"
      })
    ).toThrow(/alias already exists/);
    expect(() => service.deleteCategory(category.id)).toThrow(/contains commands/);
    store.close();
  });

  it("searches by text and filters by category and shell target", () => {
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
      shellTarget: "bash"
    });
    service.createCommand({
      title: "Count users",
      content: "select count(*) from users;",
      category: { name: "sql" },
      shellTarget: "other"
    });

    expect(service.listCommands({ query: "users" })).toHaveLength(1);
    expect(service.listCommands({ category: { name: "BASH" }, shellTarget: "bash" })).toHaveLength(1);
    expect(service.listCommands({ category: { name: "bash" }, shellTarget: "other" })).toHaveLength(0);
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
