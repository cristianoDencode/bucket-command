export const executableShells = ["bash", "powershell"] as const;
export const commandLanguages = [
  "bash",
  "powershell",
  "javascript",
  "typescript",
  "json",
  "sql",
  "php",
  "python",
  "html",
  "css",
  "yaml",
  "markdown",
  "other"
] as const;
export const categoryIconKeys = [
  "folder",
  "terminal",
  "git",
  "database",
  "docker",
  "code",
  "server",
  "shield",
  "package",
  "globe"
] as const;
export const maxCategoryNameLength = 40;
export const maxTitleLength = 40;

export type ExecutableShell = (typeof executableShells)[number];
export type CommandLanguage = (typeof commandLanguages)[number];
export type CategoryIconKey = (typeof categoryIconKeys)[number];

export interface Category {
  id: string;
  name: string;
  iconKey: CategoryIconKey | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommandRecord {
  id: string;
  title: string;
  content: string;
  categoryId: string;
  categoryName: string;
  alias: string | null;
  note: string | null;
  language: CommandLanguage;
  createdAt: string;
  updatedAt: string;
}

export interface SequenceItem {
  position: number;
  command: CommandRecord;
}

export interface CommandSequence {
  id: string;
  title: string;
  categoryId: string;
  categoryName: string;
  alias: string;
  note: string | null;
  shellTarget: ExecutableShell;
  items: SequenceItem[];
  createdAt: string;
  updatedAt: string;
}

export interface AnnotationRecord {
  id: string;
  title: string | null;
  content: string;
  note: string | null;
  language: CommandLanguage;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryReference {
  id?: string;
  name?: string;
}

export interface CreateCategoryInput {
  name: string;
  iconKey?: CategoryIconKey | null;
}

export interface UpdateCategoryInput {
  name: string;
  iconKey?: CategoryIconKey | null;
}

export interface CreateCommandInput {
  title: string;
  content: string;
  category: CategoryReference;
  alias?: string | null;
  note?: string | null;
  language: CommandLanguage;
}

export interface CreateSequenceInput {
  title: string;
  category: CategoryReference;
  alias: string;
  note?: string | null;
  shellTarget: ExecutableShell;
  commandAliases: string[];
}

export interface UpdateCommandInput {
  title?: string;
  content?: string;
  category?: CategoryReference;
  alias?: string | null;
  note?: string | null;
  language?: CommandLanguage;
}

export interface UpdateSequenceInput {
  title?: string;
  category?: CategoryReference;
  alias?: string;
  note?: string | null;
  shellTarget?: ExecutableShell;
  commandAliases?: string[];
}

export interface CreateAnnotationInput {
  title?: string | null;
  content?: string;
  note?: string | null;
  language: CommandLanguage;
}

export interface UpdateAnnotationInput {
  title?: string | null;
  content?: string;
  note?: string | null;
  language?: CommandLanguage;
}

export interface CommandFilters {
  query?: string;
  category?: CategoryReference;
  language?: CommandLanguage;
}

export interface PersistedCategoryInput {
  id: string;
  name: string;
  iconKey: CategoryIconKey | null;
  createdAt: string;
  updatedAt: string;
}

export interface PersistedCommandInput {
  id: string;
  title: string;
  content: string;
  categoryId: string;
  alias: string | null;
  note: string | null;
  language: CommandLanguage;
  createdAt: string;
  updatedAt: string;
}

export interface PersistedCommandUpdate {
  title: string;
  content: string;
  categoryId: string;
  alias: string | null;
  note: string | null;
  language: CommandLanguage;
  updatedAt: string;
}

export interface PersistedSequenceInput {
  id: string;
  title: string;
  categoryId: string;
  alias: string;
  note: string | null;
  shellTarget: ExecutableShell;
  commandIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PersistedSequenceUpdate {
  title: string;
  categoryId: string;
  alias: string;
  note: string | null;
  shellTarget: ExecutableShell;
  commandIds: string[];
  updatedAt: string;
}

export interface PersistedAnnotationInput {
  id: string;
  title: string | null;
  content: string;
  note: string | null;
  language: CommandLanguage;
  createdAt: string;
  updatedAt: string;
}

export interface PersistedAnnotationUpdate {
  title: string | null;
  content: string;
  note: string | null;
  language: CommandLanguage;
  updatedAt: string;
}

export interface BucketCommandStore {
  createCategory(input: PersistedCategoryInput): Category;
  getCategoryById(id: string): Category | null;
  getCategoryByName(name: string): Category | null;
  listCategories(): Category[];
  updateCategory(id: string, input: { name: string; iconKey: CategoryIconKey | null; updatedAt: string }): Category;
  deleteCategory(id: string): void;
  isCategoryInUse(id: string): boolean;
  createCommand(input: PersistedCommandInput): CommandRecord;
  getCommandById(id: string): CommandRecord | null;
  getCommandByAlias(alias: string): CommandRecord | null;
  listCommands(filters?: CommandFilters): CommandRecord[];
  updateCommand(id: string, input: PersistedCommandUpdate): CommandRecord;
  deleteCommand(id: string): void;
  isCommandInUse(id: string): boolean;
  createSequence(input: PersistedSequenceInput): CommandSequence;
  getSequenceById(id: string): CommandSequence | null;
  getSequenceByAlias(alias: string): CommandSequence | null;
  listSequences(): CommandSequence[];
  updateSequence(id: string, input: PersistedSequenceUpdate): CommandSequence;
  deleteSequence(id: string): void;
  createAnnotation(input: PersistedAnnotationInput): AnnotationRecord;
  getAnnotationById(id: string): AnnotationRecord | null;
  listAnnotations(): AnnotationRecord[];
  updateAnnotation(id: string, input: PersistedAnnotationUpdate): AnnotationRecord;
  deleteAnnotation(id: string): void;
}
