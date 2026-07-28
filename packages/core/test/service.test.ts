import { describe, expect, it } from "vitest";
import {
  BucketCommandError,
  BucketCommandService,
  type BucketCommandStore,
  type Category,
  type CommandFilters,
  type CommandRecord,
  type PersistedCategoryInput,
  type PersistedCommandInput,
  type PersistedCommandUpdate,
  type ShellTarget
} from "../src/index.js";
import { normalizeKey } from "../src/validation.js";

class MemoryStore implements BucketCommandStore {
  private readonly categories = new Map<string, Category>();
  private readonly commands = new Map<string, CommandRecord>();

  public createCategory(input: PersistedCategoryInput): Category {
    const category = { ...input };
    this.categories.set(category.id, category);
    return category;
  }

  public getCategoryById(id: string): Category | null {
    return this.categories.get(id) ?? null;
  }

  public getCategoryByName(name: string): Category | null {
    const key = normalizeKey(name);
    return this.listCategories().find((category) => normalizeKey(category.name) === key) ?? null;
  }

  public listCategories(): Category[] {
    return [...this.categories.values()];
  }

  public updateCategory(id: string, input: { name: string; updatedAt: string }): Category {
    const current = this.categories.get(id);

    if (current === undefined) {
      throw new BucketCommandError("NOT_FOUND", "category was not found.");
    }

    const updated = { ...current, ...input };
    this.categories.set(id, updated);
    return updated;
  }

  public deleteCategory(id: string): void {
    this.categories.delete(id);
  }

  public isCategoryInUse(id: string): boolean {
    return [...this.commands.values()].some((command) => command.categoryId === id);
  }

  public createCommand(input: PersistedCommandInput): CommandRecord {
    const category = this.getCategoryById(input.categoryId);

    if (category === null) {
      throw new BucketCommandError("NOT_FOUND", "category was not found.");
    }

    const command = { ...input, categoryName: category.name };
    this.commands.set(command.id, command);
    return command;
  }

  public getCommandById(id: string): CommandRecord | null {
    return this.commands.get(id) ?? null;
  }

  public getCommandByAlias(alias: string): CommandRecord | null {
    const key = normalizeKey(alias);
    return [...this.commands.values()].find((command) => command.alias !== null && normalizeKey(command.alias) === key) ?? null;
  }

  public listCommands(filters: CommandFilters = {}): CommandRecord[] {
    return [...this.commands.values()].filter((command) => {
      const matchesCategory =
        filters.category?.id === undefined ? true : command.categoryId === filters.category.id;
      const matchesShell = filters.shellTarget === undefined ? true : command.shellTarget === filters.shellTarget;
      const query = filters.query?.trim().toLocaleLowerCase();
      const haystack = [command.title, command.alias, command.content, command.note].join("\n").toLocaleLowerCase();
      const matchesQuery = query === undefined || query.length === 0 ? true : haystack.includes(query);

      return matchesCategory && matchesShell && matchesQuery;
    });
  }

  public updateCommand(id: string, input: PersistedCommandUpdate): CommandRecord {
    const current = this.commands.get(id);
    const category = this.getCategoryById(input.categoryId);

    if (current === undefined || category === null) {
      throw new BucketCommandError("NOT_FOUND", "command was not found.");
    }

    const updated = { ...current, ...input, categoryName: category.name };
    this.commands.set(id, updated);
    return updated;
  }

  public deleteCommand(id: string): void {
    this.commands.delete(id);
  }
}

const createService = (): BucketCommandService => {
  let id = 0;

  return new BucketCommandService(new MemoryStore(), {
    idFactory: () => `id-${++id}`,
    now: () => new Date("2026-07-28T12:00:00.000Z")
  });
};

describe("BucketCommandService", () => {
  it("validates category CRUD and rejects occupied category deletion", () => {
    const service = createService();
    const category = service.createCategory({ name: " SQL " });

    expect(category.name).toBe("SQL");
    expect(() => service.createCategory({ name: "sql" })).toThrow(BucketCommandError);

    service.createCommand({
      title: "List tables",
      content: "SELECT *\nFROM users;",
      category: { name: "sql" },
      alias: "users",
      shellTarget: "other"
    });

    expect(() => service.deleteCategory(category.id)).toThrow(/contains commands/);
  });

  it("creates, retrieves, updates, searches and deletes commands without a run use case", () => {
    const service = createService();
    service.createCategory({ name: "bash" });
    service.createCategory({ name: "git" });

    const command = service.createCommand({
      title: "Show remotes",
      content: "git remote -v",
      category: { name: "git" },
      alias: "remotes",
      note: "Inspect repository remotes",
      shellTarget: "bash"
    });

    expect(service.getCommandByAlias("REMOTES").id).toBe(command.id);
    expect(() =>
      service.createCommand({
        title: "Duplicate alias",
        content: "pwd",
        category: { name: "bash" },
        alias: "Remotes",
        shellTarget: "bash"
      })
    ).toThrow(/alias already exists/);

    const updated = service.updateCommand(command.id, {
      category: { name: "bash" },
      alias: null,
      note: "changed"
    });

    expect(updated.alias).toBeNull();
    expect(service.listCommands({ query: "changed", shellTarget: "bash" })).toHaveLength(1);
    expect("run" in service).toBe(false);

    service.deleteCommand(command.id);
    expect(service.listCommands()).toHaveLength(0);
  });

  it("rejects missing required values and unsupported shell targets", () => {
    const service = createService();
    service.createCategory({ name: "bash" });

    expect(() => service.createCategory({ name: " " })).toThrow(/category name is required/);
    expect(() =>
      service.createCommand({
        title: "No content",
        content: " ",
        category: { name: "bash" },
        shellTarget: "bash"
      })
    ).toThrow(/content is required/);
    expect(() =>
      service.createCommand({
        title: "Unsupported",
        content: "echo ok",
        category: { name: "bash" },
        shellTarget: "zsh" as unknown as ShellTarget
      })
    ).toThrow(/shellTarget/);
  });
});
