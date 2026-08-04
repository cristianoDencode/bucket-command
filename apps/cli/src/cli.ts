import {
  BucketCommandError,
  BucketCommandService,
  categoryIconKeys,
  commandLanguages,
  executableShells,
  type CategoryIconKey,
  type CommandFilters,
  type CommandLanguage,
  type ExecutableShell
} from "@bucket-command/core";
import { backupLibraryFile, exportLibraryFile, importLibraryFile, SqliteBucketCommandStore } from "@bucket-command/storage";
import { helpText } from "./help.js";
import { booleanOption, parseArgs, stringOption } from "./options.js";
import { formatCategory, formatCommandDetails, formatCommandListItem, formatSequenceDetails, formatSequenceListItem } from "./output.js";
import type { CliStreams } from "./streams.js";

export interface CliRunOptions {
  argv: string[];
  env?: NodeJS.ProcessEnv;
  streams?: CliStreams;
}

export const runCli = async (options: CliRunOptions): Promise<number> => {
  const env = options.env ?? process.env;
  const streams = options.streams ?? {
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr
  };
  const parsed = parseArgs(options.argv);
  const [resource, action, target] = parsed.positionals;

  if (resource === undefined || resource === "help" || resource === "--help") {
    streams.stdout.write(helpText);
    return 0;
  }

  const store = new SqliteBucketCommandStore({ env });
  const service = new BucketCommandService(store);

  try {
    if (resource === "category") {
      return handleCategory(service, action, target, parsed.options, streams);
    }

    if (resource === "command") {
      return handleCommand(service, action, target, parsed.options, streams);
    }

    if (resource === "sequence") {
      return handleSequence(service, action, target, parsed.options, streams);
    }

    if (resource === "library") {
      return await handleLibrary(service, store, action, parsed.options, streams);
    }

    streams.stderr.write(`Unknown resource '${resource}'.\n`);
    streams.stderr.write(helpText);
    return 2;
  } catch (error) {
    streams.stderr.write(`${formatError(error)}\n`);
    return 1;
  } finally {
    store.close();
  }
};

const handleLibrary = async (
  service: BucketCommandService,
  store: SqliteBucketCommandStore,
  action: string | undefined,
  options: Map<string, string | boolean>,
  streams: CliStreams
): Promise<number> => {
  if (action === "export") {
    const result = await exportLibraryFile(service, requiredOption(options, "output"));
    streams.stdout.write(
      `library exported\t${result.path}\t${result.summary.categories} categories\t${result.summary.commands} commands\t${result.summary.sequences} sequences\n`
    );
    return 0;
  }

  if (action === "import") {
    const result = await importLibraryFile(service, store, requiredOption(options, "input"));
    streams.stdout.write(
      `library imported\t${result.categories} categories\t${result.commands} commands\t${result.sequences} sequences\n`
    );
    return 0;
  }

  if (action === "backup") {
    const result = await backupLibraryFile(service, requiredOption(options, "output"));
    streams.stdout.write(
      `library backup created\t${result.path}\t${result.summary.categories} categories\t${result.summary.commands} commands\t${result.summary.sequences} sequences\n`
    );
    return 0;
  }

  streams.stderr.write("Unknown library action.\n");
  streams.stderr.write(helpText);
  return 2;
};

const handleCategory = (
  service: BucketCommandService,
  action: string | undefined,
  target: string | undefined,
  options: Map<string, string | boolean>,
  streams: CliStreams
): number => {
  if (action === "add") {
    const category = service.createCategory({ name: requiredOption(options, "name"), iconKey: optionalIcon(options) });
    streams.stdout.write(`${formatCategory(category)}\n`);
    return 0;
  }

  if (action === "list") {
    for (const category of service.listCategories()) {
      streams.stdout.write(`${formatCategory(category)}\n`);
    }

    return 0;
  }

  if (action === "update") {
    const category = service.updateCategory(resolveCategoryId(service, requiredTarget(target)), {
      name: requiredOption(options, "name"),
      iconKey: optionalIcon(options)
    });
    streams.stdout.write(`${formatCategory(category)}\n`);
    return 0;
  }

  if (action === "delete") {
    service.deleteCategory(resolveCategoryId(service, requiredTarget(target)));
    streams.stdout.write("category deleted\n");
    return 0;
  }

  streams.stderr.write("Unknown category action.\n");
  streams.stderr.write(helpText);
  return 2;
};

