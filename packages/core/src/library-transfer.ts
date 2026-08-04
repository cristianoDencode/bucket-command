import { BucketCommandError, validationError } from "./errors.js";
import type { BucketCommandService } from "./service.js";
import { categoryIconKeys, commandLanguages, executableShells, type CategoryIconKey, type CommandLanguage, type ExecutableShell } from "./types.js";
import { normalizeKey, optionalCategoryIconKey, requiredCategoryName } from "./validation.js";

export const libraryExportFormat = "bucket-command-library";
export const libraryExportVersion = 1;

export interface LibraryCategory {
  name: string;
  iconKey: CategoryIconKey | null;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryCommand {
  title: string;
  content: string;
  category: string;
  alias: string | null;
  note: string | null;
  language: CommandLanguage;
  createdAt: string;
  updatedAt: string;
}

export interface LibrarySequenceItem {
  position: number;
  commandAlias: string;
}

export interface LibrarySequence {
  title: string;
  category: string;
  alias: string;
  note: string | null;
  shellTarget: ExecutableShell;
  items: LibrarySequenceItem[];
  createdAt: string;
  updatedAt: string;
}

export interface LibraryAnnotation {
  title: string | null;
  content: string;
  note: string | null;
  language: CommandLanguage;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryExport {
  format: typeof libraryExportFormat;
  version: typeof libraryExportVersion;
  exportedAt: string;
  categories: LibraryCategory[];
  commands: LibraryCommand[];
  sequences: LibrarySequence[];
  annotations: LibraryAnnotation[];
}

export interface LibrarySummary {
  categories: number;
  commands: number;
  sequences: number;
  annotations: number;
}

export interface LibraryImportSummary extends LibrarySummary {
  importedAt: string;
}

export const exportLibrary = (service: BucketCommandService, now: Date = new Date()): LibraryExport => {
  const categories = service.listCategories();
  const commands = service.listCommands();
  const sequences = service.listSequences();
  const annotations = service.listAnnotations();

  return {
    format: libraryExportFormat,
    version: libraryExportVersion,
    exportedAt: now.toISOString(),
    categories: categories.map((category) => ({
      name: category.name,
      iconKey: category.iconKey,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt
    })),
    commands: commands.map((command) => ({
      title: command.title,
      content: command.content,
      category: command.categoryName,
      alias: command.alias,
      note: command.note,
      language: command.language,
      createdAt: command.createdAt,
      updatedAt: command.updatedAt
    })),
    sequences: sequences.map((sequence) => ({
      title: sequence.title,
      category: sequence.categoryName,
      alias: sequence.alias,
      note: sequence.note,
      shellTarget: sequence.shellTarget,
      items: sequence.items.map((item) => {
        if (item.command.alias === null) {
          throw validationError(`sequence '${sequence.alias}' contains command '${item.command.title}' without alias.`);
        }

        return {
          position: item.position,
          commandAlias: item.command.alias
        };
      }),
      createdAt: sequence.createdAt,
      updatedAt: sequence.updatedAt
    })),
    annotations: annotations.map((annotation) => ({
      title: annotation.title,
      content: annotation.content,
      note: annotation.note,
      language: annotation.language,
      createdAt: annotation.createdAt,
      updatedAt: annotation.updatedAt
    }))
  };
};

export const parseLibraryExport = (value: unknown): LibraryExport => {
  const input = readObject(value, "library file");

  if (input.format !== libraryExportFormat) {
    throw validationError("library file format is invalid.");
  }

  if (input.version !== libraryExportVersion) {
    throw validationError(`library file version is unsupported. Expected version ${libraryExportVersion}.`);
  }

  return {
    format: libraryExportFormat,
    version: libraryExportVersion,
    exportedAt: readString(input.exportedAt, "exportedAt"),
    categories: readArray(input.categories, "categories").map(readCategory),
    commands: readArray(input.commands, "commands").map(readCommand),
    sequences: readArray(input.sequences, "sequences").map(readSequence),
    annotations: readArray(input.annotations ?? [], "annotations").map(readAnnotation)
  };
};

export const importLibrary = (
  service: BucketCommandService,
  library: LibraryExport,
  now: Date = new Date()
): LibraryImportSummary => {
  validateLibraryImport(service, library);

  for (const category of library.categories) {
    service.createCategory({ name: category.name, iconKey: category.iconKey });
  }

  for (const command of library.commands) {
    service.createCommand({
      title: command.title,
      content: command.content,
      category: { name: command.category },
      alias: command.alias,
      note: command.note,
      language: command.language
    });
  }

  for (const sequence of library.sequences) {
    service.createSequence({
      title: sequence.title,
      category: { name: sequence.category },
      alias: sequence.alias,
      note: sequence.note,
      shellTarget: sequence.shellTarget,
      commandAliases: sequence.items.sort((left, right) => left.position - right.position).map((item) => item.commandAlias)
    });
  }

  for (const annotation of library.annotations) {
    service.createAnnotation({
      title: annotation.title,
      content: annotation.content,
      note: annotation.note,
      language: annotation.language
    });
  }

  return {
    ...summarizeLibrary(library),
    importedAt: now.toISOString()
  };
};

export const validateLibraryImport = (service: BucketCommandService, library: LibraryExport): void => {
  assertUnique(library.categories.map((category) => category.name), "category");
  assertUnique(library.commands.flatMap((command) => (command.alias === null ? [] : [command.alias])), "command alias");
  assertUnique(library.sequences.map((sequence) => sequence.alias), "sequence alias");
  assertUnique(
    [
      ...library.commands.flatMap((command) => (command.alias === null ? [] : [command.alias])),
      ...library.sequences.map((sequence) => sequence.alias)
    ],
    "alias"
  );

  const categoryNames = new Set(library.categories.map((category) => normalizeKey(category.name)));
  for (const category of library.categories) {
    requiredCategoryName(category.name);
    optionalCategoryIconKey(category.iconKey);
  }

  for (const command of library.commands) {
    if (!categoryNames.has(normalizeKey(command.category))) {
      throw validationError(`command '${command.title}' references missing category '${command.category}'.`);
    }
  }

  const commandAliases = new Set(library.commands.flatMap((command) => (command.alias === null ? [] : [normalizeKey(command.alias)])));
  const commandShells = new Map(
    library.commands.flatMap((command) => (command.alias === null ? [] : [[normalizeKey(command.alias), command.language] as const]))
  );
  for (const sequence of library.sequences) {
    if (!categoryNames.has(normalizeKey(sequence.category))) {
      throw validationError(`sequence '${sequence.alias}' references missing category '${sequence.category}'.`);
    }

    if (sequence.items.length === 0) {
      throw validationError(`sequence '${sequence.alias}' must include at least one item.`);
    }

    assertUnique(
      sequence.items.map((item) => String(item.position)),
      `position in sequence '${sequence.alias}'`
    );

    for (const item of sequence.items) {
      if (!commandAliases.has(normalizeKey(item.commandAlias))) {
        throw validationError(`sequence '${sequence.alias}' references missing command alias '${item.commandAlias}'.`);
      }

      if (commandShells.get(normalizeKey(item.commandAlias)) !== sequence.shellTarget) {
        throw validationError(`sequence '${sequence.alias}' item '${item.commandAlias}' must use shell '${sequence.shellTarget}'.`);
      }
    }
  }

  const existingCategories = new Set(service.listCategories().map((category) => normalizeKey(category.name)));
  const existingCommandAliases = new Set(service.listCommands().flatMap((command) => (command.alias === null ? [] : [normalizeKey(command.alias)])));
  const existingSequenceAliases = new Set(service.listSequences().map((sequence) => normalizeKey(sequence.alias)));
  const existingAliases = new Set([...existingCommandAliases, ...existingSequenceAliases]);

  for (const category of library.categories) {
    if (existingCategories.has(normalizeKey(category.name))) {
      throw new BucketCommandError("DUPLICATE_CATEGORY", `category '${category.name}' already exists.`);
    }
  }

  for (const alias of [
    ...library.commands.flatMap((command) => (command.alias === null ? [] : [command.alias])),
    ...library.sequences.map((sequence) => sequence.alias)
  ]) {
    if (existingAliases.has(normalizeKey(alias))) {
      throw new BucketCommandError("DUPLICATE_ALIAS", `alias '${alias}' already exists.`);
    }
  }
};

export const summarizeLibrary = (library: LibraryExport): LibrarySummary => ({
  categories: library.categories.length,
  commands: library.commands.length,
  sequences: library.sequences.length,
  annotations: library.annotations.length
});

const readCategory = (value: unknown): LibraryCategory => {
  const input = readObject(value, "category");
  return {
    name: readString(input.name, "category.name"),
    iconKey: readCategoryIconKey(input.iconKey, "category.iconKey"),
    createdAt: readString(input.createdAt, "category.createdAt"),
    updatedAt: readString(input.updatedAt, "category.updatedAt")
  };
};

const readCommand = (value: unknown): LibraryCommand => {
  const input = readObject(value, "command");
  return {
    title: readString(input.title, "command.title"),
    content: readString(input.content, "command.content"),
    category: readString(input.category, "command.category"),
    alias: readNullableString(input.alias, "command.alias"),
    note: readNullableString(input.note, "command.note"),
    // "shellTarget" is the pre-rename key: kept as a fallback so older exported backup files still import.
    language: readLanguage(input.language ?? input.shellTarget, "command.language"),
    createdAt: readString(input.createdAt, "command.createdAt"),
    updatedAt: readString(input.updatedAt, "command.updatedAt")
  };
};

const readSequence = (value: unknown): LibrarySequence => {
  const input = readObject(value, "sequence");
  const shellTarget = readShell(input.shellTarget, "sequence.shellTarget");

  return {
    title: readString(input.title, "sequence.title"),
    category: readString(input.category, "sequence.category"),
    alias: readString(input.alias, "sequence.alias"),
    note: readNullableString(input.note, "sequence.note"),
    shellTarget,
    items: readArray(input.items, "sequence.items").map(readSequenceItem),
    createdAt: readString(input.createdAt, "sequence.createdAt"),
    updatedAt: readString(input.updatedAt, "sequence.updatedAt")
  };
};

const readSequenceItem = (value: unknown): LibrarySequenceItem => {
  const input = readObject(value, "sequence item");
  const position = readPositiveInteger(input.position, "sequence item.position");

  return {
    position,
    commandAlias: readString(input.commandAlias, "sequence item.commandAlias")
  };
};

const readAnnotation = (value: unknown): LibraryAnnotation => {
  const input = readObject(value, "annotation");
  return {
    title: readNullableString(input.title, "annotation.title"),
    content: readLooseString(input.content, "annotation.content"),
    note: readNullableString(input.note, "annotation.note"),
    language: readLanguage(input.language, "annotation.language"),
    createdAt: readString(input.createdAt, "annotation.createdAt"),
    updatedAt: readString(input.updatedAt, "annotation.updatedAt")
  };
};

const readLanguage = (value: unknown, field: string): CommandLanguage => {
  const target = readString(value, field);

  if (!commandLanguages.includes(target as CommandLanguage)) {
    throw validationError(`${field} must be one of: ${commandLanguages.join(", ")}.`);
  }

  return target as CommandLanguage;
};

const readShell = (value: unknown, field: string): ExecutableShell => {
  const target = readString(value, field);

  if (!executableShells.includes(target as ExecutableShell)) {
    throw validationError(`${field} must be bash or powershell.`);
  }

  return target as ExecutableShell;
};

const readCategoryIconKey = (value: unknown, field: string): CategoryIconKey | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string" || !categoryIconKeys.includes(value as CategoryIconKey)) {
    throw validationError(`${field} must be one of: ${categoryIconKeys.join(", ")}.`);
  }

  return optionalCategoryIconKey(value as CategoryIconKey);
};

const readObject = (value: unknown, field: string): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw validationError(`${field} must be an object.`);
  }

  return value as Record<string, unknown>;
};

const readArray = (value: unknown, field: string): unknown[] => {
  if (!Array.isArray(value)) {
    throw validationError(`${field} must be an array.`);
  }

  return value;
};

const readString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw validationError(`${field} is required.`);
  }

  return value;
};

const readLooseString = (value: unknown, field: string): string => {
  if (typeof value !== "string") {
    throw validationError(`${field} must be a string.`);
  }

  return value;
};

const readNullableString = (value: unknown, field: string): string | null => {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw validationError(`${field} must be a string or null.`);
  }

  return value;
};

const readPositiveInteger = (value: unknown, field: string): number => {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw validationError(`${field} must be a positive integer.`);
  }

  return value as number;
};

const assertUnique = (values: string[], label: string): void => {
  const seen = new Set<string>();

  for (const value of values) {
    const key = normalizeKey(value);

    if (seen.has(key)) {
      throw validationError(`duplicate ${label} '${value}' in library file.`);
    }

    seen.add(key);
  }
};
