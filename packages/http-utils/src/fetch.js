// @flow
import { NetworkError } from '@tanker/errors';
import globalThis from '@tanker/global-this';
import fetchPonyfill from 'fetch-ponyfill';

// Use the window.fetch if available or the ponyfill otherwise (IE11, Node.js)
// See: https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/fetch#Browser_compatibility
let baseFetch;

if (globalThis.fetch && globalThis.Promise) {
  baseFetch = globalThis.fetch;
} else {
  baseFetch = fetchPonyfill({ Promise }).fetch;
}

const fetch = (input: RequestInfo, init?: RequestOptions): Promise<Response> => baseFetch(input, init).catch(err => {
  throw new NetworkError(err.toString());
});

export { fetch };
