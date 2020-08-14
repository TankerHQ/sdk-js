// @flow
export type ErrorMessage = string;

export type ApiError = {
    apiCode?: string,
    apiMethod?: string,
    apiRoute?: string,
    httpStatus?: number,
    message?: string,
    traceId?: string,
};

export type ErrorInfo = ErrorMessage | ApiError;
