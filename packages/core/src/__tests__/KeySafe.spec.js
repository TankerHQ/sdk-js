// @flow

import { createUserSecretBinary } from '@tanker/identity';

import { expect } from './chai';
import { deserializeKeySafe, generateKeySafe, serializeKeySafe } from '../Session/KeySafe';

describe('KeySafe', () => {
  let secret;
  let safe;

  beforeEach(() => {
    secret = createUserSecretBinary('trustchainid', 'user-id');
    safe = generateKeySafe(secret);
  });

  it('should create a new valid safe when asked to', () => {
    expect(safe.userSecret).to.deep.equal(secret);
    expect(safe.deviceId).to.equal(null);
    expect(safe.encryptionPair.privateKey).to.be.an.instanceof(Uint8Array);
    expect(safe.encryptionPair.publicKey).to.be.an.instanceof(Uint8Array);
    expect(safe.signaturePair.privateKey).to.be.an.instanceof(Uint8Array);
    expect(safe.signaturePair.publicKey).to.be.an.instanceof(Uint8Array);
    expect(safe.provisionalUserKeys).to.deep.equal({});
  });

  it('should be able to serialize / deserialize a safe', async () => {
    const serializedSafe = await serializeKeySafe(safe);
    const deserializedSafe = await deserializeKeySafe(serializedSafe, secret);
    expect(deserializedSafe).to.deep.equal(deserializedSafe);
  });
});
