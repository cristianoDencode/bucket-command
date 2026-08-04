import {
  categoryIconKeys,
  commandLanguages,
  type CategoryIconKey,
  type CategoryReference,
  type CommandFilters,
  type CommandLanguage,
  type CreateAnnotationInput,
  type CreateCategoryInput,
  type CreateCommandInput,
  type UpdateCategoryInput,
  type UpdateAnnotationInput,
  type UpdateCommandInput
} from "@bucket-command/core";

export const readCreateCategoryInput = (value: unknown): CreateCategoryInput => {
  const record = asRecord(value);
  return { name: requiredString(record.name, "name"), iconKey: readCategoryIconKey(record.iconKey) };
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
    language: readCommandLanguage(record.language)
  };
};

export const readCreateAnnotationInput = (value: unknown): CreateAnnotationInput => {
  const record = asRecord(value);

  return {
    title: optionalString(record.title),
    content: optionalStrictString(record.content),
    note: optionalString(record.note),
    language: readCommandLanguage(record.language)
  };
};

export const readUpdateAnnotationInput = (value: unknown): UpdateAnnotationInput => {
  const record = asRecord(value);

  return {
    title: optionalString(record.title),
    content: optionalStrictString(record.content),
    note: optionalString(record.note),
    language: record.language === undefined ? undefined : readCommandLanguage(record.language)
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
    language: record.language === undefined ? undefined : readCommandLanguage(record.language)
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
    language: record.language === undefined ? undefined : readCommandLanguage(record.language)
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

const readCommandLanguage = (value: unknown): CommandLanguage => {
  if (typeof value !== "string" || !commandLanguages.includes(value as CommandLanguage)) {
    throw new Error(`language must be one of: ${commandLanguages.join(", ")}.`);
  }

  return value as CommandLanguage;
};

const readCategoryIconKey = (value: unknown): CategoryIconKey | null => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string" || !categoryIconKeys.includes(value as CategoryIconKey)) {
    throw new Error(`iconKey must be one of: ${categoryIconKeys.join(", ")}.`);
  }

  return value as CategoryIconKey;
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("input must be an object.");
  }

  return value as Record<string, unknown>;
};
