import { fetch } from '@tanker/http-utils';

import { trustchaindUrl, managementSettings } from './config';

type stringToAnyMap = Record<string, any>;

export type Method = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';
export type Request = { method: Method; path: string; query?: stringToAnyMap; headers?: stringToAnyMap; body?: stringToAnyMap; };

const stringify = (param: stringToAnyMap | string) => (
  typeof param === 'object'
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
    },
  );

  const parsed = await response.json();

  if (parsed.error) {
    const { code, message } = parsed.error;
    throw new Error(`${code}: ${message}`);
  }

  return parsed;
};

export const requestTrustchaind = async (req: Request): Promise<stringToAnyMap> => request(trustchaindUrl, req);
export const requestManagement = async (req: Request): Promise<stringToAnyMap> => request(managementSettings.url, {
  ...req,
  headers: { ...req.headers, Authorization: `Bearer ${managementSettings.accessToken}` },
});
