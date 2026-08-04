import electron from "electron";
import type { BrowserWindow as BrowserWindowType, MenuItemConstructorOptions } from "electron";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BucketCommandError, BucketCommandService } from "@bucket-command/core";
import {
  automaticBackupPrefix,
  backupLibraryFile,
  exportLibraryFile,
  importLibraryFile,
  readBackupPreferences,
  rotateAutomaticBackups,
  SqliteBucketCommandStore,
  validateBackupPreferencesInput,
  writeBackupPreferences,
  type BackupPreferences
} from "@bucket-command/storage";
import { ipcChannels, type BackupPreferencesStatus, type MenuAction } from "../shared/api.js";
import { secureWebPreferences } from "./security.js";
import {
  readCommandFilters,
  readCreateAnnotationInput,
  readCreateCategoryInput,
  readCreateCommandInput,
  readUpdateAnnotationInput,
  readUpdateCategoryInput,
  readUpdateCommandInput,
  requiredString
} from "./validation.js";

const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain } = electron;
const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);

/**
 * Test-only override (in milliseconds) for the automatic backup scheduler. When set, it replaces
 * both how often the scheduler checks for a due backup and the "interval elapsed" threshold
 * (instead of `intervalHours` converted to milliseconds), so automated tests do not have to wait
 * for real hours to pass. Never set outside of test runs.
 */
const testBackupIntervalMsEnvName = "BUCKET_COMMAND_TEST_BACKUP_INTERVAL_MS";
const defaultScheduledBackupCheckMs = 60_000;

const store = new SqliteBucketCommandStore({ env: process.env });
const service = new BucketCommandService(store);

let mainWindow: BrowserWindowType | null = null;
let backupPreferences: BackupPreferences = {
  backupOnQuit: false,
  scheduledBackupEnabled: false,
  intervalHours: 24,
  destinationFolder: null,
  maxAutoBackups: 5,
  lastAutoBackupAt: null
};
let backupPreferencesWarning: string | null = null;
let lastAutomaticBackupError: string | null = null;
let scheduledBackupTimer: NodeJS.Timeout | null = null;
let quitPhase: "idle" | "backing-up" | "ready" = "idle";

app.setName("Bucket Command");
app.setAppUserModelId("bucket-command");

if (process.env.BUCKET_COMMAND_DISABLE_HARDWARE_ACCELERATION === "true") {
  app.disableHardwareAcceleration();
}

const electronUserDataDir = process.env.BUCKET_COMMAND_ELECTRON_USER_DATA_DIR;
if (electronUserDataDir !== undefined && electronUserDataDir.trim().length > 0) {
  mkdirSync(electronUserDataDir, { recursive: true });
  app.setPath("userData", electronUserDataDir);
}

const sendMenuAction = (action: MenuAction): void => {
  if (mainWindow !== null && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(ipcChannels.menuAction, action);
  }
};

