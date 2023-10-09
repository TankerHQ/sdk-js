import type { ErrorInfo } from './ErrorInfo';

export class TankerError extends Error {
  declare _message?: string;
  declare apiCode?: string;
  declare apiMethod?: string;
  declare apiRoute?: string;
  declare httpStatus?: number;
  declare next?: Error;
  declare traceId?: string;

  constructor(name: string = 'TankerError', errorInfo?: ErrorInfo) {
    super();

    // Set the prototype explicitly as advised here:
    // https://github.com/Microsoft/TypeScript-wiki/blob/main/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
    Object.setPrototypeOf(this, TankerError.prototype);
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

  // Hack around TS2340 preventing calls to setter and getter from super
  // see https://github.com/Microsoft/TypeScript/issues/338
  public setMessage(m: string) {
    this._message = m;
  }

  public getMessage(): string {
    return [
      this._message,
      this.apiCode && `api_code: "${this.apiCode}"`,
      this.apiMethod && `api_method: "${this.apiMethod}"`,
      this.apiRoute && `api_route: "${this.apiRoute}"`,
      this.httpStatus && `http_status: ${this.httpStatus}`,
      this.traceId && `trace_id: "${this.traceId}"`,
    ].filter(s => !!s).join(', ');
  }

  override set message(m: string) {
    this.setMessage(m);
  }

  override get message(): string {
    return this.getMessage();
  }

  override toString() {
    return `[Tanker] ${super.toString()}`;
  }
}
