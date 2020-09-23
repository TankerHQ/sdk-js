// @flow
import { fetch } from '@tanker/http-utils';

import { admindUrl, appdUrl, idToken, trustchaindUrl } from './config';

type stringToAnyMap = { [string]: any, ...};

export type Method = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';
export type Request = {| method: Method, path: string, query?: stringToAnyMap, headers?: stringToAnyMap, body?: stringToAnyMap |};

const stringify = (param: stringToAnyMap | string) => (
  typeof (param) === 'object'
    ? JSON.stringify(param)
    : param
);

const buildQuery = (params: stringToAnyMap = {}) => (
  Object.keys(params)
    .map(key => `${key}=${encodeURIComponent(stringify(params[key]))}`)
    .join('&')
);

const request = async (url: string, { method, path, query, headers = {}, body }: Request): Promise<stringToAnyMap> => {
  const response = await fetch(
    url + path + (query ? `?${buildQuery(query)}` : ''),
    {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }
  );

  const parsed = await response.json();

  if (parsed.error)
    throw new Error(parsed.error.code);

  return parsed;
};

export const requestAppd = async (req: Request): Promise<stringToAnyMap> => request(appdUrl, req);
export const requestAdmind = async (req: Request): Promise<stringToAnyMap> => request(admindUrl, req);
export const requestTrustchaind = async (req: Request): Promise<stringToAnyMap> => request(trustchaindUrl, req);

export const requestAdmindWithAuth = async (req: Request): Promise<stringToAnyMap> => requestAdmind({
  ...req,
  headers: { ...req.headers, Authorization: `Bearer ${idToken}` },
});
