export const shellTargets = ["bash", "powershell", "other"] as const;

export type ShellTarget = (typeof shellTargets)[number];

export interface Category {
  id: string;
  name: string;
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
  shellTarget: ShellTarget;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryReference {
  id?: string;
  name?: string;
}

export interface CreateCategoryInput {
  name: string;
}

export interface UpdateCategoryInput {
  name: string;
}

export interface CreateCommandInput {
  title: string;
  content: string;
  category: CategoryReference;
  alias?: string | null;
  note?: string | null;
  shellTarget: ShellTarget;
}

export interface UpdateCommandInput {
  title?: string;
  content?: string;
  category?: CategoryReference;
  alias?: string | null;
  note?: string | null;
  shellTarget?: ShellTarget;
}

export interface CommandFilters {
  query?: string;
  category?: CategoryReference;
  shellTarget?: ShellTarget;
}

export interface PersistedCategoryInput {
  id: string;
  name: string;
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
  shellTarget: ShellTarget;
  createdAt: string;
  updatedAt: string;
}

export interface PersistedCommandUpdate {
  title: string;
  content: string;
  categoryId: string;
  alias: string | null;
  note: string | null;
  shellTarget: ShellTarget;
  updatedAt: string;
}

export interface BucketCommandStore {
  createCategory(input: PersistedCategoryInput): Category;
  getCategoryById(id: string): Category | null;
  getCategoryByName(name: string): Category | null;
  listCategories(): Category[];
  updateCategory(id: string, input: { name: string; updatedAt: string }): Category;
  deleteCategory(id: string): void;
  isCategoryInUse(id: string): boolean;
  createCommand(input: PersistedCommandInput): CommandRecord;
  getCommandById(id: string): CommandRecord | null;
  getCommandByAlias(alias: string): CommandRecord | null;
  listCommands(filters?: CommandFilters): CommandRecord[];
  updateCommand(id: string, input: PersistedCommandUpdate): CommandRecord;
  deleteCommand(id: string): void;
}
