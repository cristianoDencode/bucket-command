import { BucketCommandError, BucketCommandService, shellTargets, type CommandFilters, type ShellTarget } from "@bucket-command/core";
import { SqliteBucketCommandStore } from "@bucket-command/storage";
import { helpText } from "./help.js";
import { booleanOption, parseArgs, stringOption } from "./options.js";
import { formatCategory, formatCommandDetails, formatCommandListItem } from "./output.js";
import { BashShellRunner, confirmRun, type CliStreams, type ShellRunner } from "./shell-runner.js";

export interface CliRunOptions {
  argv: string[];
  env?: NodeJS.ProcessEnv;
  streams?: CliStreams;
  shellRunner?: ShellRunner;
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
      return await handleCommand(service, action, target, parsed.options, streams, options.shellRunner ?? new BashShellRunner(env));
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

const handleCategory = (
  service: BucketCommandService,
  action: string | undefined,
  target: string | undefined,
  options: Map<string, string | boolean>,
  streams: CliStreams
): number => {
  if (action === "add") {
    const category = service.createCategory({ name: requiredOption(options, "name") });
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
      name: requiredOption(options, "name")
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

const handleCommand = async (
  service: BucketCommandService,
  action: string | undefined,
  target: string | undefined,
  options: Map<string, string | boolean>,
  streams: CliStreams,
  shellRunner: ShellRunner
): Promise<number> => {
  if (action === "add") {
    const command = service.createCommand({
      title: requiredOption(options, "title"),
      content: requiredOption(options, "content"),
      category: referenceOption(options, "category"),
      alias: stringOption(options, "alias") ?? null,
      note: stringOption(options, "note") ?? null,
      shellTarget: requiredShell(options)
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
      shellTarget: stringOption(options, "shell") as ShellTarget | undefined
    });
    streams.stdout.write(`${formatCommandListItem(command)}\n`);
    return 0;
  }

  if (action === "delete") {
    service.deleteCommand(resolveCommandId(service, requiredTarget(target)));
    streams.stdout.write("command deleted\n");
    return 0;
  }

  if (action === "run") {
    const command = service.getCommandByAlias(requiredTarget(target));

    if (!booleanOption(options, "yes")) {
      const confirmed = await confirmRun(command, streams);

      if (!confirmed) {
        streams.stderr.write("Run cancelled.\n");
        return 130;
      }
    }

    return await shellRunner.run(command, streams);
  }

  streams.stderr.write("Unknown command action.\n");
  streams.stderr.write(helpText);
  return 2;
};

const commandFilters = (options: Map<string, string | boolean>, searchTarget: string | undefined): CommandFilters => {
  const category = stringOption(options, "category");
  const shell = stringOption(options, "shell");
  const query = stringOption(options, "query") ?? searchTarget;

  return {
    query,
    category: category === undefined ? undefined : { name: category, id: category },
    shellTarget: shell === undefined ? undefined : parseShell(shell)
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

const requiredShell = (options: Map<string, string | boolean>): ShellTarget => parseShell(requiredOption(options, "shell"));

const parseShell = (value: string): ShellTarget => {
  if (!shellTargets.includes(value as ShellTarget)) {
    throw new BucketCommandError("VALIDATION_ERROR", "--shell must be bash, powershell or other.");
  }

  return value as ShellTarget;
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
