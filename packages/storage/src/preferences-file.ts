import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { BucketCommandError } from "@bucket-command/core";
import { resolveDataDir, type DataPathOptions } from "./paths.js";

const validationError = (message: string): BucketCommandError => new BucketCommandError("VALIDATION_ERROR", message);

export const preferencesFileName = "preferences.json";
export const minBackupIntervalHours = 1;
export const minAutomaticBackupCount = 1;

/** Preferences fields editable by the dashboard user. */
export interface BackupPreferencesInput {
  backupOnQuit: boolean;
  scheduledBackupEnabled: boolean;
  intervalHours: number;
  destinationFolder: string | null;
  maxAutoBackups: number;
}

/** Full persisted preferences, including state tracked internally by the app. */
export interface BackupPreferences extends BackupPreferencesInput {
  lastAutoBackupAt: string | null;
}

export interface ReadBackupPreferencesResult {
  preferences: BackupPreferences;
  /** Set when the file was missing/unreadable/invalid and defaults were used. */
  warning: string | null;
}

export const defaultBackupPreferences = (): BackupPreferences => ({
  backupOnQuit: false,
  scheduledBackupEnabled: false,
  intervalHours: 24,
  destinationFolder: null,
  maxAutoBackups: 5,
  lastAutoBackupAt: null
});

export const resolvePreferencesPath = (options: DataPathOptions = {}): string =>
  join(resolveDataDir(options), preferencesFileName);

export const readBackupPreferences = async (options: DataPathOptions = {}): Promise<ReadBackupPreferencesResult> => {
  const path = resolvePreferencesPath(options);
  let content: string;

  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return { preferences: defaultBackupPreferences(), warning: null };
    }

    return {
      preferences: defaultBackupPreferences(),
      warning: "Could not read backup preferences file; automatic backup disabled."
    };
  }

  try {
    return { preferences: validateBackupPreferences(JSON.parse(content) as unknown), warning: null };
  } catch {
    return {
      preferences: defaultBackupPreferences(),
      warning: "Backup preferences file is invalid; automatic backup disabled."
    };
  }
};

export const writeBackupPreferences = async (
  preferences: BackupPreferences,
  options: DataPathOptions = {}
): Promise<void> => {
  const validated = validateBackupPreferences(preferences);
  const path = resolvePreferencesPath(options);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
};

export const validateBackupPreferencesInput = (value: unknown): BackupPreferencesInput => {
  const record = asRecord(value);

  return {
    backupOnQuit: readBoolean(record.backupOnQuit, "backupOnQuit"),
    scheduledBackupEnabled: readBoolean(record.scheduledBackupEnabled, "scheduledBackupEnabled"),
    intervalHours: readMinInteger(record.intervalHours, "intervalHours", minBackupIntervalHours),
    destinationFolder: readNullableString(record.destinationFolder, "destinationFolder"),
    maxAutoBackups: readMinInteger(record.maxAutoBackups, "maxAutoBackups", minAutomaticBackupCount)
  };
};

export const validateBackupPreferences = (value: unknown): BackupPreferences => {
  const record = asRecord(value);
  const input = validateBackupPreferencesInput(record);

  return {
    ...input,
    lastAutoBackupAt: readNullableString(record.lastAutoBackupAt, "lastAutoBackupAt")
  };
};

const readBoolean = (value: unknown, field: string): boolean => {
  if (typeof value !== "boolean") {
    throw validationError(`${field} must be a boolean.`);
  }

  return value;
};

const readMinInteger = (value: unknown, field: string, min: number): number => {
  if (!Number.isInteger(value) || (value as number) < min) {
    throw validationError(`${field} must be an integer greater than or equal to ${min}.`);
  }

  return value as number;
};

const readNullableString = (value: unknown, field: string): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw validationError(`${field} must be a string or null.`);
  }

  return value;
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw validationError("preferences must be an object.");
  }

  return value as Record<string, unknown>;
};

const isErrnoException = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && "code" in error;
