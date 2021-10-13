import { Tanker } from '@tanker/client-browser';
import type { b64string } from '@tanker/core';
import { utils, generichash, random } from '@tanker/crypto';
import { createIdentity, getPublicIdentity } from '@tanker/identity';
import { AppHelper, makePrefix, appdUrl, managementSettings, oidcSettings, benchmarkSettings } from '@tanker/functional-tests';

import { _serializeIdentity } from '../../core/src/Identity';
import type { PublicPermanentIdentity } from '../../core/src/Identity';
import { before, after, benchmark } from './framework';

if (!appdUrl || !managementSettings || !oidcSettings) {
  throw new Error('Can\'t run benchmarks without TANKER_* environment variables');
}

const { appId: benchmarkAppId, appSecret: benchmarkAppSecret } = benchmarkSettings;

let appHelper: AppHelper;
let appId: b64string;

before(async () => {
  appHelper = await AppHelper.newApp();
  appId = utils.toBase64(appHelper.appId);
  await appHelper.set2FA();
});

after(async () => {
  await appHelper.cleanup();
});

const makeTanker = (appIdOverride?: string): Tanker => {
  const tanker = new Tanker({
    appId: appIdOverride || appId,
    dataStore: { prefix: makePrefix() },
    sdkType: 'js-benchmarks-tests-web',
    url: appdUrl,
  });

  return tanker;
};

// What: decode a base64 string
// PreCond: a valid base64 following rfc 4648 is initialised
// PostCond: no error is thrown
benchmark('fromBase64_10MB', (state) => {
  while (state.iter()) {
    state.pause();
    // generate huge base64 string
    let data = random(10000);
    while (data.length < 10 * 1000 * 1000) { // 10 MB
      data = utils.concatArrays(data, data);
    }
    const base64 = utils.toBase64(data);
    state.unpause();

    utils.fromBase64(base64);
  }
});

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

// What: starts and verifies an identity with a passphrase and asks for a session token
// PreCond: an identity was registered with another device
// PostCond: the session is open and we have a session token
benchmark('verifyIdentity_passphrase_withToken', async (state) => {
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
    const token = await tanker2.verifyIdentity({ passphrase: 'passphrase' }, { withSessionToken: true });
    if (!token)
      throw new Error("no session token received, this benchmark isn't benchmarking what we thought it would");
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
  const publicIdentity: PublicPermanentIdentity = {
    trustchain_id: appIdArg,
    target: 'user',
    value: utils.toBase64(obfuscateUserId(utils.fromBase64(appIdArg), n)),
  };
  return _serializeIdentity(publicIdentity);
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

// What: remove members from a group
// PreCond: a session is open and a group was created with members
// PostCond: members were removed from the group
function benchmarkRemoveGroupMembers(groupSize: number, toRemove: number) {
  benchmark(`updateGroupMembers_removeMembers_${groupSize}_${toRemove}`, async (state) => {
    const publicIdentitiesInGroup = [...Array(groupSize).keys()].map(n => makePublicIdentity(benchmarkAppId, n));
    const publicIdentitiesToRemove = publicIdentitiesInGroup.slice(0, toRemove);

    const tanker = makeTanker(benchmarkAppId);
    const identity = await createIdentity(benchmarkAppId, benchmarkAppSecret, Math.random().toString());
    await tanker.start(identity);
    const verificationKey = await tanker.generateVerificationKey();
    await tanker.registerIdentity({ verificationKey });

    const publicIdentitiesAndMe = [...publicIdentitiesInGroup, await getPublicIdentity(identity)];

    while (state.iter()) {
      state.pause();
      const groupId = await tanker.createGroup(publicIdentitiesAndMe);
      state.unpause();

      await tanker.updateGroupMembers(groupId, { usersToRemove: publicIdentitiesToRemove });
    }

    await tanker.stop();
  });
}

benchmarkRemoveGroupMembers(1, 1);
benchmarkRemoveGroupMembers(999, 999);
benchmarkRemoveGroupMembers(999, 1);

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

// What: shares a resource with a cached group
// PreCond: a session is open, a resource was encrypted and the group is in the
//  cache
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

benchmarkShareWithGroup('share_withGroup_4000', '8EySxOOyXktHkSOOgGAKCBRvIalV2iFObPGHk1QU63Q=');

benchmarkShareWithGroup('share_withGroupMultiAuthor_4000', 'rD3EO/d4S8dI20aybJUZcGiACV5kD298K8szq6ZWm0w=');

function benchmarkShareNoCacheWithGroup(benchmarkName: string, groupId: string) {
  benchmark(benchmarkName, async (state) => {
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

      await tanker.share([resourceId], { shareWithGroups: [groupId] });

      state.pause();
      await tanker.stop();
    }
  });
}

benchmarkShareNoCacheWithGroup('share_nocache_withGroup_4000', '8EySxOOyXktHkSOOgGAKCBRvIalV2iFObPGHk1QU63Q=');
