import { randomUUID } from "node:crypto";
import { BucketCommandError } from "./errors.js";
import type {
  BucketCommandStore,
  Category,
  CategoryReference,
  CommandFilters,
  CommandRecord,
  CreateCategoryInput,
  CreateCommandInput,
  UpdateCategoryInput,
  UpdateCommandInput
} from "./types.js";
import { assertShellTarget, optionalAlias, optionalNote, requiredContent, requiredText } from "./validation.js";

export interface BucketCommandServiceOptions {
  idFactory?: () => string;
  now?: () => Date;
}

export class BucketCommandService {
  private readonly store: BucketCommandStore;
  private readonly idFactory: () => string;
  private readonly now: () => Date;

  public constructor(store: BucketCommandStore, options: BucketCommandServiceOptions = {}) {
    this.store = store;
    this.idFactory = options.idFactory ?? randomUUID;
    this.now = options.now ?? (() => new Date());
  }

  public createCategory(input: CreateCategoryInput): Category {
    const name = requiredText(input.name, "category name");
    this.assertCategoryNameAvailable(name);
    const timestamp = this.timestamp();

    return this.store.createCategory({
      id: this.idFactory(),
      name,
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  public listCategories(): Category[] {
    return this.store.listCategories();
  }

  public updateCategory(id: string, input: UpdateCategoryInput): Category {
    const category = this.requireCategoryById(id);
    const name = requiredText(input.name, "category name");
    this.assertCategoryNameAvailable(name, category.id);

    return this.store.updateCategory(category.id, {
      name,
      updatedAt: this.timestamp()
    });
  }

  public deleteCategory(id: string): void {
    const category = this.requireCategoryById(id);

    if (this.store.isCategoryInUse(category.id)) {
      throw new BucketCommandError("CATEGORY_IN_USE", "category contains commands and cannot be deleted.");
    }

    this.store.deleteCategory(category.id);
  }

  public createCommand(input: CreateCommandInput): CommandRecord {
    const title = requiredText(input.title, "title");
    const content = requiredContent(input.content);
    const category = this.resolveCategory(input.category);
    const alias = optionalAlias(input.alias);
    const note = optionalNote(input.note);
    const shellTarget = assertShellTarget(input.shellTarget);
    this.assertAliasAvailable(alias);
    const timestamp = this.timestamp();

    return this.store.createCommand({
      id: this.idFactory(),
      title,
      content,
      categoryId: category.id,
      alias,
      note,
      shellTarget,
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  public listCommands(filters: CommandFilters = {}): CommandRecord[] {
    return this.store.listCommands(this.resolveFilters(filters));
  }

  public getCommand(id: string): CommandRecord {
    return this.requireCommandById(id);
  }

  public getCommandByAlias(alias: string): CommandRecord {
    const normalizedAlias = requiredText(alias, "alias");
    const command = this.store.getCommandByAlias(normalizedAlias);

    if (command === null) {
      throw new BucketCommandError("NOT_FOUND", "command alias was not found.");
    }

    return command;
  }

  public updateCommand(id: string, input: UpdateCommandInput): CommandRecord {
    const current = this.requireCommandById(id);
    const category = input.category === undefined ? this.requireCategoryById(current.categoryId) : this.resolveCategory(input.category);
    const alias = input.alias === undefined ? current.alias : optionalAlias(input.alias);
    const shellTarget = input.shellTarget === undefined ? current.shellTarget : assertShellTarget(input.shellTarget);

    this.assertAliasAvailable(alias, current.id);

    return this.store.updateCommand(current.id, {
      title: input.title === undefined ? current.title : requiredText(input.title, "title"),
      content: input.content === undefined ? current.content : requiredContent(input.content),
      categoryId: category.id,
      alias,
      note: input.note === undefined ? current.note : optionalNote(input.note),
      shellTarget,
      updatedAt: this.timestamp()
    });
  }

  public deleteCommand(id: string): void {
    const command = this.requireCommandById(id);
    this.store.deleteCommand(command.id);
  }

  private resolveFilters(filters: CommandFilters): CommandFilters {
    const resolved: CommandFilters = {};

    if (filters.query !== undefined) {
      resolved.query = filters.query;
    }

    if (filters.shellTarget !== undefined) {
      resolved.shellTarget = assertShellTarget(filters.shellTarget);
    }

    if (filters.category !== undefined) {
      resolved.category = { id: this.resolveCategory(filters.category).id };
    }

    return resolved;
  }

  private resolveCategory(reference: CategoryReference): Category {
    const byId = reference.id === undefined ? null : this.store.getCategoryById(reference.id);
    const byName = reference.name === undefined ? null : this.store.getCategoryByName(requiredText(reference.name, "category name"));
    const category = byId ?? byName;

    if (category === null) {
      throw new BucketCommandError("NOT_FOUND", "category was not found.");
    }

    return category;
  }

  private requireCategoryById(id: string): Category {
    const category = this.store.getCategoryById(id);

    if (category === null) {
      throw new BucketCommandError("NOT_FOUND", "category was not found.");
    }

    return category;
  }

  private requireCommandById(id: string): CommandRecord {
    const command = this.store.getCommandById(id);

    if (command === null) {
      throw new BucketCommandError("NOT_FOUND", "command was not found.");
    }

    return command;
  }

  private assertCategoryNameAvailable(name: string, exceptId?: string): void {
    const existing = this.store.getCategoryByName(name);

    if (existing !== null && existing.id !== exceptId) {
      throw new BucketCommandError("DUPLICATE_CATEGORY", "category name already exists.");
    }
  }

  private assertAliasAvailable(alias: string | null, exceptId?: string): void {
    if (alias === null) {
      return;
    }

    const existing = this.store.getCommandByAlias(alias);

    if (existing !== null && existing.id !== exceptId) {
      throw new BucketCommandError("DUPLICATE_ALIAS", "command alias already exists.");
    }
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
}