const handleCommand = (
  service: BucketCommandService,
  action: string | undefined,
  target: string | undefined,
  options: Map<string, string | boolean>,
  streams: CliStreams
): number => {
  if (action === "add") {
    const command = service.createCommand({
      title: requiredOption(options, "title"),
      content: requiredOption(options, "content"),
      category: referenceOption(options, "category"),
      alias: stringOption(options, "alias") ?? null,
      note: stringOption(options, "note") ?? null,
      language: requiredLanguage(options)
    });
    streams.stdout.write(`${formatCommandListItem(command)}\n`);
    return 0;
  }

  if (action === "list" || action === "search") {
    const filters = commandFilters(options, action === "search" ? target : undefined);

    for (const command of service.listCommands(filters)) {
      streams.stdout.write(`${formatCommandListItem(command)}\n`);
    }

    return 0;
  }

  if (action === "get" || action === "show") {
    const command = service.getCommandByAlias(requiredTarget(target));

    if (booleanOption(options, "raw")) {
      streams.stdout.write(command.content);
      return 0;
    }

    streams.stdout.write(`${formatCommandDetails(command)}\n`);
    return 0;
  }

  if (action === "update") {
    const command = service.updateCommand(resolveCommandId(service, requiredTarget(target)), {
      title: stringOption(options, "title"),
      content: stringOption(options, "content"),
      category: stringOption(options, "category") === undefined ? undefined : referenceOption(options, "category"),
      alias: booleanOption(options, "no-alias") ? null : stringOption(options, "alias"),
      note: booleanOption(options, "no-note") ? null : stringOption(options, "note"),
      language: optionalLanguage(options)
    });
    streams.stdout.write(`${formatCommandListItem(command)}\n`);
    return 0;
  }

  if (action === "delete") {
    service.deleteCommand(resolveCommandId(service, requiredTarget(target)));
    streams.stdout.write("command deleted\n");
    return 0;
  }

  streams.stderr.write("Unknown command action.\n");
  streams.stderr.write(helpText);
  return 2;
};

const handleSequence = (
  service: BucketCommandService,
  action: string | undefined,
  target: string | undefined,
  options: Map<string, string | boolean>,
  streams: CliStreams
): number => {
  if (action === "add") {
    const sequence = service.createSequence({
      title: requiredOption(options, "title"),
      category: referenceOption(options, "category"),
      alias: requiredOption(options, "alias"),
      note: stringOption(options, "note") ?? null,
      shellTarget: requiredSequenceShell(options),
      commandAliases: requiredItems(options)
    });
    streams.stdout.write(`${formatSequenceListItem(sequence)}\n`);
    return 0;
  }

  if (action === "list") {
    for (const sequence of service.listSequences()) {
      streams.stdout.write(`${formatSequenceListItem(sequence)}\n`);
    }

    return 0;
  }

  if (action === "show" || action === "get") {
    const sequence = service.getSequenceByAlias(requiredTarget(target));
    streams.stdout.write(`${formatSequenceDetails(sequence)}\n`);
    return 0;
  }

  if (action === "update") {
    const sequence = service.updateSequence(resolveSequenceId(service, requiredTarget(target)), {
      title: stringOption(options, "title"),
      category: stringOption(options, "category") === undefined ? undefined : referenceOption(options, "category"),
      alias: stringOption(options, "alias"),
      note: booleanOption(options, "no-note") ? null : stringOption(options, "note"),
      shellTarget: stringOption(options, "shell") === undefined ? undefined : parseSequenceShell(requiredOption(options, "shell")),
      commandAliases: stringOption(options, "items") === undefined ? undefined : requiredItems(options)
    });
    streams.stdout.write(`${formatSequenceListItem(sequence)}\n`);
    return 0;
  }

  if (action === "delete") {
    service.deleteSequence(resolveSequenceId(service, requiredTarget(target)));
    streams.stdout.write("sequence deleted\n");
    return 0;
  }

  streams.stderr.write("Unknown sequence action.\n");
  streams.stderr.write(helpText);
  return 2;
};

