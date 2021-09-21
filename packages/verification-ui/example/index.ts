/* eslint-disable import/no-extraneous-dependencies */
import { Tanker } from '@tanker/client-browser';
import { createIdentity, createProvisionalIdentity } from '@tanker/identity';
import { uuid } from '@tanker/test-utils';
/* eslint-enable */

import VerificationUI from '../src';

export const getURIParameter = (name: string): string | null => {
  const paramSource = window.location.search || window.location.hash;
  const paramRegExp = new RegExp(`[?|&|#]${name}=([^&;]+?)(&|#|;|$)`);
  const extracted = (paramRegExp.exec(paramSource) || [undefined, ''])[1];
  return decodeURIComponent(extracted) || null;
};

const appId = getURIParameter('appId');
const appSecret = getURIParameter('appSecret');
const url = getURIParameter('url') || 'https://api.tanker.io';
const email = getURIParameter('email');
const userId = uuid.v4();

if (!appId || !appSecret || !email) {
  const message = `You must run the example app from the following url: ${window.location.origin}?<b>appId</b>=appId&<b>appSecret</b>=appSecret&<b>email</b>=email, where <b>appId</b> and <b>appSecret</b> are a Tanker app ID and secret as obtained when creating an app in <a href="https://dashboard.tanker.io">the dashboard</a>, and <b>email</b> is a valid email address that will be used in this example to send verification emails to.`;

  const container = document.getElementById('root');
  if (container) {
    container.innerHTML = message;
    container.style.cssText = 'font-family: "Trebuchet MS", Helvetica, sans-serif; line-height: 1.5';
  }

  throw new Error(message);
}

createIdentity(appId, appSecret, userId).then(async identity => {
  const provisionalIdentity = await createProvisionalIdentity(appId, 'email', email);
  const tanker = new Tanker({ appId, url });
  const verificationUI = new VerificationUI(tanker);
  await verificationUI.start(email, identity, provisionalIdentity);
});