import { oidcSettings } from './config';

import { utils } from '@tanker/crypto';

export async function getGoogleIdToken(refreshToken: string): Promise<string> {
  const formData = JSON.stringify({
    client_id: oidcSettings.googleAuth.clientId,
    client_secret: oidcSettings.googleAuth.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const url = 'https://www.googleapis.com/oauth2/v4/token';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: formData,
  });

  if (!response.ok) {
    const description = `${response.status} ${response.statusText}: ${await response.text()}`;
    throw new Error(`Failed to get an ID token from ${url}:\n${description}`);
  }

  const data = await response.json();
  return data.id_token;
}

export function extractSubject(jwt: string): string {
  const b64body = jwt.split('.')[1]!;
  const body = utils.toString(utils.fromSafeBase64(b64body));
  return JSON.parse(body).sub;
}
