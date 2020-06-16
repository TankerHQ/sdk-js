// @flow

import { createUserSecretBinary } from '@tanker/identity';
import { expect } from '@tanker/test-utils';

import { deserializeKeySafe, generateKeySafe, serializeKeySafe } from '../KeySafe';

describe('KeySafe', () => {
  let secret;
  let safe;

  beforeEach(() => {
    secret = createUserSecretBinary('trustchainid', 'user-id');
    safe = generateKeySafe();
  });

  it('should create a new valid safe when asked to', () => {
    expect(safe.deviceId).to.equal(null);
    expect(safe.deviceInitialized).to.equal(false);
    expect(safe.encryptionPair.privateKey).to.be.an.instanceof(Uint8Array);
    expect(safe.encryptionPair.publicKey).to.be.an.instanceof(Uint8Array);
    expect(safe.signaturePair.privateKey).to.be.an.instanceof(Uint8Array);
    expect(safe.signaturePair.publicKey).to.be.an.instanceof(Uint8Array);
    expect(safe.provisionalUserKeys).to.deep.equal({});
  });

  it('should be able to serialize / deserialize a safe', async () => {
    const serializedSafe = await serializeKeySafe(safe, secret);
    const deserializedSafe = await deserializeKeySafe(serializedSafe, secret);
    expect(deserializedSafe).to.deep.equal(deserializedSafe);
  });
});
