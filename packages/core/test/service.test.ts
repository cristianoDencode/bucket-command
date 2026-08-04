import { describe, expect, it } from "vitest";
import {
  BucketCommandError,
  BucketCommandService,
  type BucketCommandStore,
  type AnnotationRecord,
  type Category,
  type CategoryIconKey,
  type CommandFilters,
  type CommandRecord,
  type CommandSequence,
  type PersistedCategoryInput,
  type PersistedAnnotationInput,
  type PersistedAnnotationUpdate,
  type PersistedCommandInput,
  type PersistedCommandUpdate,
  type PersistedSequenceInput,
  type PersistedSequenceUpdate,
  type CommandLanguage
} from "../src/index.js";
import { normalizeKey } from "../src/validation.js";

class MemoryStore implements BucketCommandStore {
  private readonly categories = new Map<string, Category>();
  private readonly commands = new Map<string, CommandRecord>();
  private readonly sequences = new Map<string, CommandSequence>();
  private readonly annotations = new Map<string, AnnotationRecord>();

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

  public updateCategory(id: string, input: { name: string; iconKey: CategoryIconKey | null; updatedAt: string }): Category {
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
    return (
      [...this.commands.values()].some((command) => command.categoryId === id) ||
      [...this.sequences.values()].some((sequence) => sequence.categoryId === id)
    );
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
      const matchesShell = filters.language === undefined ? true : command.language === filters.language;
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

  public isCommandInUse(id: string): boolean {
    return [...this.sequences.values()].some((sequence) => sequence.items.some((item) => item.command.id === id));
  }

  public createSequence(input: PersistedSequenceInput): CommandSequence {
    const category = this.getCategoryById(input.categoryId);

    if (category === null) {
      throw new BucketCommandError("NOT_FOUND", "category was not found.");
    }

    const sequence = {
      ...input,
      categoryName: category.name,
      items: input.commandIds.map((commandId, index) => ({
        position: index + 1,
        command: this.commands.get(commandId) as CommandRecord
      }))
    };
    this.sequences.set(sequence.id, sequence);
    return sequence;
  }

  public getSequenceById(id: string): CommandSequence | null {
    return this.sequences.get(id) ?? null;
  }

  public getSequenceByAlias(alias: string): CommandSequence | null {
    const key = normalizeKey(alias);
    return [...this.sequences.values()].find((sequence) => normalizeKey(sequence.alias) === key) ?? null;
  }

  public listSequences(): CommandSequence[] {
    return [...this.sequences.values()];
  }

  public updateSequence(id: string, input: PersistedSequenceUpdate): CommandSequence {
    const current = this.sequences.get(id);
    const category = this.getCategoryById(input.categoryId);

    if (current === undefined || category === null) {
      throw new BucketCommandError("NOT_FOUND", "sequence was not found.");
    }

    const updated = {
      ...current,
      ...input,
      categoryName: category.name,
      items: input.commandIds.map((commandId, index) => ({
        position: index + 1,
        command: this.commands.get(commandId) as CommandRecord
      }))
    };
    this.sequences.set(id, updated);
    return updated;
  }

  public deleteSequence(id: string): void {
    this.sequences.delete(id);
  }

  public createAnnotation(input: PersistedAnnotationInput): AnnotationRecord {
    const annotation = { ...input };
    this.annotations.set(annotation.id, annotation);
    return annotation;
  }

  public getAnnotationById(id: string): AnnotationRecord | null {
    return this.annotations.get(id) ?? null;
  }

  public listAnnotations(): AnnotationRecord[] {
    return [...this.annotations.values()];
  }

  public updateAnnotation(id: string, input: PersistedAnnotationUpdate): AnnotationRecord {
    const current = this.annotations.get(id);

    if (current === undefined) {
      throw new BucketCommandError("NOT_FOUND", "annotation was not found.");
    }

    const updated = { ...current, ...input };
    this.annotations.set(id, updated);
    return updated;
  }

  public deleteAnnotation(id: string): void {
    this.annotations.delete(id);
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
    const category = service.createCategory({ name: " SQL ", iconKey: "database" });

    expect(category.name).toBe("SQL");
    expect(category.iconKey).toBe("database");
    expect(() => service.createCategory({ name: "sql" })).toThrow(BucketCommandError);
    expect(() => service.createCategory({ name: "x".repeat(41) })).toThrow(/40 characters or fewer/);
    expect(() => service.createCategory({ name: "icons", iconKey: "sparkles" as unknown as CategoryIconKey })).toThrow(/category icon/);

    expect(service.updateCategory(category.id, { name: " SQL Docs " }).iconKey).toBe("database");
    expect(service.updateCategory(category.id, { name: "SQL", iconKey: null }).iconKey).toBeNull();

    service.createCommand({
      title: "List tables",
      content: "SELECT *\nFROM users;",
      category: { name: "sql" },
      alias: "users",
      language: "sql"
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
      language: "bash"
    });

    expect(service.getCommandByAlias("REMOTES").id).toBe(command.id);
    expect(() =>
      service.createCommand({
        title: "Duplicate alias",
        content: "pwd",
        category: { name: "bash" },
        alias: "Remotes",
        language: "bash"
      })
    ).toThrow(/alias already exists/);

    const updated = service.updateCommand(command.id, {
      category: { name: "bash" },
      alias: null,
      note: "changed"
    });

    expect(updated.alias).toBeNull();
    expect(service.listCommands({ query: "changed", language: "bash" })).toHaveLength(1);
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
        language: "bash"
      })
    ).toThrow(/content is required/);
    expect(() =>
      service.createCommand({
        title: "Unsupported",
        content: "echo ok",
        category: { name: "bash" },
        language: "zsh" as unknown as CommandLanguage
      })
    ).toThrow(/language/);
    expect(() =>
      service.createCommand({
        title: "x".repeat(41),
        content: "echo ok",
        category: { name: "bash" },
        language: "bash"
      })
    ).toThrow(/40 characters or fewer/);
  });

  it("creates sequences with ordered compatible commands and unique aliases", () => {
    const service = createService();
    service.createCategory({ name: "git" });
    service.createCommand({
      title: "Status",
      content: "git status",
      category: { name: "git" },
      alias: "gst",
      language: "bash"
    });
    service.createCommand({
      title: "Log",
      content: "git log --oneline -3",
      category: { name: "git" },
      alias: "glog",
      language: "bash"
    });

    const sequence = service.createSequence({
      title: "Git check",
      category: { name: "git" },
      alias: "gcheck",
      shellTarget: "bash",
      commandAliases: ["gst", "glog"]
    });

    expect(sequence.items.map((item) => item.command.alias)).toEqual(["gst", "glog"]);
    expect(service.getRunnableByAlias("gcheck")).toEqual(sequence);
    expect(() =>
      service.createCommand({
        title: "Duplicate sequence alias",
        content: "pwd",
        category: { name: "git" },
        alias: "GCHECK",
        language: "bash"
      })
    ).toThrow(/alias already exists/);
    expect(() => service.deleteCommand(sequence.items[0].command.id)).toThrow(/used by a sequence/);
  });

  it("autosaves annotations without requiring a title", () => {
    const service = createService();

    const annotation = service.createAnnotation({
      title: "",
      content: "",
      note: null,
      language: "markdown"
    });

    expect(annotation.title).toBeNull();
    expect(annotation.content).toBe("");

    const updated = service.updateAnnotation(annotation.id, {
      title: "  1234  ",
      content: "analysis\n```sql\nselect 1\n```",
      note: "Demand notes",
      language: "markdown"
    });

    expect(updated.title).toBe("1234");
    expect(service.listAnnotations()).toHaveLength(1);
    expect(service.listAnnotations()[0]?.note).toBe("Demand notes");
    expect(() => service.updateAnnotation(annotation.id, { title: "x".repeat(41) })).toThrow(/40 characters or fewer/);
  });
});
