import { NetworkError } from '@tanker/errors';
import { globalThis } from '@tanker/global-this';
import fetchPonyfill from 'fetch-ponyfill';

// Use the window.fetch if available or the ponyfill otherwise (Node.js)
// See: https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/fetch#Browser_compatibility
let baseFetch: typeof globalThis.fetch;

if (globalThis.fetch && globalThis.Promise) {
  baseFetch = globalThis.fetch;
} else {
  baseFetch = fetchPonyfill({ Promise }).fetch;
}

const fetch = (input: RequestInfo, init?: RequestInit): Promise<Response> => baseFetch(input, { ...init, referrerPolicy: 'no-referrer' }).catch((err: Error) => {
  throw new NetworkError(err.toString(), err);
});

export { fetch };
