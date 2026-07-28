export type BucketCommandErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "DUPLICATE_CATEGORY"
  | "DUPLICATE_ALIAS"
  | "CATEGORY_IN_USE";

export class BucketCommandError extends Error {
  public readonly code: BucketCommandErrorCode;

  public constructor(code: BucketCommandErrorCode, message: string) {
    super(message);
    this.name = "BucketCommandError";
    this.code = code;
  }
}

export const validationError = (message: string): BucketCommandError =>
  new BucketCommandError("VALIDATION_ERROR", message);
