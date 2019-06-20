// @flow

import { tcrypto } from '@tanker/crypto';

import { expect } from './chai';
import { toBase64 } from '../index';
import { KeyDecryptor } from '../Resource/KeyDecryptor';
import { preferredNature, NATURE_KIND } from '../Blocks/Nature';

const refDeviceId = new Uint8Array([0, 0, 7]);

class StorageStub {
  _keyPair;
  deviceId;
  privateEncryptionKey;
  constructor(deviceId, keyPair) {
    this._keyPair = keyPair;
    this.deviceId = deviceId;
    this.privateEncryptionKey = keyPair.privateKey;
  }

  getDevicePublicEncryptionKey = () => this._keyPair.publicKey;
  findUserKey = () => this._keyPair;
  findFull = () => ({
    encryptionKeyPair: this._keyPair
  });

  empty = () => {
    this.getDevicePublicEncryptionKey = () => null;
    this.findUserKey = () => null;
    this.findFull = () => null;
  }
}

function makeKeyPublish(nature, key) {
  return {
    recipient: refDeviceId,
    resourceId: refDeviceId,
    author: refDeviceId,
    nature,
    key
  };
}

describe('KeyDecryptor', () => {
  let keys;
  let decryptor: KeyDecryptor;
  let store: StorageStub;

  before(() => {
    const kp = tcrypto.makeEncryptionKeyPair();
    keys = {
      ...kp,
      expect: toBase64(kp.publicKey),
    };
  });

  beforeEach(() => {
    store = new StorageStub(refDeviceId, keys);
    // $FlowExpectedError
    decryptor = new KeyDecryptor(store, store, store);
  });

  it('can decrypt key published to user', async () => {
    const keyPublish = makeKeyPublish(
      preferredNature(NATURE_KIND.key_publish_to_user),
      tcrypto.sealEncrypt(keys.publicKey, keys.publicKey)
    );

    const res = await decryptor.keyFromKeyPublish(keyPublish);
    expect(res).to.be.a('Uint8Array');
    // $FlowExpectedError
    expect(toBase64(res)).to.be.equal(keys.expect);
  });

  it('can decrypt key published to group', async () => {
    const keyPublish = makeKeyPublish(
      preferredNature(NATURE_KIND.key_publish_to_user_group),
      tcrypto.sealEncrypt(keys.publicKey, keys.publicKey)
    );

    const res = await decryptor.keyFromKeyPublish(keyPublish);
    expect(res).to.be.a('Uint8Array');
    // $FlowExpectedError
    expect(toBase64(res)).to.be.equal(keys.expect);
  });

  it('can decrypt key published to device', async () => {
    const keyPublish = makeKeyPublish(
      preferredNature(NATURE_KIND.key_publish_to_device),
      tcrypto.asymEncrypt(
        keys.publicKey,
        keys.publicKey,
        keys.privateKey
      )
    );

    const res = await decryptor.keyFromKeyPublish(keyPublish);
    expect(res).to.be.a('Uint8Array');
    // $FlowExpectedError
    expect(toBase64(res)).to.be.equal(keys.expect);
  });

  it('returns null when not called with a key publish', async () => {
    // could use any value of NATURE_KIND but key_publish
    const keyPublish = makeKeyPublish(
      preferredNature(NATURE_KIND.trustchain_creation),
      new Uint8Array([0])
    );

    expect(await decryptor.keyFromKeyPublish(keyPublish)).to.be.null;
  });

  it('returns null when user key cannot be found', async () => {
    const keyPublish = makeKeyPublish(
      preferredNature(NATURE_KIND.key_publish_to_user),
      new Uint8Array([0])
    );
    store.empty();

    expect(await decryptor.keyFromKeyPublish(keyPublish)).to.be.null;
  });

  it('returns null when group key cannot be found', async () => {
    const keyPublish = makeKeyPublish(
      preferredNature(NATURE_KIND.key_publish_to_user_group),
      new Uint8Array([0])
    );
    store.empty();

    expect(await decryptor.keyFromKeyPublish(keyPublish)).to.be.null;
  });

  it('returns null when author device key cannot be found', async () => {
    const keyPublish = makeKeyPublish(
      preferredNature(NATURE_KIND.key_publish_to_device),
      new Uint8Array([0])
    );
    store.empty();

    expect(await decryptor.keyFromKeyPublish(keyPublish)).to.be.null;
  });

  it('returns null when deviceId does not match recipient', async () => {
    const keyPublish = makeKeyPublish(
      preferredNature(NATURE_KIND.key_publish_to_device),
      new Uint8Array([0])
    );

    store.deviceId = new Uint8Array([0]);

    expect(await decryptor.keyFromKeyPublish(keyPublish)).to.be.null;
  });

  it('returns null when deviceId is not set', async () => {
    const keyPublish = makeKeyPublish(
      preferredNature(NATURE_KIND.key_publish_to_device),
      new Uint8Array([0])
    );

    delete store.deviceId;

    expect(await decryptor.keyFromKeyPublish(keyPublish)).to.be.null;
  });
});
