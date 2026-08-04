import type {
  Category,
  AnnotationRecord,
  CommandFilters,
  CommandRecord,
  CreateCategoryInput,
  CreateAnnotationInput,
  CreateCommandInput,
  LibraryImportSummary,
  LibrarySummary,
  UpdateCategoryInput,
  UpdateAnnotationInput,
  UpdateCommandInput
} from "@bucket-command/core";
import type { BackupPreferences, BackupPreferencesInput } from "@bucket-command/storage";

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
  commandsCopyContent: "commands:copy-content",
  annotationsList: "annotations:list",
  annotationsCreate: "annotations:create",
  annotationsUpdate: "annotations:update",
  annotationsDelete: "annotations:delete",
  libraryExport: "library:export",
  libraryImport: "library:import",
  libraryBackup: "library:backup",
  backupPreferencesGet: "backup-preferences:get",
  backupPreferencesSave: "backup-preferences:save",
  backupPreferencesChooseFolder: "backup-preferences:choose-folder",
  backupPreferencesUpdated: "backup-preferences:updated",
  menuAction: "menu:action"
} as const;

/** Actions triggered from the application menu's "Backup" submenu, handled by the renderer. */
export type MenuAction = "export-library" | "import-library" | "backup-library" | "backup-settings";

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
  "copyCommandContent",
  "listAnnotations",
  "createAnnotation",
  "updateAnnotation",
  "deleteAnnotation",
  "exportLibrary",
  "importLibrary",
  "backupLibrary",
  "getBackupPreferences",
  "saveBackupPreferences",
  "chooseBackupFolder",
  "onBackupPreferencesUpdated",
  "onMenuAction"
] as const;

export interface CommandCopyResult {
  copied: true;
}

export interface LibraryFileResult {
  canceled: boolean;
  path?: string;
  summary?: LibrarySummary;
}

export interface LibraryImportResult {
  canceled: boolean;
  path?: string;
  summary?: LibraryImportSummary;
}

export interface ChooseFolderResult {
  canceled: boolean;
  path?: string;
}

export interface BackupPreferencesStatus {
  preferences: BackupPreferences;
  /** Warning shown when the preferences file was missing/invalid and defaults were used. */
  warning: string | null;
  /** Message from the most recent failed automatic backup attempt, if any. */
  lastError: string | null;
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
  listAnnotations(): Promise<AnnotationRecord[]>;
  createAnnotation(input: CreateAnnotationInput): Promise<AnnotationRecord>;
  updateAnnotation(id: string, input: UpdateAnnotationInput): Promise<AnnotationRecord>;
  deleteAnnotation(id: string): Promise<void>;
  exportLibrary(): Promise<LibraryFileResult>;
  importLibrary(): Promise<LibraryImportResult>;
  backupLibrary(): Promise<LibraryFileResult>;
  getBackupPreferences(): Promise<BackupPreferencesStatus>;
  saveBackupPreferences(input: BackupPreferencesInput): Promise<BackupPreferencesStatus>;
  chooseBackupFolder(): Promise<ChooseFolderResult>;
  onBackupPreferencesUpdated(callback: (status: BackupPreferencesStatus) => void): () => void;
  onMenuAction(callback: (action: MenuAction) => void): () => void;
}

declare global {
  interface Window {
    bucketCommand: DesktopApi;
  }
}
