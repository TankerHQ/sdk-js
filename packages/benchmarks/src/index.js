// @flow

import { Tanker } from '@tanker/client-browser';
import { utils, generichash } from '@tanker/crypto';
import { createIdentity, getPublicIdentity } from '@tanker/identity';
import { AppHelper, makePrefix, admindUrl, appdUrl, idToken, oidcSettings, benchmarkSettings } from '@tanker/functional-tests';

import { before, after, benchmark } from './framework';

if (!admindUrl || !appdUrl || !idToken || !oidcSettings) {
  throw new Error('Can\'t run benchmarks without TANKER_* environment variables');
}

const { appId: benchmarkAppId, appSecret: benchmarkAppSecret } = benchmarkSettings;

let appHelper;
let appId;

before(async () => {
  appHelper = await AppHelper.newApp();
  appId = utils.toBase64(appHelper.appId);
});

after(async () => {
  await appHelper.cleanup();
});

const makeTanker = (appIdOverride: ?string): Tanker => {
  const tanker = new Tanker({
    appId: appIdOverride || appId,
    // $FlowIgnore adapter key is passed as a default option by @tanker/client-browser
    dataStore: { prefix: makePrefix() },
    sdkType: 'js-benchmarks-web',
    url: appdUrl,
  });

  return tanker;
};

// What: starts and registers an identity with a verification key
// PreCond: a core as been constructed
// PostCond: a session is open
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

// What: starts and registers an identity with a passphrase
// PreCond: a core as been constructed
// PostCond: a session is open
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

// What: starts an already registered device
// PreCond: an identity has been registered with this device
// PostCond: a session is open
benchmark('start_noVerification', async (state) => {
  const tanker = makeTanker();
  const identity = await appHelper.generateIdentity();
  await tanker.start(identity);
  const verificationKey = await tanker.generateVerificationKey();
  await tanker.registerIdentity({ verificationKey });
  await tanker.stop();

  while (state.iter()) {
    await tanker.start(identity);
    state.pause();
    await tanker.stop();
  }
});

// What: stops an open session
// PreCond: a session is open
// PostCond: the session is closed
benchmark('stop', async (state) => {
  const tanker = makeTanker();
  const identity = await appHelper.generateIdentity();
  await tanker.start(identity);
  const verificationKey = await tanker.generateVerificationKey();
  await tanker.registerIdentity({ verificationKey });
  await tanker.stop();

  while (state.iter()) {
    state.pause();
    await tanker.start(identity);
    await tanker.getDeviceList(); // force a session authentication
    state.unpause();
    await tanker.stop();
  }
});

// What: starts and verifies an identity with a verification key
// PreCond: an identity was registered with another device
// PostCond: the session is open
benchmark('verifyIdentity_verificationKey', async (state) => {
  const tanker = makeTanker();
  const identity = await appHelper.generateIdentity();
  await tanker.start(identity);
  const verificationKey = await tanker.generateVerificationKey();
  await tanker.registerIdentity({ verificationKey });
  await tanker.stop();

  while (state.iter()) {
    state.pause();
    const tanker2 = makeTanker();
    state.unpause();
    await tanker2.start(identity);
    await tanker2.verifyIdentity({ verificationKey });
    state.pause();
    await tanker2.stop();
  }
});

// What: starts and verifies an identity with a passphrase
// PreCond: an identity was registered with another device
// PostCond: the session is open
benchmark('verifyIdentity_passphrase', async (state) => {
  const tanker = makeTanker();
  const identity = await appHelper.generateIdentity();
  await tanker.start(identity);
  await tanker.registerIdentity({ passphrase: 'passphrase' });
  await tanker.stop();

  while (state.iter()) {
    state.pause();
    const tanker2 = makeTanker();
    state.unpause();
    await tanker2.start(identity);
    await tanker2.verifyIdentity({ passphrase: 'passphrase' });
    state.pause();
    await tanker2.stop();
  }
});

// What: encrypts data
// PreCond: a session is open
// PostCond: the buffer is encrypted
async function benchmarkEncrypt(size: number) {
  benchmark(`encrypt_${size}`, async (state) => {
    const tanker = makeTanker();
    const identity = await appHelper.generateIdentity();
    await tanker.start(identity);
    const verificationKey = await tanker.generateVerificationKey();
    await tanker.registerIdentity({ verificationKey });

    const clearData = new Uint8Array(size);

    while (state.iter()) {
      await tanker.encryptData(clearData);
    }

    await tanker.stop();
  });
}

benchmarkEncrypt(32);
benchmarkEncrypt(2 * 1024 * 1024);

function obfuscateUserId(appIdArg: Uint8Array, userId: number): Uint8Array {
  return generichash(utils.concatArrays(utils.fromString(userId.toString()), appIdArg));
}

function makePublicIdentity(appIdArg: string, n: number): string {
  const publicIdentity = {
    trustchainId: appIdArg,
    target: 'user',
    value: utils.toBase64(obfuscateUserId(utils.fromBase64(appIdArg), n)),
  };
  return utils.toB64Json(publicIdentity);
}

