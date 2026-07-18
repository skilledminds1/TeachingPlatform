export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PLAN_LIMIT_EXCEEDED"
  | "INTERNAL_ERROR";

export type ActionSuccess<T> = {
  success: true;
  data: T;
};

export type ActionFailure = {
  success: false;
  error: string;
  code: ErrorCode;
};

export type ActionResult<T> = ActionSuccess<T> | ActionFailure;

export function ok<T>(data: T): ActionSuccess<T> {
  return { success: true, data };
}

export function fail(error: string, code: ErrorCode = "INTERNAL_ERROR"): ActionFailure {
  return { success: false, error, code };
}
