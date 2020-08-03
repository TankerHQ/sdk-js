// @flow
import { NetworkError } from '@tanker/errors';
import fetchPonyfill from 'fetch-ponyfill';

const { fetch: baseFetch } = fetchPonyfill({ Promise });

const fetch = (input: RequestInfo, init?: RequestOptions): Promise<Response> => baseFetch(input, init).catch(err => {
  throw new NetworkError(err.toString());
});

export { fetch };
