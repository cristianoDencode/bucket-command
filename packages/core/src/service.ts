import { randomUUID } from "node:crypto";
import { BucketCommandError } from "./errors.js";
import { executableShells } from "./types.js";
import type {
  BucketCommandStore,
  Category,
  CategoryReference,
  CommandFilters,
  CommandRecord,
  CommandSequence,
  AnnotationRecord,
  CreateCategoryInput,
  CreateAnnotationInput,
  CreateCommandInput,
  CreateSequenceInput,
  ExecutableShell,
  UpdateAnnotationInput,
  UpdateCategoryInput,
  UpdateCommandInput,
  UpdateSequenceInput
} from "./types.js";
import {
  assertLanguage,
  optionalAlias,
  optionalCategoryIconKey,
  optionalNote,
  optionalTitle,
  requiredCategoryName,
  requiredContent,
  requiredText,
  requiredTitle
} from "./validation.js";

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
    const name = requiredCategoryName(input.name);
    const iconKey = optionalCategoryIconKey(input.iconKey);
    this.assertCategoryNameAvailable(name);
    const timestamp = this.timestamp();

    return this.store.createCategory({
      id: this.idFactory(),
      name,
      iconKey,
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  public listCategories(): Category[] {
    return this.store.listCategories();
  }

  public updateCategory(id: string, input: UpdateCategoryInput): Category {
    const category = this.requireCategoryById(id);
    const name = requiredCategoryName(input.name);
    const iconKey = input.iconKey === undefined ? category.iconKey : optionalCategoryIconKey(input.iconKey);
    this.assertCategoryNameAvailable(name, category.id);

    return this.store.updateCategory(category.id, {
      name,
      iconKey,
      updatedAt: this.timestamp()
    });
  }

  public deleteCategory(id: string): void {
    const category = this.requireCategoryById(id);

    if (this.store.isCategoryInUse(category.id)) {
      throw new BucketCommandError("CATEGORY_IN_USE", "category contains commands or sequences and cannot be deleted.");
    }

    this.store.deleteCategory(category.id);
  }

  public createCommand(input: CreateCommandInput): CommandRecord {
    const title = requiredTitle(input.title);
    const content = requiredContent(input.content);
    const category = this.resolveCategory(input.category);
    const alias = optionalAlias(input.alias);
    const note = optionalNote(input.note);
    const language = assertLanguage(input.language);
    this.assertAliasAvailable(alias);
    const timestamp = this.timestamp();

    return this.store.createCommand({
      id: this.idFactory(),
      title,
      content,
      categoryId: category.id,
      alias,
      note,
      language,
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

  public getRunnableByAlias(alias: string): CommandRecord | CommandSequence {
    const normalizedAlias = requiredText(alias, "alias");
    const command = this.store.getCommandByAlias(normalizedAlias);

    if (command !== null) {
      return command;
    }

    const sequence = this.store.getSequenceByAlias(normalizedAlias);

    if (sequence !== null) {
      return sequence;
    }

    throw new BucketCommandError("NOT_FOUND", "command or sequence alias was not found.");
  }

  public updateCommand(id: string, input: UpdateCommandInput): CommandRecord {
    const current = this.requireCommandById(id);
    const category = input.category === undefined ? this.requireCategoryById(current.categoryId) : this.resolveCategory(input.category);
    const alias = input.alias === undefined ? current.alias : optionalAlias(input.alias);
    const language = input.language === undefined ? current.language : assertLanguage(input.language);

    this.assertAliasAvailable(alias, current.id);

    return this.store.updateCommand(current.id, {
      title: input.title === undefined ? current.title : requiredTitle(input.title),
      content: input.content === undefined ? current.content : requiredContent(input.content),
      categoryId: category.id,
      alias,
      note: input.note === undefined ? current.note : optionalNote(input.note),
      language,
      updatedAt: this.timestamp()
    });
  }

  public deleteCommand(id: string): void {
    const command = this.requireCommandById(id);

    if (this.store.isCommandInUse(command.id)) {
      throw new BucketCommandError("COMMAND_IN_USE", "command is used by a sequence and cannot be deleted.");
    }

    this.store.deleteCommand(command.id);
  }

  public createSequence(input: CreateSequenceInput): CommandSequence {
    const title = requiredTitle(input.title);
    const category = this.resolveCategory(input.category);
    const alias = requiredText(input.alias, "alias");
    const note = optionalNote(input.note);
    const shellTarget = this.assertSequenceShell(input.shellTarget);
    const commands = this.resolveSequenceCommands(input.commandAliases, shellTarget);
    this.assertAliasAvailable(alias);
    const timestamp = this.timestamp();

    return this.store.createSequence({
      id: this.idFactory(),
      title,
      categoryId: category.id,
      alias,
      note,
      shellTarget,
      commandIds: commands.map((command) => command.id),
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  public listSequences(): CommandSequence[] {
    return this.store.listSequences();
  }

  public getSequenceByAlias(alias: string): CommandSequence {
    const normalizedAlias = requiredText(alias, "alias");
    const sequence = this.store.getSequenceByAlias(normalizedAlias);

    if (sequence === null) {
      throw new BucketCommandError("NOT_FOUND", "sequence alias was not found.");
    }

    return sequence;
  }

  public updateSequence(id: string, input: UpdateSequenceInput): CommandSequence {
    const current = this.requireSequenceById(id);
    const category = input.category === undefined ? this.requireCategoryById(current.categoryId) : this.resolveCategory(input.category);
    const alias = input.alias === undefined ? current.alias : requiredText(input.alias, "alias");
    const shellTarget = input.shellTarget === undefined ? current.shellTarget : this.assertSequenceShell(input.shellTarget);
    const commandAliases = input.commandAliases ?? current.items.map((item) => item.command.alias ?? item.command.id);
    const commands = this.resolveSequenceCommands(commandAliases, shellTarget);

    this.assertAliasAvailable(alias, current.id);

    return this.store.updateSequence(current.id, {
      title: input.title === undefined ? current.title : requiredTitle(input.title),
      categoryId: category.id,
      alias,
      note: input.note === undefined ? current.note : optionalNote(input.note),
      shellTarget,
      commandIds: commands.map((command) => command.id),
      updatedAt: this.timestamp()
    });
  }

  public deleteSequence(id: string): void {
    const sequence = this.requireSequenceById(id);
    this.store.deleteSequence(sequence.id);
  }

  public createAnnotation(input: CreateAnnotationInput): AnnotationRecord {
    const timestamp = this.timestamp();

    return this.store.createAnnotation({
      id: this.idFactory(),
      title: optionalTitle(input.title),
      content: input.content ?? "",
      note: optionalNote(input.note),
      language: assertLanguage(input.language),
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  public listAnnotations(): AnnotationRecord[] {
    return this.store.listAnnotations();
  }

  public updateAnnotation(id: string, input: UpdateAnnotationInput): AnnotationRecord {
    const current = this.requireAnnotationById(id);

    return this.store.updateAnnotation(current.id, {
      title: input.title === undefined ? current.title : optionalTitle(input.title),
      content: input.content === undefined ? current.content : input.content,
      note: input.note === undefined ? current.note : optionalNote(input.note),
      language: input.language === undefined ? current.language : assertLanguage(input.language),
      updatedAt: this.timestamp()
    });
  }

  public deleteAnnotation(id: string): void {
    const annotation = this.requireAnnotationById(id);
    this.store.deleteAnnotation(annotation.id);
  }

  private resolveFilters(filters: CommandFilters): CommandFilters {
    const resolved: CommandFilters = {};

    if (filters.query !== undefined) {
      resolved.query = filters.query;
    }

    if (filters.language !== undefined) {
      resolved.language = assertLanguage(filters.language);
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

  private requireSequenceById(id: string): CommandSequence {
    const sequence = this.store.getSequenceById(id);

    if (sequence === null) {
      throw new BucketCommandError("NOT_FOUND", "sequence was not found.");
    }

    return sequence;
  }

  private requireAnnotationById(id: string): AnnotationRecord {
    const annotation = this.store.getAnnotationById(id);

    if (annotation === null) {
      throw new BucketCommandError("NOT_FOUND", "annotation was not found.");
    }

    return annotation;
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

    const existingSequence = this.store.getSequenceByAlias(alias);

    if (existingSequence !== null && existingSequence.id !== exceptId) {
      throw new BucketCommandError("DUPLICATE_ALIAS", "command alias already exists.");
    }
  }

  private assertSequenceShell(shellTarget: ExecutableShell): ExecutableShell {
    if (!executableShells.includes(shellTarget)) {
      throw new BucketCommandError("VALIDATION_ERROR", "sequence shell must be bash or powershell.");
    }

    return shellTarget;
  }

  private resolveSequenceCommands(commandAliases: string[], shellTarget: ExecutableShell): CommandRecord[] {
    if (commandAliases.length === 0) {
      throw new BucketCommandError("VALIDATION_ERROR", "sequence must contain at least one command.");
    }

    return commandAliases.map((alias) => {
      const command = this.getCommandByAlias(alias);

      if (command.language !== shellTarget) {
        throw new BucketCommandError("VALIDATION_ERROR", "sequence items must use the same shell target.");
      }

      return command;
    });
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
}
