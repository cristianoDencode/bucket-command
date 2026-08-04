import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BucketCommandService } from "@bucket-command/core";
import { automaticBackupPrefix, backupLibraryFile, manualBackupPrefix, rotateAutomaticBackups } from "../src/library-files.js";
import { SqliteBucketCommandStore } from "../src/sqlite-store.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const directory = mkdtempSync(join(tmpdir(), "bucket-command-library-files-"));
  tempDirs.push(directory);
  return directory;
};

const createService = (databasePath: string): { service: BucketCommandService; store: SqliteBucketCommandStore } => {
  const store = new SqliteBucketCommandStore({ databasePath });
  const service = new BucketCommandService(store);
  service.createCategory({ name: "bash" });
  service.createCommand({ title: "pwd", content: "pwd", category: { name: "bash" }, language: "bash" });
  return { service, store };
};

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("backupLibraryFile prefix", () => {
  it("uses the manual prefix by default", async () => {
    const dataDir = makeTempDir();
    const backupDir = makeTempDir();
    const { service, store } = createService(join(dataDir, "bucket-command.sqlite"));

    const result = await backupLibraryFile(service, backupDir);
    store.close();

    expect(basename(result.path)).toMatch(new RegExp(`^${manualBackupPrefix}-.*\\.json$`));
    expect(result.path.includes(automaticBackupPrefix)).toBe(false);
  });

  it("uses the automatic prefix when requested", async () => {
    const dataDir = makeTempDir();
    const backupDir = makeTempDir();
    const { service, store } = createService(join(dataDir, "bucket-command.sqlite"));

    const result = await backupLibraryFile(service, backupDir, { prefix: automaticBackupPrefix });
    store.close();

    expect(basename(result.path)).toMatch(new RegExp(`^${automaticBackupPrefix}-.*\\.json$`));
    expect(existsSync(result.path)).toBe(true);
  });
});

describe("rotateAutomaticBackups", () => {
  it("keeps only the most recent N automatic backup files and ignores manual/other files", async () => {
    const directory = makeTempDir();
    const timestamps = ["2026-07-01T00-00-00Z", "2026-07-02T00-00-00Z", "2026-07-03T00-00-00Z", "2026-07-04T00-00-00Z"];

    for (const timestamp of timestamps) {
      writeFileSync(join(directory, `${automaticBackupPrefix}-${timestamp}.json`), "{}", "utf8");
    }
    writeFileSync(join(directory, `${manualBackupPrefix}-2026-07-05T00-00-00Z.json`), "{}", "utf8");
    writeFileSync(join(directory, "unrelated-file.json"), "{}", "utf8");

    await rotateAutomaticBackups(directory, 2);

    const remaining = readdirSync(directory).sort();
    expect(remaining).toEqual(
      [
        `${automaticBackupPrefix}-2026-07-03T00-00-00Z.json`,
        `${automaticBackupPrefix}-2026-07-04T00-00-00Z.json`,
        `${manualBackupPrefix}-2026-07-05T00-00-00Z.json`,
        "unrelated-file.json"
      ].sort()
    );
  });

  it("does nothing when the file count is within the limit", async () => {
    const directory = makeTempDir();
    writeFileSync(join(directory, `${automaticBackupPrefix}-2026-07-01T00-00-00Z.json`), "{}", "utf8");

    await rotateAutomaticBackups(directory, 5);

    expect(readdirSync(directory)).toEqual([`${automaticBackupPrefix}-2026-07-01T00-00-00Z.json`]);
  });

  it("does not throw when the directory does not exist", async () => {
    await expect(rotateAutomaticBackups(join(tmpdir(), "bucket-command-missing-dir"), 2)).resolves.toBeUndefined();
  });
});
