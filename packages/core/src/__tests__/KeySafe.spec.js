// @flow

import { createUserSecretBinary } from '@tanker/identity';

import { expect } from './chai';

import KeySafe from '../Session/KeySafe';

describe('KeySafe', () => {
  let secret;
  let safe;

  beforeEach(() => {
    secret = createUserSecretBinary('trustchainid', 'user-id');
    safe = KeySafe.create(secret);
  });

  it('should create a new valid safe when asked to', () => {
    expect(safe).to.be.an.instanceof(KeySafe);
    expect(safe.userSecret).to.deep.equal(secret);
    expect(safe.deviceId).to.equal(null);
    expect(safe.encryptionPair).to.have.own.property('privateKey');
    expect(safe.encryptionPair).to.have.own.property('publicKey');
    expect(safe.signaturePair).to.have.own.property('privateKey');
    expect(safe.signaturePair).to.have.own.property('publicKey');
  });

  it('should be able to present itself as a plain object', () => {
    const obj = safe.asObject();
    expect(obj).to.not.be.an.instanceof(KeySafe);
    expect(obj).to.be.an('object');
    expect(obj.userSecret).to.deep.equal(safe.userSecret);
    expect(obj.deviceId).to.equal(safe.deviceId);
    expect(obj.encryptionPair).to.deep.equal(safe.encryptionPair);
    expect(obj.signaturePair).to.deep.equal(safe.signaturePair);
  });

  it('should be able to reopen a serialized safe', async () => {
    const serializedSafe = await safe.serialize();
    const safe2 = await KeySafe.open(secret, serializedSafe);
    expect(safe2.asObject()).to.deep.equal(safe.asObject());
  });
});
