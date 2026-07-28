import DatabaseConstructor, { type Database } from "better-sqlite3";
import {
  BucketCommandError,
  normalizeKey,
  type BucketCommandStore,
  type Category,
  type CommandFilters,
  type CommandRecord,
  type PersistedCategoryInput,
  type PersistedCommandInput,
  type PersistedCommandUpdate,
  type ShellTarget
} from "@bucket-command/core";
import { ensureDatabaseDirectory, resolveDatabasePath, type DataPathOptions } from "./paths.js";
import { migrate } from "./schema.js";

interface CategoryRow {
  id: string;
  name: string;
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
  shell_target: ShellTarget;
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

  public createCategory(input: PersistedCategoryInput): Category {
    try {
      this.database
        .prepare(
          `INSERT INTO categories (id, name, name_key, created_at, updated_at)
           VALUES (@id, @name, @nameKey, @createdAt, @updatedAt)`
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

  public updateCategory(id: string, input: { name: string; updatedAt: string }): Category {
    try {
      const result = this.database
        .prepare("UPDATE categories SET name = @name, name_key = @nameKey, updated_at = @updatedAt WHERE id = @id")
        .run({ id, name: input.name, nameKey: normalizeKey(input.name), updatedAt: input.updatedAt });

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
    const row = this.database.prepare("SELECT 1 AS used FROM commands WHERE category_id = ? LIMIT 1").get(id) as
      | { used: number }
      | undefined;
    return row !== undefined;
  }

  public createCommand(input: PersistedCommandInput): CommandRecord {
    try {
      this.database
        .prepare(
          `INSERT INTO commands (
             id, title, content, category_id, alias, alias_key, note, shell_target, created_at, updated_at
           )
           VALUES (
             @id, @title, @content, @categoryId, @alias, @aliasKey, @note, @shellTarget, @createdAt, @updatedAt
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

    if (filters.shellTarget !== undefined) {
      where.push("commands.shell_target = @shellTarget");
      params.shellTarget = filters.shellTarget;
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
               shell_target = @shellTarget,
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
    const result = this.database.prepare("DELETE FROM commands WHERE id = ?").run(id);

    if (result.changes === 0) {
      throw notFound("command was not found.");
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
        commands.shell_target,
        commands.created_at,
        commands.updated_at
      FROM commands
      INNER JOIN categories ON categories.id = commands.category_id
      ${whereClause}
    `);
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

      if (error.message.includes("FOREIGN KEY constraint failed")) {
        throw new BucketCommandError("CATEGORY_IN_USE", "category contains commands and cannot be deleted.");
      }
    }

    throw error;
  }
}

const notFound = (message: string): BucketCommandError => new BucketCommandError("NOT_FOUND", message);

const mapCategory = (row: CategoryRow): Category => ({
  id: row.id,
  name: row.name,
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
  shellTarget: row.shell_target,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});
