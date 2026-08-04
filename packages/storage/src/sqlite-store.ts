import DatabaseConstructor, { type Database } from "better-sqlite3";
import {
  BucketCommandError,
  normalizeKey,
  type AnnotationRecord,
  type BucketCommandStore,
  type Category,
  type CategoryIconKey,
  type CommandFilters,
  type CommandLanguage,
  type CommandRecord,
  type CommandSequence,
  type ExecutableShell,
  type PersistedAnnotationInput,
  type PersistedAnnotationUpdate,
  type PersistedCategoryInput,
  type PersistedCommandInput,
  type PersistedCommandUpdate,
  type PersistedSequenceInput,
  type PersistedSequenceUpdate
} from "@bucket-command/core";
import { ensureDatabaseDirectory, resolveDatabasePath, type DataPathOptions } from "./paths.js";
import { migrate } from "./schema.js";

interface CategoryRow {
  id: string;
  name: string;
  icon_key: CategoryIconKey | null;
  created_at: string;
  updated_at: string;
}

interface CommandRow {
  id: string;
  title: string;
  content: string;
  category_id: string;
  category_name: string;
  alias: string | null;
  note: string | null;
  language: CommandLanguage;
  created_at: string;
  updated_at: string;
}

interface SequenceRow {
  id: string;
  title: string;
  category_id: string;
  category_name: string;
  alias: string;
  note: string | null;
  shell_target: ExecutableShell;
  created_at: string;
  updated_at: string;
}

interface SequenceItemRow extends CommandRow {
  position: number;
}

interface AnnotationRow {
  id: string;
  title: string | null;
  content: string;
  note: string | null;
  language: CommandLanguage;
  created_at: string;
  updated_at: string;
}

export interface SqliteBucketCommandStoreOptions extends DataPathOptions {
  databasePath?: string;
}

export class SqliteBucketCommandStore implements BucketCommandStore {
  private readonly database: Database;

  public constructor(options: SqliteBucketCommandStoreOptions = {}) {
    const databasePath = options.databasePath ?? resolveDatabasePath(options);
    ensureDatabaseDirectory(databasePath);
    this.database = new DatabaseConstructor(databasePath);
    migrate(this.database);
  }

  public close(): void {
    this.database.close();
  }

  public transaction<T>(operation: () => T): T {
    return this.database.transaction(operation)();
  }

  public createCategory(input: PersistedCategoryInput): Category {
    try {
      this.database
        .prepare(
          `INSERT INTO categories (id, name, name_key, icon_key, created_at, updated_at)
           VALUES (@id, @name, @nameKey, @iconKey, @createdAt, @updatedAt)`
        )
        .run({ ...input, nameKey: normalizeKey(input.name) });
    } catch (error) {
      this.translateConstraintError(error);
    }

    return this.requireCategory(input.id);
  }

  public getCategoryById(id: string): Category | null {
    const row = this.database.prepare("SELECT * FROM categories WHERE id = ?").get(id) as CategoryRow | undefined;
    return row === undefined ? null : mapCategory(row);
  }

  public getCategoryByName(name: string): Category | null {
    const row = this.database.prepare("SELECT * FROM categories WHERE name_key = ?").get(normalizeKey(name)) as
      | CategoryRow
      | undefined;
    return row === undefined ? null : mapCategory(row);
  }

  public listCategories(): Category[] {
    const rows = this.database.prepare("SELECT * FROM categories ORDER BY name COLLATE NOCASE ASC").all() as CategoryRow[];
    return rows.map(mapCategory);
  }

  public updateCategory(id: string, input: { name: string; iconKey: CategoryIconKey | null; updatedAt: string }): Category {
    try {
      const result = this.database
        .prepare("UPDATE categories SET name = @name, name_key = @nameKey, icon_key = @iconKey, updated_at = @updatedAt WHERE id = @id")
        .run({ id, name: input.name, nameKey: normalizeKey(input.name), iconKey: input.iconKey, updatedAt: input.updatedAt });

      if (result.changes === 0) {
        throw notFound("category was not found.");
      }
    } catch (error) {
      this.translateConstraintError(error);
    }

    return this.requireCategory(id);
  }

