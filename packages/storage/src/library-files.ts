import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import {
  exportLibrary,
  importLibrary,
  parseLibraryExport,
  summarizeLibrary,
  type BucketCommandService,
  type LibraryExport,
  type LibraryImportSummary,
  type LibrarySummary
} from "@bucket-command/core";
import type { SqliteBucketCommandStore } from "./sqlite-store.js";

export interface LibraryWriteResult {
  path: string;
  summary: LibrarySummary;
}

export interface BackupLibraryFileOptions {
  /** File name prefix used when the output path is a directory. Defaults to the manual backup prefix. */
  prefix?: string;
}

export const manualBackupPrefix = "bucket-command-backup";
export const automaticBackupPrefix = "bucket-command-backup-auto";

export const exportLibraryFile = async (service: BucketCommandService, outputPath: string): Promise<LibraryWriteResult> => {
  const library = exportLibrary(service);
  await writeJsonFile(outputPath, library);
  return { path: outputPath, summary: summarizeLibrary(library) };
};

export const backupLibraryFile = async (
  service: BucketCommandService,
  outputPath: string,
  options: BackupLibraryFileOptions = {}
): Promise<LibraryWriteResult> => {
  const finalPath = await resolveBackupPath(outputPath, options.prefix ?? manualBackupPrefix);
  return exportLibraryFile(service, finalPath);
};

/**
 * Removes automatic backup files with the given prefix from a directory, keeping only the
 * `maxCopies` most recent ones (file names embed an ISO-8601 timestamp, so lexical order matches
 * chronological order). Files without the prefix (manual backups, other user files) are untouched.
 */
export const rotateAutomaticBackups = async (directory: string, maxCopies: number, prefix: string = automaticBackupPrefix): Promise<void> => {
  let entries: string[];

  try {
    entries = await readdir(directory);
  } catch {
    return;
  }

  const automaticFiles = entries.filter((name) => name.startsWith(`${prefix}-`) && name.endsWith(".json")).sort();
  const excess = automaticFiles.length - maxCopies;

  if (excess <= 0) {
    return;
  }

  const staleFiles = automaticFiles.slice(0, excess);
  await Promise.all(staleFiles.map((name) => rm(join(directory, name), { force: true })));
};

export const importLibraryFile = async (
  service: BucketCommandService,
  store: SqliteBucketCommandStore,
  inputPath: string
): Promise<LibraryImportSummary> => {
  const library = await readJsonFile(inputPath);
  return store.transaction(() => importLibrary(service, library));
};

const readJsonFile = async (inputPath: string): Promise<LibraryExport> => {
  const content = await readFile(inputPath, "utf8");
  return parseLibraryExport(JSON.parse(content) as unknown);
};

const writeJsonFile = async (outputPath: string, library: LibraryExport): Promise<void> => {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(library, null, 2)}\n`, "utf8");
};

const resolveBackupPath = async (outputPath: string, prefix: string): Promise<string> => {
  if (await isDirectory(outputPath)) {
    return join(outputPath, backupFileName(prefix));
  }

  if (extname(outputPath).length === 0) {
    await mkdir(outputPath, { recursive: true });
    return join(outputPath, backupFileName(prefix));
  }

  return outputPath;
};

const isDirectory = async (path: string): Promise<boolean> => {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
};

const backupFileName = (prefix: string): string => {
  const timestamp = new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
  return `${prefix}-${timestamp}.json`;
};
