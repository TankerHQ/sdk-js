import { NetworkError } from '@tanker/errors';
import globalThis from '@tanker/global-this';
import fetchPonyfill from 'fetch-ponyfill';

// Use the window.fetch if available or the ponyfill otherwise (IE11, Node.js)
// See: https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/fetch#Browser_compatibility
let baseFetch: typeof globalThis.fetch;

if (globalThis.fetch && globalThis.Promise) {
  baseFetch = globalThis.fetch;
} else {
  baseFetch = fetchPonyfill({ Promise }).fetch;
}

// We never want to send the Referer header to the Tanker servers, but it's not always possible:
//
//   * On modern browsers, we use the referrerPolicy option for that purpose
//   * On browsers supporting fetch but not the referrerPolicy option (e.g. Firefox >= 39 < 52),
//     we use the referrer option to set the Referer header to the empty string
//   * On older browsers (e.g. IE11, FF < 39...), it is not possible to prevent the sending of
//     the Referer header, nor to override it. On these browsers, we use the fetch ponyfill,
//     based on XHR, which does not support overriding the Referer header
//     (see: https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_header_name)
//
const stripReferrer = (init?: RequestInit): RequestInit => ({ ...init, referrer: '', referrerPolicy: 'no-referrer' });

const fetch = (input: RequestInfo, init?: RequestInit): Promise<Response> => baseFetch(input, stripReferrer(init)).catch((err: Error) => {
  throw new NetworkError(err.toString());
});

export { fetch };
