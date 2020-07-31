// @flow
type Message = string;

type ApiError = {
    apiCode?: string,
    apiRoute?: string,
    httpStatus?: number,
    message?: string,
    socketioTraceId?: string,
    traceId?: string,
};

export type ErrorInfo = Message | ApiError;
