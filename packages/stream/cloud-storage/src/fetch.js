// @flow
import { NetworkError } from '@tanker/errors';
import fetchPonyfill from 'fetch-ponyfill';

const { fetch: baseFetch } = fetchPonyfill({ Promise });

const fetch = (...args: any) => baseFetch(...args).catch(err => {
  throw new NetworkError(err.toString());
});

export { fetch };
export default fetch;
