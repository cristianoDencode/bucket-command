import {
  shellTargets,
  type CategoryReference,
  type CommandFilters,
  type CreateCategoryInput,
  type CreateCommandInput,
  type ShellTarget,
  type UpdateCategoryInput,
  type UpdateCommandInput
} from "@bucket-command/core";

export const readCreateCategoryInput = (value: unknown): CreateCategoryInput => {
  const record = asRecord(value);
  return { name: requiredString(record.name, "name") };
};

export const readUpdateCategoryInput = (value: unknown): UpdateCategoryInput => readCreateCategoryInput(value);

export const readCreateCommandInput = (value: unknown): CreateCommandInput => {
  const record = asRecord(value);

  return {
    title: requiredString(record.title, "title"),
    content: requiredString(record.content, "content"),
    category: readCategoryReference(record.category),
    alias: optionalString(record.alias),
    note: optionalString(record.note),
    shellTarget: readShellTarget(record.shellTarget)
  };
};

export const readUpdateCommandInput = (value: unknown): UpdateCommandInput => {
  const record = asRecord(value);

  return {
    title: optionalStrictString(record.title),
    content: optionalStrictString(record.content),
    category: record.category === undefined ? undefined : readCategoryReference(record.category),
    alias: optionalString(record.alias),
    note: optionalString(record.note),
    shellTarget: record.shellTarget === undefined ? undefined : readShellTarget(record.shellTarget)
  };
};

export const readCommandFilters = (value: unknown): CommandFilters => {
  if (value === undefined) {
    return {};
  }

  const record = asRecord(value);

  return {
    query: optionalString(record.query) ?? undefined,
    category: record.category === undefined ? undefined : readCategoryReference(record.category),
    shellTarget: record.shellTarget === undefined ? undefined : readShellTarget(record.shellTarget)
  };
};

export const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }

  return value;
};

export const optionalString = (value: unknown): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("value must be a string.");
  }

  return value;
};

const optionalStrictString = (value: unknown): string | undefined => {
  const stringValue = optionalString(value);
  return stringValue ?? undefined;
};

const readCategoryReference = (value: unknown): CategoryReference => {
  const record = asRecord(value);
  const id = optionalString(record.id);
  const name = optionalString(record.name);

  return {
    id: id ?? undefined,
    name: name ?? undefined
  };
};

const readShellTarget = (value: unknown): ShellTarget => {
  if (typeof value !== "string" || !shellTargets.includes(value as ShellTarget)) {
    throw new Error("shellTarget must be bash, powershell or other.");
  }

  return value as ShellTarget;
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("input must be an object.");
  }

  return value as Record<string, unknown>;
};
