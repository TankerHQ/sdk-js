export type ErrorMessage = string;
export type ApiError = {
  apiCode?: string | undefined;
  apiMethod?: string | undefined;
  apiRoute?: string | undefined;
  httpStatus?: number | undefined;
  message?: string | undefined;
  traceId?: string | undefined;
};
export type ErrorInfo = ErrorMessage | ApiError;