const commandFilters = (options: Map<string, string | boolean>, searchTarget: string | undefined): CommandFilters => {
  const category = stringOption(options, "category");
  const query = stringOption(options, "query") ?? searchTarget;

  return {
    query,
    category: category === undefined ? undefined : { name: category, id: category },
    language: optionalLanguage(options)
  };
};

const resolveCategoryId = (service: BucketCommandService, target: string): string => {
  const found = service
    .listCategories()
    .find((category) => category.id === target || category.name.toLocaleLowerCase() === target.toLocaleLowerCase());

  if (found === undefined) {
    throw new BucketCommandError("NOT_FOUND", "category was not found.");
  }

  return found.id;
};

const resolveCommandId = (service: BucketCommandService, target: string): string => {
  const found = service
    .listCommands()
    .find((command) => command.id === target || command.alias?.toLocaleLowerCase() === target.toLocaleLowerCase());

  if (found === undefined) {
    throw new BucketCommandError("NOT_FOUND", "command was not found.");
  }

  return found.id;
};

const resolveSequenceId = (service: BucketCommandService, target: string): string => {
  const found = service
    .listSequences()
    .find((sequence) => sequence.id === target || sequence.alias.toLocaleLowerCase() === target.toLocaleLowerCase());

  if (found === undefined) {
    throw new BucketCommandError("NOT_FOUND", "sequence was not found.");
  }

  return found.id;
};

const requiredTarget = (target: string | undefined): string => {
  if (target === undefined || target.trim().length === 0) {
    throw new BucketCommandError("VALIDATION_ERROR", "target is required.");
  }

  return target;
};

const requiredOption = (options: Map<string, string | boolean>, name: string): string => {
  const value = stringOption(options, name);

  if (value === undefined || value.trim().length === 0) {
    throw new BucketCommandError("VALIDATION_ERROR", `--${name} is required.`);
  }

  return value;
};

// "--shell" is kept as an alias of "--language" on command actions so existing scripts
// built around the old shell-only field keep working.
const languageOptionValue = (options: Map<string, string | boolean>): string | undefined =>
  stringOption(options, "language") ?? stringOption(options, "shell");

const requiredLanguage = (options: Map<string, string | boolean>): CommandLanguage => {
  const value = languageOptionValue(options);

  if (value === undefined) {
    throw new BucketCommandError("VALIDATION_ERROR", "--language is required.");
  }

  return parseLanguage(value);
};

const optionalLanguage = (options: Map<string, string | boolean>): CommandLanguage | undefined => {
  const value = languageOptionValue(options);
  return value === undefined ? undefined : parseLanguage(value);
};

const parseLanguage = (value: string): CommandLanguage => {
  if (!commandLanguages.includes(value as CommandLanguage)) {
    throw new BucketCommandError("VALIDATION_ERROR", `--language must be one of: ${commandLanguages.join(", ")}.`);
  }

  return value as CommandLanguage;
};

const optionalIcon = (options: Map<string, string | boolean>): CategoryIconKey | null | undefined => {
  const icon = stringOption(options, "icon");

  if (icon === undefined) {
    return undefined;
  }

  if (icon.trim().length === 0 || icon === "none") {
    return null;
  }

  if (!categoryIconKeys.includes(icon as CategoryIconKey)) {
    throw new BucketCommandError("VALIDATION_ERROR", `--icon must be one of: ${categoryIconKeys.join(", ")}.`);
  }

  return icon as CategoryIconKey;
};

const requiredSequenceShell = (options: Map<string, string | boolean>): ExecutableShell =>
  parseSequenceShell(requiredOption(options, "shell"));

const parseSequenceShell = (value: string): ExecutableShell => {
  if (!executableShells.includes(value as ExecutableShell)) {
    throw new BucketCommandError("VALIDATION_ERROR", "--shell must be bash or powershell.");
  }

  return value as ExecutableShell;
};

const requiredItems = (options: Map<string, string | boolean>): string[] => {
  const items = requiredOption(options, "items")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (items.length === 0) {
    throw new BucketCommandError("VALIDATION_ERROR", "--items must include at least one command alias.");
  }

  return items;
};

const referenceOption = (options: Map<string, string | boolean>, name: string): { id: string; name: string } => {
  const value = requiredOption(options, name);
  return { id: value, name: value };
};

const formatError = (error: unknown): string => {
  if (error instanceof BucketCommandError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error.";
};