// What: creates a group
// PreCond: a session is open
// PostCond: a group is created
function benchmarkCreateGroupFor(count: number) {
  benchmark(`createGroup_${count}`, async (state) => {
    const publicIdentities = [...Array(count).keys()].map(n => makePublicIdentity(benchmarkAppId, n));

    const tanker = makeTanker(benchmarkAppId);
    const identity = await createIdentity(benchmarkAppId, benchmarkAppSecret, Math.random().toString());
    await tanker.start(identity);
    const verificationKey = await tanker.generateVerificationKey();
    await tanker.registerIdentity({ verificationKey });

    while (state.iter()) {
      await tanker.createGroup(publicIdentities);
    }

    await tanker.stop();
  });
}

benchmarkCreateGroupFor(1);
benchmarkCreateGroupFor(100);
benchmarkCreateGroupFor(1000);

// What: adds members to a group
// PreCond: a session is open and a group was created
// PostCond: members were added to the group
function benchmarkAddGroupMembersWith(count: number) {
  benchmark(`updateGroupMembers_addMembers_${count}`, async (state) => {
    const publicIdentities = [...Array(count).keys()].map(n => makePublicIdentity(benchmarkAppId, n));

    const tanker = makeTanker(benchmarkAppId);
    const identity = await createIdentity(benchmarkAppId, benchmarkAppSecret, Math.random().toString());
    await tanker.start(identity);
    const verificationKey = await tanker.generateVerificationKey();
    await tanker.registerIdentity({ verificationKey });

    while (state.iter()) {
      state.pause();
      const groupId = await tanker.createGroup([await getPublicIdentity(identity)]);
      state.unpause();

      await tanker.updateGroupMembers(groupId, { usersToAdd: publicIdentities });
    }

    await tanker.stop();
  });
}

benchmarkAddGroupMembersWith(1000);

// What: shares a resource with users
// PreCond: a session is open and a resource was encrypted
// PostCond: the resource is shared with the users
function benchmarkShareWithUsers(count: number) {
  benchmark(`share_withUsers_${count}`, async (state) => {
    const publicIdentities = [...Array(count).keys()].map(n => makePublicIdentity(benchmarkAppId, n));

    while (state.iter()) {
      state.pause();
      const tanker = makeTanker(benchmarkAppId);
      const identity = await createIdentity(benchmarkAppId, benchmarkAppSecret, Math.random().toString());
      await tanker.start(identity);
      const verificationKey = await tanker.generateVerificationKey();
      await tanker.registerIdentity({ verificationKey });

      const encryptedData = await tanker.encrypt('make some noise');
      const resourceId = await tanker.getResourceId(encryptedData);
      state.unpause();

      await tanker.share([resourceId], { shareWithUsers: publicIdentities });

      state.pause();
      await tanker.stop();
    }
  });
}

benchmarkShareWithUsers(1);
benchmarkShareWithUsers(100);

// What: shares a resource with groups
// PreCond: a session is open and a resource was encrypted
// PostCond: the resource is shared with the groups
function benchmarkShareWithGroup(benchmarkName: string, groupId: string) {
  benchmark(benchmarkName, async (state) => {
    const tanker = makeTanker(benchmarkAppId);
    const identity = await createIdentity(benchmarkAppId, benchmarkAppSecret, Math.random().toString());
    await tanker.start(identity);
    const verificationKey = await tanker.generateVerificationKey();
    await tanker.registerIdentity({ verificationKey });

    while (state.iter()) {
      state.pause();
      const encryptedData = await tanker.encrypt('make some noise');
      const resourceId = await tanker.getResourceId(encryptedData);
      state.unpause();

      await tanker.share([resourceId], { shareWithGroups: [groupId] });
    }

    await tanker.stop();
  });
}

benchmarkShareWithGroup('share_withGroup_1', '80ngpVLQ8cfglO5cC7I6a2Ph5QRfKPUVkXWOul5e6RM=');
benchmarkShareWithGroup('share_withGroup_100', 'XhMfSCnOhMlW/KSt5k33eD/FoGG09MRI/6JT8q/YDK0=');
benchmarkShareWithGroup('share_withGroup_1000', 'dzNO6xPpz9r2Wpe2Xxdl+9WiO6E/m8GVhv0RwvUcc0Q=');
benchmarkShareWithGroup('share_withGroup_4000', '/2fnEK7f7d82WECEvjvoC3T1DgFR0ZGMZkgJji33FwA=');

benchmarkShareWithGroup('share_withGroupMultiAuthor_100', 'n08iCwU+/QYAPKCqDBPD4dUK2oVyO1V3EwB3fo7Yz6U=');
benchmarkShareWithGroup('share_withGroupMultiAuthor_1000', 'XyR77EErpEZ+ZCAjLTOQzUrH5dfck6avsZPLvZ/Ebmc=');
benchmarkShareWithGroup('share_withGroupMultiAuthor_4000', 'rD3EO/d4S8dI20aybJUZcGiACV5kD298K8szq6ZWm0w=');
