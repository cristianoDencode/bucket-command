import type {
  Category,
  CommandFilters,
  CommandRecord,
  CreateCategoryInput,
  CreateCommandInput,
  UpdateCategoryInput,
  UpdateCommandInput
} from "@bucket-command/core";

export const ipcChannels = {
  categoriesList: "categories:list",
  categoriesCreate: "categories:create",
  categoriesUpdate: "categories:update",
  categoriesDelete: "categories:delete",
  commandsList: "commands:list",
  commandsCreate: "commands:create",
  commandsUpdate: "commands:update",
  commandsDelete: "commands:delete",
  commandsGetByAlias: "commands:get-by-alias",
  commandsCopyContent: "commands:copy-content"
} as const;

export const exposedApiKeys = [
  "listCategories",
  "createCategory",
  "updateCategory",
  "deleteCategory",
  "listCommands",
  "createCommand",
  "updateCommand",
  "deleteCommand",
  "getCommandByAlias",
  "copyCommandContent"
] as const;

export interface CommandCopyResult {
  copied: true;
}

export interface DesktopApi {
  listCategories(): Promise<Category[]>;
  createCategory(input: CreateCategoryInput): Promise<Category>;
  updateCategory(id: string, input: UpdateCategoryInput): Promise<Category>;
  deleteCategory(id: string): Promise<void>;
  listCommands(filters?: CommandFilters): Promise<CommandRecord[]>;
  createCommand(input: CreateCommandInput): Promise<CommandRecord>;
  updateCommand(id: string, input: UpdateCommandInput): Promise<CommandRecord>;
  deleteCommand(id: string): Promise<void>;
  getCommandByAlias(alias: string): Promise<CommandRecord>;
  copyCommandContent(id: string): Promise<CommandCopyResult>;
}

declare global {
  interface Window {
    bucketCommand: DesktopApi;
  }
}
