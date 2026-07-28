export interface ParsedArgs {
  positionals: string[];
  options: Map<string, string | boolean>;
}

export const parseArgs = (args: string[]): ParsedArgs => {
  const positionals: string[] = [];
  const options = new Map<string, string | boolean>();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const withoutPrefix = arg.slice(2);
    const equalsIndex = withoutPrefix.indexOf("=");

    if (equalsIndex >= 0) {
      options.set(withoutPrefix.slice(0, equalsIndex), withoutPrefix.slice(equalsIndex + 1));
      continue;
    }

    const next = args[index + 1];

    if (next !== undefined && !next.startsWith("--")) {
      options.set(withoutPrefix, next);
      index += 1;
      continue;
    }

    options.set(withoutPrefix, true);
  }

  return { positionals, options };
};

export const stringOption = (options: Map<string, string | boolean>, name: string): string | undefined => {
  const value = options.get(name);

  return typeof value === "string" ? value : undefined;
};

export const booleanOption = (options: Map<string, string | boolean>, name: string): boolean => options.get(name) === true;
