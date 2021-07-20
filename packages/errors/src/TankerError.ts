import type { ErrorInfo } from './ErrorInfo';

export class TankerError extends Error {
  declare _message?: string;
  declare apiCode?: string;
  declare apiMethod?: string;
  declare apiRoute?: string;
  declare httpStatus?: number;
  declare traceId?: string;

  constructor(name: string = 'TankerError', errorInfo?: ErrorInfo) {
    super();
    this.name = name;

    if (typeof errorInfo === 'string') {
      this._message = errorInfo;
    } else if (errorInfo) {
      const { apiCode, apiMethod, apiRoute, httpStatus, message, traceId } = errorInfo;
      this._message = message || '';
      this.apiCode = apiCode;
      this.apiMethod = apiMethod;
      this.apiRoute = apiRoute;
      this.httpStatus = httpStatus;
      this.traceId = traceId;
    }
  }

  set message(m: string) {
    this._message = m;
  }

  // Print every piece of information for `throw err` or `console.log(err)` to give useful information
  get message() {
    return [
      this._message,
      this.apiCode && `api_code: "${this.apiCode}"`,
      this.apiMethod && `api_method: "${this.apiMethod}"`,
      this.apiRoute && `api_route: "${this.apiRoute}"`,
      this.httpStatus && `http_status: ${this.httpStatus}`,
      this.traceId && `trace_id: "${this.traceId}"`,
    ].filter(s => !!s).join(', ');
  }

  toString() {
    return `[Tanker] ${super.toString()}`;
  }
}
