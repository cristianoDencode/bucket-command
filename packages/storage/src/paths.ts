import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const dataDirEnvName = "BUCKET_COMMAND_DATA_DIR";
export const defaultDatabaseFileName = "bucket-command.sqlite";

export interface DataPathOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  fileName?: string;
}

export const resolveDataDir = (options: DataPathOptions = {}): string => {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const override = env[dataDirEnvName];

  if (override !== undefined && override.trim().length > 0) {
    return override;
  }

  if (platform === "win32") {
    return join(env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "bucket-command");
  }

  if (platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "bucket-command");
  }

  return join(env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "bucket-command");
};

export const resolveDatabasePath = (options: DataPathOptions = {}): string =>
  join(resolveDataDir(options), options.fileName ?? defaultDatabaseFileName);

export const ensureDatabaseDirectory = (databasePath: string): void => {
  mkdirSync(dirname(databasePath), { recursive: true });
};