const buildApplicationMenu = (window: BrowserWindowType): void => {
  const template: MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        {
          role: "quit",
          label: "Quit"
        }
      ]
    },
    {
      label: "Backup",
      submenu: [
        {
          label: "Export Library...",
          click: () => sendMenuAction("export-library")
        },
        {
          label: "Import Library...",
          click: () => sendMenuAction("import-library")
        },
        { type: "separator" },
        {
          label: "Backup Now...",
          click: () => sendMenuAction("backup-library")
        },
        {
          label: "Automatic Backup Settings...",
          click: () => sendMenuAction("backup-settings")
        }
      ]
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About Bucket Command",
          click: () => {
            void dialog.showMessageBox(window, {
              type: "info",
              title: "About Bucket Command",
              message: `Bucket Command ${app.getVersion()}`,
              detail: "A local documented code library for organizing, searching, copying, exporting and backing up snippets.",
              buttons: ["OK"],
              noLink: true
            });
          }
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

const createWindow = async (): Promise<BrowserWindowType> => {
  const window = new BrowserWindow({
    width: 1200,
    height: 780,
    icon: join(currentDir, "../renderer/bucket-command-logo.png"),
    minWidth: 980,
    minHeight: 680,
    title: "Bucket Command",
    webPreferences: {
      ...secureWebPreferences,
      preload: join(currentDir, "../preload/preload.cjs")
    }
  });
  buildApplicationMenu(window);

  if (process.env.BUCKET_COMMAND_RENDERER_URL !== undefined) {
    await window.loadURL(process.env.BUCKET_COMMAND_RENDERER_URL);
  } else {
    await window.loadFile(join(currentDir, "../renderer/index.html"));
  }

  mainWindow = window;
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  return window;
};

const handle = <TArgs extends unknown[], TResult>(
  channel: string,
  handler: (...args: TArgs) => TResult | Promise<TResult>
): void => {
  ipcMain.handle(channel, async (_event, ...args: TArgs) => {
    try {
      return await handler(...args);
    } catch (error) {
      throw new Error(formatError(error), { cause: error });
    }
  });
};

handle(ipcChannels.categoriesList, () => service.listCategories());
handle(ipcChannels.categoriesCreate, (input: unknown) => service.createCategory(readCreateCategoryInput(input)));
handle(ipcChannels.categoriesUpdate, (id: unknown, input: unknown) =>
  service.updateCategory(requiredString(id, "id"), readUpdateCategoryInput(input))
);
handle(ipcChannels.categoriesDelete, (id: unknown) => service.deleteCategory(requiredString(id, "id")));
handle(ipcChannels.commandsList, (filters: unknown) => service.listCommands(readCommandFilters(filters)));
handle(ipcChannels.commandsCreate, (input: unknown) => service.createCommand(readCreateCommandInput(input)));
handle(ipcChannels.commandsUpdate, (id: unknown, input: unknown) =>
  service.updateCommand(requiredString(id, "id"), readUpdateCommandInput(input))
);
handle(ipcChannels.commandsDelete, (id: unknown) => service.deleteCommand(requiredString(id, "id")));
handle(ipcChannels.commandsGetByAlias, (alias: unknown) => service.getCommandByAlias(requiredString(alias, "alias")));
handle(ipcChannels.commandsCopyContent, (id: unknown) => {
  const command = service.getCommand(requiredString(id, "id"));
  clipboard.writeText(command.content);
  return { copied: true as const };
});
handle(ipcChannels.annotationsList, () => service.listAnnotations());
handle(ipcChannels.annotationsCreate, (input: unknown) => service.createAnnotation(readCreateAnnotationInput(input)));
handle(ipcChannels.annotationsUpdate, (id: unknown, input: unknown) =>
  service.updateAnnotation(requiredString(id, "id"), readUpdateAnnotationInput(input))
);
handle(ipcChannels.annotationsDelete, (id: unknown) => service.deleteAnnotation(requiredString(id, "id")));
handle(ipcChannels.libraryExport, async () => {
  const result = await dialog.showSaveDialog({
    title: "Export Bucket Command library",
    defaultPath: "bucket-command-library.json",
    filters: [{ name: "Bucket Command JSON", extensions: ["json"] }]
  });

  if (result.canceled || result.filePath === undefined) {
    return { canceled: true };
  }

  const exported = await exportLibraryFile(service, result.filePath);
  return { canceled: false, ...exported };
});
handle(ipcChannels.libraryImport, async () => {
  const result = await dialog.showOpenDialog({
    title: "Import Bucket Command library",
    properties: ["openFile"],
    filters: [{ name: "Bucket Command JSON", extensions: ["json"] }]
  });

  if (result.canceled || result.filePaths[0] === undefined) {
    return { canceled: true };
  }

  const inputPath = result.filePaths[0];
  const summary = await importLibraryFile(service, store, inputPath);
  return { canceled: false, path: inputPath, summary };
});
handle(ipcChannels.libraryBackup, async () => {
  const result = await dialog.showOpenDialog({
    title: "Choose local backup folder",
    properties: ["openDirectory", "createDirectory"]
  });

  if (result.canceled || result.filePaths[0] === undefined) {
    return { canceled: true };
  }

  const backup = await backupLibraryFile(service, result.filePaths[0]);
  return { canceled: false, ...backup };
});
handle(ipcChannels.backupPreferencesGet, () => currentBackupPreferencesStatus());
handle(ipcChannels.backupPreferencesSave, async (input: unknown) => {
  const validatedInput = validateBackupPreferencesInput(input);
  const next: BackupPreferences = { ...validatedInput, lastAutoBackupAt: backupPreferences.lastAutoBackupAt };
  await writeBackupPreferences(next, { env: process.env });
  backupPreferences = next;
  backupPreferencesWarning = null;
  restartScheduledBackupTimer();
  return currentBackupPreferencesStatus();
});
handle(ipcChannels.backupPreferencesChooseFolder, async () => {
  const result = await dialog.showOpenDialog({
    title: "Choose automatic backup folder",
    properties: ["openDirectory", "createDirectory"]
  });

  if (result.canceled || result.filePaths[0] === undefined) {
    return { canceled: true };
  }

  return { canceled: false, path: result.filePaths[0] };
});

const currentBackupPreferencesStatus = (): BackupPreferencesStatus => ({
  preferences: backupPreferences,
  warning: backupPreferencesWarning,
  lastError: lastAutomaticBackupError
});

const broadcastBackupPreferences = (): void => {
  try {
    if (mainWindow !== null && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(ipcChannels.backupPreferencesUpdated, currentBackupPreferencesStatus());
    }
  } catch {
    // The window may already be closing during quit; broadcasting is best-effort.
  }
};

const hasUsableDestination = (): boolean =>
  backupPreferences.destinationFolder !== null && backupPreferences.destinationFolder.trim().length > 0;

/** Runs an automatic backup (with rotation) and records the outcome. Never throws. */
const runAutomaticBackup = async (): Promise<void> => {
  if (!hasUsableDestination()) {
    return;
  }

  const destinationFolder = backupPreferences.destinationFolder as string;

  try {
    await backupLibraryFile(service, destinationFolder, { prefix: automaticBackupPrefix });
    await rotateAutomaticBackups(destinationFolder, backupPreferences.maxAutoBackups);
    backupPreferences = { ...backupPreferences, lastAutoBackupAt: new Date().toISOString() };
    lastAutomaticBackupError = null;
    await writeBackupPreferences(backupPreferences, { env: process.env });
  } catch (error) {
    lastAutomaticBackupError = formatError(error);
  } finally {
    broadcastBackupPreferences();
  }
};

const resolveTestIntervalMs = (): number | null => {
  const raw = process.env[testBackupIntervalMsEnvName];
  if (raw === undefined) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const resolveScheduledBackupDueThresholdMs = (): number => {
  const testIntervalMs = resolveTestIntervalMs();
  return testIntervalMs ?? backupPreferences.intervalHours * 60 * 60 * 1000;
};

const resolveScheduledBackupCheckMs = (): number => resolveTestIntervalMs() ?? defaultScheduledBackupCheckMs;

const checkScheduledBackup = (): void => {
  if (!backupPreferences.scheduledBackupEnabled || !hasUsableDestination()) {
    return;
  }

  const { lastAutoBackupAt } = backupPreferences;
  const elapsedMs = lastAutoBackupAt === null ? Number.POSITIVE_INFINITY : Date.now() - new Date(lastAutoBackupAt).getTime();

  if (elapsedMs >= resolveScheduledBackupDueThresholdMs()) {
    void runAutomaticBackup();
  }
};

const restartScheduledBackupTimer = (): void => {
  if (scheduledBackupTimer !== null) {
    clearInterval(scheduledBackupTimer);
    scheduledBackupTimer = null;
  }

  scheduledBackupTimer = setInterval(checkScheduledBackup, resolveScheduledBackupCheckMs());
  scheduledBackupTimer.unref();
};

app.whenReady().then(async () => {
  const preferencesResult = await readBackupPreferences({ env: process.env });
  backupPreferences = preferencesResult.preferences;
  backupPreferencesWarning = preferencesResult.warning;
  restartScheduledBackupTimer();

  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (quitPhase === "ready") {
    return;
  }

  if (quitPhase === "backing-up") {
    event.preventDefault();
    return;
  }

  if (!backupPreferences.backupOnQuit || !hasUsableDestination()) {
    quitPhase = "ready";
    if (scheduledBackupTimer !== null) {
      clearInterval(scheduledBackupTimer);
    }
    store.close();
    return;
  }

  quitPhase = "backing-up";
  event.preventDefault();

  void runAutomaticBackup().finally(() => {
    quitPhase = "ready";
    if (scheduledBackupTimer !== null) {
      clearInterval(scheduledBackupTimer);
    }
    store.close();
    app.quit();
  });
});

const formatError = (error: unknown): string => {
  if (error instanceof BucketCommandError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error.";
};
