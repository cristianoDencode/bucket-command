import { shellTargets, type ShellTarget } from "./types.js";
import { validationError } from "./errors.js";

export const normalizeKey = (value: string): string => value.trim().toLocaleLowerCase();

export const requiredText = (value: string, field: string): string => {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw validationError(`${field} is required.`);
  }

  return trimmed;
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

export const assertShellTarget = (value: ShellTarget): ShellTarget => {
  if (!shellTargets.includes(value)) {
    throw validationError("shellTarget must be bash, powershell or other.");
  }

  return value;
};
