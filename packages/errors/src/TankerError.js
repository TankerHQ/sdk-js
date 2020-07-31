// @flow
import type { ErrorInfo } from './ErrorInfo';

export class TankerError extends Error {
  /*:: _message: string */
  /*:: apiCode: ?string */
  /*:: apiRoute: ?string */
  /*:: httpStatus: ?number */
  /*:: socketioTraceId: ?string */
  /*:: traceId: ?string */

  constructor(name: string = 'TankerError', errorInfo?: ErrorInfo) {
    super();
    this.name = name;

    if (typeof errorInfo === 'string') {
      this._message = errorInfo;
    } else if (errorInfo) {
      const { apiCode, apiRoute, httpStatus, message, traceId, socketioTraceId } = errorInfo;
      this._message = message || '';
      this.apiCode = apiCode;
      this.apiRoute = apiRoute;
      this.httpStatus = httpStatus;
      this.socketioTraceId = socketioTraceId;
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
      this.apiRoute && `api_route: "${this.apiRoute}"`,
      this.httpStatus && `http_status: ${this.httpStatus}`,
      this.socketioTraceId && `socketio_trace_id: "${this.socketioTraceId}"`,
      this.traceId && `trace_id: "${this.traceId}"`,
    ].filter(s => !!s).join(', ');
  }

  toString() {
    return `[Tanker] ${super.toString()}`;
  }
}
