// @flow
export type ErrorMessage = string;

export type ApiError = {
    apiCode?: string,
    apiRoute?: string,
    httpStatus?: number,
    message?: string,
    socketioTraceId?: string,
    traceId?: string,
};

export type ErrorInfo = ErrorMessage | ApiError;
