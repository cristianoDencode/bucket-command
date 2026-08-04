import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, posix, win32 } from "node:path";

export const dataDirEnvName = "BUCKET_COMMAND_DATA_DIR";
export const defaultDatabaseFileName = "bucket-command.sqlite";

export interface DataPathOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  fileName?: string;
}

const pathForPlatform = (platform: NodeJS.Platform): typeof posix | typeof win32 => (platform === "win32" ? win32 : posix);

export const resolveDataDir = (options: DataPathOptions = {}): string => {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const platformPath = pathForPlatform(platform);
  const override = env[dataDirEnvName];

  if (override !== undefined && override.trim().length > 0) {
    return override;
  }

  if (platform === "win32") {
    return platformPath.join(env.APPDATA ?? platformPath.join(homedir(), "AppData", "Roaming"), "bucket-command");
  }

  if (platform === "darwin") {
    return platformPath.join(homedir(), "Library", "Application Support", "bucket-command");
  }

  return platformPath.join(env.XDG_DATA_HOME ?? platformPath.join(homedir(), ".local", "share"), "bucket-command");
};

export const resolveDatabasePath = (options: DataPathOptions = {}): string =>
  pathForPlatform(options.platform ?? process.platform).join(
    resolveDataDir(options),
    options.fileName ?? defaultDatabaseFileName
  );

export const ensureDatabaseDirectory = (databasePath: string): void => {
  mkdirSync(dirname(databasePath), { recursive: true });
};