  public deleteCategory(id: string): void {
    try {
      const result = this.database.prepare("DELETE FROM categories WHERE id = ?").run(id);

      if (result.changes === 0) {
        throw notFound("category was not found.");
      }
    } catch (error) {
      this.translateConstraintError(error);
    }
  }

  public isCategoryInUse(id: string): boolean {
    const row = this.database
      .prepare(
        `SELECT 1 AS used FROM commands WHERE category_id = ?
         UNION
         SELECT 1 AS used FROM sequences WHERE category_id = ?
         LIMIT 1`
      )
      .get(id, id) as
      | { used: number }
      | undefined;
    return row !== undefined;
  }

  public createCommand(input: PersistedCommandInput): CommandRecord {
    try {
      this.database
        .prepare(
          `INSERT INTO commands (
             id, title, content, category_id, alias, alias_key, note, language, created_at, updated_at
           )
           VALUES (
             @id, @title, @content, @categoryId, @alias, @aliasKey, @note, @language, @createdAt, @updatedAt
           )`
        )
        .run({ ...input, aliasKey: input.alias === null ? null : normalizeKey(input.alias) });
    } catch (error) {
      this.translateConstraintError(error);
    }

    return this.requireCommand(input.id);
  }

  public getCommandById(id: string): CommandRecord | null {
    const row = this.commandBaseQuery("WHERE commands.id = ?").get(id) as CommandRow | undefined;
    return row === undefined ? null : mapCommand(row);
  }

  public getCommandByAlias(alias: string): CommandRecord | null {
    const row = this.commandBaseQuery("WHERE commands.alias_key = ?").get(normalizeKey(alias)) as CommandRow | undefined;
    return row === undefined ? null : mapCommand(row);
  }

  public listCommands(filters: CommandFilters = {}): CommandRecord[] {
    const where: string[] = [];
    const params: Record<string, string> = {};

    if (filters.category?.id !== undefined) {
      where.push("commands.category_id = @categoryId");
      params.categoryId = filters.category.id;
    }

    if (filters.category?.name !== undefined) {
      where.push("categories.name_key = @categoryName");
      params.categoryName = normalizeKey(filters.category.name);
    }

    if (filters.language !== undefined) {
      where.push("commands.language = @language");
      params.language = filters.language;
    }

    if (filters.query !== undefined && filters.query.trim().length > 0) {
      where.push(
        "(lower(commands.title) LIKE @query OR lower(commands.alias) LIKE @query OR lower(commands.content) LIKE @query OR lower(commands.note) LIKE @query)"
      );
      params.query = `%${filters.query.trim().toLocaleLowerCase()}%`;
    }

    const clause = where.length === 0 ? "" : `WHERE ${where.join(" AND ")}`;
    const rows = this.commandBaseQuery(`${clause} ORDER BY categories.name COLLATE NOCASE ASC, commands.title COLLATE NOCASE ASC`).all(
      params
    ) as CommandRow[];

    return rows.map(mapCommand);
  }

  public updateCommand(id: string, input: PersistedCommandUpdate): CommandRecord {
    try {
      const result = this.database
        .prepare(
          `UPDATE commands
           SET title = @title,
               content = @content,
               category_id = @categoryId,
               alias = @alias,
               alias_key = @aliasKey,
               note = @note,
               language = @language,
               updated_at = @updatedAt
           WHERE id = @id`
        )
        .run({ id, ...input, aliasKey: input.alias === null ? null : normalizeKey(input.alias) });

      if (result.changes === 0) {
        throw notFound("command was not found.");
      }
    } catch (error) {
      this.translateConstraintError(error);
    }

    return this.requireCommand(id);
  }

  public deleteCommand(id: string): void {
    try {
      const result = this.database.prepare("DELETE FROM commands WHERE id = ?").run(id);

      if (result.changes === 0) {
        throw notFound("command was not found.");
      }
    } catch (error) {
      this.translateConstraintError(error);
    }
  }

  public isCommandInUse(id: string): boolean {
    const row = this.database.prepare("SELECT 1 AS used FROM sequence_items WHERE command_id = ? LIMIT 1").get(id) as
      | { used: number }
      | undefined;
    return row !== undefined;
  }

