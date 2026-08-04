import { categoryIconKeys, commandLanguages, maxCategoryNameLength, maxTitleLength, type CategoryIconKey, type CommandLanguage } from "./types.js";
import { validationError } from "./errors.js";

export const normalizeKey = (value: string): string => value.trim().toLocaleLowerCase();

export const requiredText = (value: string, field: string): string => {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw validationError(`${field} is required.`);
  }

  return trimmed;
};

export const requiredCategoryName = (value: string): string => {
  const name = requiredText(value, "category name");

  if (name.length > maxCategoryNameLength) {
    throw validationError(`category name must be ${maxCategoryNameLength} characters or fewer.`);
  }

  return name;
};

export const requiredTitle = (value: string): string => {
  const title = requiredText(value, "title");

  if (title.length > maxTitleLength) {
    throw validationError(`title must be ${maxTitleLength} characters or fewer.`);
  }

  return title;
};

export const requiredContent = (value: string): string => {
  if (value.trim().length === 0) {
    throw validationError("content is required.");
  }

  return value;
};

export const optionalAlias = (value: string | null | undefined): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (value.trim().length === 0) {
    throw validationError("alias cannot be empty when provided.");
  }

  return value.trim();
};

export const optionalNote = (value: string | null | undefined): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  return value;
};

export const optionalTitle = (value: string | null | undefined): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.length > maxTitleLength) {
    throw validationError(`title must be ${maxTitleLength} characters or fewer.`);
  }

  return trimmed;
};

export const assertLanguage = (value: CommandLanguage): CommandLanguage => {
  if (!commandLanguages.includes(value)) {
    throw validationError(`language must be one of: ${commandLanguages.join(", ")}.`);
  }

  return value;
};

export const optionalCategoryIconKey = (value: CategoryIconKey | null | undefined): CategoryIconKey | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (!categoryIconKeys.includes(value)) {
    throw validationError(`category icon must be one of: ${categoryIconKeys.join(", ")}.`);
  }

  return value;
};
