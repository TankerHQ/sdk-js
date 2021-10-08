import { fetch } from '@tanker/http-utils';

import { trustchaindUrl, managementSettings } from './config';

type StringToAnyMap = Record<string, any>;

export type Method = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';
export type Request = { method: Method; path: string; query?: StringToAnyMap; headers?: StringToAnyMap; body?: StringToAnyMap; };

const stringify = (param: StringToAnyMap | string) => (
  typeof param === 'object'
    ? JSON.stringify(param)
    : param
);

const buildQuery = (params: StringToAnyMap = {}) => (
  Object.keys(params)
    .map(key => `${key}=${encodeURIComponent(stringify(params[key]))}`)
    .join('&')
);

const request = async (url: string, { method, path, query, headers = {}, body }: Request): Promise<StringToAnyMap> => {
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

export const requestTrustchaind = async (req: Request): Promise<StringToAnyMap> => request(trustchaindUrl, req);
export const requestManagement = async (req: Request): Promise<StringToAnyMap> => request(managementSettings.url, {
  ...req,
  headers: { ...req.headers, Authorization: `Bearer ${managementSettings.accessToken}` },
});
