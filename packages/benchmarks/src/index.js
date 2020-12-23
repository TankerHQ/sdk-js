// @flow

import { Tanker } from '@tanker/client-browser';
import { utils } from '@tanker/crypto';
import { AppHelper, makePrefix, admindUrl, appdUrl, idToken, oidcSettings } from '@tanker/functional-tests';

import { before, after, benchmark } from './framework';

if (!admindUrl || !appdUrl || !idToken || !oidcSettings) {
  throw new Error('Can\'t run benchmarks without TANKER_* environment variables');
}

let appHelper;
let appId;

before(async () => {
  appHelper = await AppHelper.newApp();
  appId = utils.toBase64(appHelper.appId);
});

after(async () => {
  await appHelper.cleanup();
});

const makeTanker = (): Tanker => {
  const tanker = new Tanker({
    appId,
    // $FlowIgnore adapter key is passed as a default option by @tanker/client-browser
    dataStore: { prefix: makePrefix() },
    sdkType: 'js-benchmarks-web',
    url: appdUrl,
  });

  return tanker;
};

benchmark('registerIdentity_verificationKey', async (state) => {
  while (state.iter()) {
    state.pause();
    const tanker = makeTanker();
    const identity = await appHelper.generateIdentity();
    state.unpause();
    await tanker.start(identity);
    const verificationKey = await tanker.generateVerificationKey();
    await tanker.registerIdentity({ verificationKey });
    state.pause();
    await tanker.stop();
  }
});

benchmark('registerIdentity_passphrase', async (state) => {
  while (state.iter()) {
    state.pause();
    const tanker = makeTanker();
    const identity = await appHelper.generateIdentity();
    state.unpause();
    await tanker.start(identity);
    await tanker.registerIdentity({ passphrase: 'passphrase' });
    state.pause();
    await tanker.stop();
  }
});

benchmark('encrypt_smallString', async (state) => {
  const tanker = makeTanker();
  const identity = await appHelper.generateIdentity();
  await tanker.start(identity);
  const verificationKey = await tanker.generateVerificationKey();
  await tanker.registerIdentity({ verificationKey });

  while (state.iter()) {
    await tanker.encrypt('keep your secrets safe, with tanker™');
  }

  await tanker.stop();
});

benchmark('encrypt_2MBString', async (state) => {
  const tanker = makeTanker();
  const identity = await appHelper.generateIdentity();
  await tanker.start(identity);
  const verificationKey = await tanker.generateVerificationKey();
  await tanker.registerIdentity({ verificationKey });
  const str32B = 'this str might be 32 bytes long!';
  const str2MB = str32B.repeat(2 * 1024 * 1024 / str32B.length);

  while (state.iter()) {
    await tanker.encrypt(str2MB);
  }

  await tanker.stop();
});
