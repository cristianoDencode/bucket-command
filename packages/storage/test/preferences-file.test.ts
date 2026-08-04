import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  defaultBackupPreferences,
  readBackupPreferences,
  resolvePreferencesPath,
  validateBackupPreferences,
  validateBackupPreferencesInput,
  writeBackupPreferences
} from "../src/preferences-file.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const directory = mkdtempSync(join(tmpdir(), "bucket-command-preferences-"));
  tempDirs.push(directory);
  return directory;
};

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("backup preferences file", () => {
  it("returns safe defaults with no warning when the file does not exist", async () => {
    const dataDir = makeTempDir();
    const result = await readBackupPreferences({ env: { BUCKET_COMMAND_DATA_DIR: dataDir } });

    expect(result.warning).toBeNull();
    expect(result.preferences).toEqual(defaultBackupPreferences());
  });

  it("persists and reloads preferences", async () => {
    const dataDir = makeTempDir();
    const env = { BUCKET_COMMAND_DATA_DIR: dataDir };
    const preferences = {
      backupOnQuit: true,
      scheduledBackupEnabled: true,
      intervalHours: 6,
      destinationFolder: "/tmp/backups",
      maxAutoBackups: 3,
      lastAutoBackupAt: "2026-07-29T10:00:00.000Z"
    };

    await writeBackupPreferences(preferences, { env });
    const result = await readBackupPreferences({ env });

    expect(result.warning).toBeNull();
    expect(result.preferences).toEqual(preferences);
    const raw = readFileSync(resolvePreferencesPath({ env }), "utf8");
    expect(JSON.parse(raw)).toEqual(preferences);
  });

  it("falls back to defaults with a warning when the file is corrupted JSON", async () => {
    const dataDir = makeTempDir();
    const env = { BUCKET_COMMAND_DATA_DIR: dataDir };
    await writeBackupPreferences(defaultBackupPreferences(), { env });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(resolvePreferencesPath({ env }), "{ not valid json", "utf8");

    const result = await readBackupPreferences({ env });

    expect(result.warning).not.toBeNull();
    expect(result.preferences).toEqual(defaultBackupPreferences());
  });

  it("falls back to defaults with a warning when the file content fails validation", async () => {
    const dataDir = makeTempDir();
    const env = { BUCKET_COMMAND_DATA_DIR: dataDir };
    const { writeFileSync } = await import("node:fs");
    writeFileSync(resolvePreferencesPath({ env }), JSON.stringify({ backupOnQuit: "yes" }), "utf8");

    const result = await readBackupPreferences({ env });

    expect(result.warning).not.toBeNull();
    expect(result.preferences).toEqual(defaultBackupPreferences());
  });

  it("rejects an interval below the minimum", () => {
    expect(() =>
      validateBackupPreferencesInput({
        backupOnQuit: false,
        scheduledBackupEnabled: true,
        intervalHours: 0,
        destinationFolder: null,
        maxAutoBackups: 1
      })
    ).toThrow(/intervalHours/);
  });

  it("rejects a maximum copy count below the minimum", () => {
    expect(() =>
      validateBackupPreferencesInput({
        backupOnQuit: false,
        scheduledBackupEnabled: false,
        intervalHours: 1,
        destinationFolder: null,
        maxAutoBackups: 0
      })
    ).toThrow(/maxAutoBackups/);
  });

  it("rejects non-boolean toggle fields", () => {
    expect(() =>
      validateBackupPreferences({
        backupOnQuit: "true",
        scheduledBackupEnabled: false,
        intervalHours: 1,
        destinationFolder: null,
        maxAutoBackups: 1,
        lastAutoBackupAt: null
      })
    ).toThrow(/backupOnQuit/);
  });
});
