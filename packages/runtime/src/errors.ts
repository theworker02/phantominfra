/** Structured errors for runtime + edge mapping. */
export type PhantomErrorCode =
  | "handler_timeout"
  | "handler_failed"
  | "unknown_route"
  | "commit_failed"
  | "policy_violation"
  | "invalid_state";

export class PhantomError extends Error {
  readonly code: PhantomErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: PhantomErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PhantomError";
    this.code = code;
    this.details = details;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details ?? null,
    };
  }
}

export function isPhantomError(err: unknown): err is PhantomError {
  return err instanceof PhantomError;
}
