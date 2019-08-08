// @flow

import { tcrypto } from '@tanker/crypto';

import { expect } from './chai';
import { toBase64 } from '../index';
import { KeyDecryptor } from '../DataProtection/Resource/KeyDecryptor';
import { InvalidArgument, DecryptionFailed } from '../errors';

import GroupManager from '../Groups/Manager';
import LocalUser from '../Session/LocalUser';

import { type KeyPublish, type KeyPublishNature, KeyPublishNatures } from '../DataProtection/Resource/keyPublish';

const refDeviceId = new Uint8Array([0, 0, 7]);

class LocalUserStub {
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

  empty = () => {
    this.getDevicePublicEncryptionKey = () => null;
    this.findUserKey = () => null;
  }
}

function makeKeyPublish(nature: KeyPublishNature, key): KeyPublish {
  return {
    recipient: refDeviceId,
    resourceId: refDeviceId,
    nature,
    key
  };
}

describe('KeyDecryptor', () => {
  let keys;
  let decryptor: KeyDecryptor;
  let localUser: LocalUserStub;
  let groupManager;

  before(() => {
    const kp = tcrypto.makeEncryptionKeyPair();
    keys = {
      ...kp,
      expect: toBase64(kp.publicKey),
    };
  });

  beforeEach(() => {
    localUser = new LocalUserStub(refDeviceId, keys);
    const castedLocalUser = ((localUser: any): LocalUser);

    groupManager = { getGroupEncryptionKeyPair: () => null };
    const castedGroupManager = ((groupManager: any): GroupManager);

    decryptor = new KeyDecryptor(castedLocalUser, castedGroupManager);
  });

  it('can decrypt key published to user', async () => {
    const keyPublish = makeKeyPublish(
      KeyPublishNatures.key_publish_to_user,
      tcrypto.sealEncrypt(keys.publicKey, keys.publicKey)
    );

    const res = await decryptor.keyFromKeyPublish(keyPublish);
    expect(res).to.be.a('Uint8Array');
    expect(toBase64(res)).to.be.equal(keys.expect);
  });

  it('can decrypt key published to group', async () => {
    const keyPublish = makeKeyPublish(
      KeyPublishNatures.key_publish_to_user_group,
      tcrypto.sealEncrypt(keys.publicKey, keys.publicKey)
    );

    groupManager.getGroupEncryptionKeyPair = () => keys;

    const res = await decryptor.keyFromKeyPublish(keyPublish);
    expect(res).to.be.a('Uint8Array');
    expect(toBase64(res)).to.be.equal(keys.expect);
  });

  it('throws when not called with a key publish', async () => {
    const badKeyPublish = (({ nature: 42 }: any): KeyPublish);

    await expect(decryptor.keyFromKeyPublish(badKeyPublish)).to.be.rejectedWith(InvalidArgument);
  });

  it('throws when user key cannot be found', async () => {
    const keyPublish = makeKeyPublish(
      KeyPublishNatures.key_publish_to_user,
      new Uint8Array([0])
    );
    localUser.empty();

    await expect(decryptor.keyFromKeyPublish(keyPublish)).to.be.rejectedWith(DecryptionFailed);
  });

  it('throws when group key cannot be found', async () => {
    const keyPublish = makeKeyPublish(
      KeyPublishNatures.key_publish_to_user_group,
      new Uint8Array([0])
    );
    localUser.empty();

    await expect(decryptor.keyFromKeyPublish(keyPublish)).to.be.rejectedWith(DecryptionFailed);
  });
});