  public createSequence(input: PersistedSequenceInput): CommandSequence {
    const transaction = this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO sequences (
             id, title, category_id, alias, alias_key, note, shell_target, created_at, updated_at
           )
           VALUES (
             @id, @title, @categoryId, @alias, @aliasKey, @note, @shellTarget, @createdAt, @updatedAt
           )`
        )
        .run({ ...input, aliasKey: normalizeKey(input.alias) });
      this.replaceSequenceItems(input.id, input.commandIds);
    });

    try {
      transaction();
    } catch (error) {
      this.translateConstraintError(error);
    }

    return this.requireSequence(input.id);
  }

  public getSequenceById(id: string): CommandSequence | null {
    const row = this.sequenceBaseQuery("WHERE sequences.id = ?").get(id) as SequenceRow | undefined;
    return row === undefined ? null : this.mapSequence(row);
  }

  public getSequenceByAlias(alias: string): CommandSequence | null {
    const row = this.sequenceBaseQuery("WHERE sequences.alias_key = ?").get(normalizeKey(alias)) as SequenceRow | undefined;
    return row === undefined ? null : this.mapSequence(row);
  }

  public listSequences(): CommandSequence[] {
    const rows = this.sequenceBaseQuery("ORDER BY categories.name COLLATE NOCASE ASC, sequences.title COLLATE NOCASE ASC").all() as
      SequenceRow[];
    return rows.map((row) => this.mapSequence(row));
  }

  public updateSequence(id: string, input: PersistedSequenceUpdate): CommandSequence {
    const transaction = this.database.transaction(() => {
      const result = this.database
        .prepare(
          `UPDATE sequences
           SET title = @title,
               category_id = @categoryId,
               alias = @alias,
               alias_key = @aliasKey,
               note = @note,
               shell_target = @shellTarget,
               updated_at = @updatedAt
           WHERE id = @id`
        )
        .run({ id, ...input, aliasKey: normalizeKey(input.alias) });

      if (result.changes === 0) {
        throw notFound("sequence was not found.");
      }

      this.replaceSequenceItems(id, input.commandIds);
    });

    try {
      transaction();
    } catch (error) {
      this.translateConstraintError(error);
    }

    return this.requireSequence(id);
  }

  public deleteSequence(id: string): void {
    const result = this.database.prepare("DELETE FROM sequences WHERE id = ?").run(id);

    if (result.changes === 0) {
      throw notFound("sequence was not found.");
    }
  }

  public createAnnotation(input: PersistedAnnotationInput): AnnotationRecord {
    this.database
      .prepare(
        `INSERT INTO annotations (id, title, content, note, language, created_at, updated_at)
         VALUES (@id, @title, @content, @note, @language, @createdAt, @updatedAt)`
      )
      .run(input);

    return this.requireAnnotation(input.id);
  }

  public getAnnotationById(id: string): AnnotationRecord | null {
    const row = this.database.prepare("SELECT * FROM annotations WHERE id = ?").get(id) as AnnotationRow | undefined;
    return row === undefined ? null : mapAnnotation(row);
  }

  public listAnnotations(): AnnotationRecord[] {
    const rows = this.database
      .prepare("SELECT * FROM annotations ORDER BY updated_at DESC, created_at DESC")
      .all() as AnnotationRow[];
    return rows.map(mapAnnotation);
  }

  public updateAnnotation(id: string, input: PersistedAnnotationUpdate): AnnotationRecord {
    const result = this.database
      .prepare(
        `UPDATE annotations
         SET title = @title,
             content = @content,
             note = @note,
             language = @language,
             updated_at = @updatedAt
         WHERE id = @id`
      )
      .run({ id, ...input });

    if (result.changes === 0) {
      throw notFound("annotation was not found.");
    }

    return this.requireAnnotation(id);
  }

  public deleteAnnotation(id: string): void {
    const result = this.database.prepare("DELETE FROM annotations WHERE id = ?").run(id);

    if (result.changes === 0) {
      throw notFound("annotation was not found.");
    }
  }

  private commandBaseQuery(whereClause: string) {
    return this.database.prepare(`
      SELECT
        commands.id,
        commands.title,
        commands.content,
        commands.category_id,
        categories.name AS category_name,
        commands.alias,
        commands.note,
        commands.language,
        commands.created_at,
        commands.updated_at
      FROM commands
      INNER JOIN categories ON categories.id = commands.category_id
      ${whereClause}
    `);
  }

  private sequenceBaseQuery(whereClause: string) {
    return this.database.prepare(`
      SELECT
        sequences.id,
        sequences.title,
        sequences.category_id,
        categories.name AS category_name,
        sequences.alias,
        sequences.note,
        sequences.shell_target,
        sequences.created_at,
        sequences.updated_at
      FROM sequences
      INNER JOIN categories ON categories.id = sequences.category_id
      ${whereClause}
    `);
  }

  private sequenceItems(sequenceId: string): SequenceItemRow[] {
    return this.database
      .prepare(`
        SELECT
          sequence_items.position,
          commands.id,
          commands.title,
          commands.content,
          commands.category_id,
          categories.name AS category_name,
          commands.alias,
          commands.note,
          commands.language,
          commands.created_at,
          commands.updated_at
        FROM sequence_items
        INNER JOIN commands ON commands.id = sequence_items.command_id
        INNER JOIN categories ON categories.id = commands.category_id
        WHERE sequence_items.sequence_id = ?
        ORDER BY sequence_items.position ASC
      `)
      .all(sequenceId) as SequenceItemRow[];
  }

  private replaceSequenceItems(sequenceId: string, commandIds: string[]): void {
    this.database.prepare("DELETE FROM sequence_items WHERE sequence_id = ?").run(sequenceId);

    const insert = this.database.prepare(
      `INSERT INTO sequence_items (sequence_id, command_id, position)
       VALUES (@sequenceId, @commandId, @position)`
    );

    commandIds.forEach((commandId, index) => {
      insert.run({ sequenceId, commandId, position: index + 1 });
    });
  }

  private requireCategory(id: string): Category {
    const category = this.getCategoryById(id);

    if (category === null) {
      throw notFound("category was not found.");
    }

    return category;
  }

  private requireCommand(id: string): CommandRecord {
    const command = this.getCommandById(id);

    if (command === null) {
      throw notFound("command was not found.");
    }

    return command;
  }

  private requireSequence(id: string): CommandSequence {
    const sequence = this.getSequenceById(id);

    if (sequence === null) {
      throw notFound("sequence was not found.");
    }

    return sequence;
  }

  private requireAnnotation(id: string): AnnotationRecord {
    const annotation = this.getAnnotationById(id);

    if (annotation === null) {
      throw notFound("annotation was not found.");
    }

    return annotation;
  }

  private mapSequence(row: SequenceRow): CommandSequence {
    return {
      id: row.id,
      title: row.title,
      categoryId: row.category_id,
      categoryName: row.category_name,
      alias: row.alias,
      note: row.note,
      shellTarget: row.shell_target,
      items: this.sequenceItems(row.id).map((item) => ({
        position: item.position,
        command: mapCommand(item)
      })),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private translateConstraintError(error: unknown): never {
    if (error instanceof BucketCommandError) {
      throw error;
    }

    if (error instanceof Error) {
      if (error.message.includes("categories.name_key")) {
        throw new BucketCommandError("DUPLICATE_CATEGORY", "category name already exists.");
      }

      if (error.message.includes("commands.alias_key")) {
        throw new BucketCommandError("DUPLICATE_ALIAS", "command alias already exists.");
      }

      if (error.message.includes("sequences.alias_key")) {
        throw new BucketCommandError("DUPLICATE_ALIAS", "command alias already exists.");
      }

      if (error.message.includes("FOREIGN KEY constraint failed")) {
        throw new BucketCommandError("CONSTRAINT_ERROR", "record is still referenced and cannot be deleted.");
      }
    }

    throw error;
  }
}

const notFound = (message: string): BucketCommandError => new BucketCommandError("NOT_FOUND", message);

const mapCategory = (row: CategoryRow): Category => ({
  id: row.id,
  name: row.name,
  iconKey: row.icon_key,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapCommand = (row: CommandRow): CommandRecord => ({
  id: row.id,
  title: row.title,
  content: row.content,
  categoryId: row.category_id,
  categoryName: row.category_name,
  alias: row.alias,
  note: row.note,
  language: row.language,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapAnnotation = (row: AnnotationRow): AnnotationRecord => ({
  id: row.id,
  title: row.title,
  content: row.content,
  note: row.note,
  language: row.language,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});
