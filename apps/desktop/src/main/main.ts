import electron from "electron";
import type { BrowserWindow as BrowserWindowType } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BucketCommandError, BucketCommandService } from "@bucket-command/core";
import { SqliteBucketCommandStore } from "@bucket-command/storage";
import { ipcChannels } from "../shared/api.js";
import { secureWebPreferences } from "./security.js";
import {
  readCommandFilters,
  readCreateCategoryInput,
  readCreateCommandInput,
  readUpdateCategoryInput,
  readUpdateCommandInput,
  requiredString
} from "./validation.js";

const { app, BrowserWindow, clipboard, ipcMain } = electron;
const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);

const store = new SqliteBucketCommandStore({ env: process.env });
const service = new BucketCommandService(store);

const createWindow = async (): Promise<BrowserWindowType> => {
  const window = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 980,
    minHeight: 680,
    title: "Bucket Command",
    webPreferences: {
      ...secureWebPreferences,
      preload: join(currentDir, "../preload/preload.cjs")
    }
  });

  if (process.env.BUCKET_COMMAND_RENDERER_URL !== undefined) {
    await window.loadURL(process.env.BUCKET_COMMAND_RENDERER_URL);
  } else {
    await window.loadFile(join(currentDir, "../renderer/index.html"));
  }

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

app.whenReady().then(async () => {
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

app.on("before-quit", () => {
  store.close();
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
