// @flow

import sinon from 'sinon';

import { tcrypto, utils, random } from '@tanker/crypto';

import { expect } from './chai';
import { InvalidArgument } from '../errors';
import { ResourceManager } from '../DataProtection/Resource/ResourceManager';

import TestGenerator from './TestGenerator';

import { serializeBlock } from '../Blocks/payloads';

class ClientStub {
  send = () => { };
}

class ResourceStoreStub {
  saveResourceKey = sinon.spy();
  findResourceKey = sinon.spy();
}

class KeyDecryptorStub {
  deviceReady = () => true;
  keyFromKeyPublish = (arg) => arg.key;
}

function makeManager() {
  const client = new ClientStub();
  const resourceStore = new ResourceStoreStub();
  const keyDecryptor = new KeyDecryptorStub();
  const localUser = { trustchainId: new Uint8Array(0) };

  // $FlowExpectedError
  const manager = new ResourceManager(resourceStore, client, keyDecryptor, localUser);
  return {
    client,
    resourceStore,
    keyDecryptor,
    manager
  };
}

describe('ResourceManager', () => {
  let testKeyPublish;

  before(async () => {
    const testGenerator = new TestGenerator();
    testGenerator.makeTrustchainCreation();
    const userId = random(tcrypto.HASH_SIZE);
    const userCreation = await testGenerator.makeUserCreation(userId);
    testKeyPublish = testGenerator.makeKeyPublishToUser(userCreation, userCreation.user);
  });

  describe('SaveResourceKey', () => {
    it('can save a resource key', async () => {
      const { resourceStore, manager } = makeManager();

      const id = new Uint8Array([0]);
      const key = new Uint8Array([1]);
      await manager.saveResourceKey(id, key);

      expect(resourceStore.saveResourceKey.withArgs(id, key).calledOnce).to.be.true;
    });
  });

  describe('FindKeyFromResourceId', () => {
    it('throws InvalidArgument after a single try when it cannot find the resource', async () => {
      const { client, resourceStore, manager } = makeManager();

      client.send = () => [];

      await expect(manager.findKeyFromResourceId(testKeyPublish.resourceId)).to.be.rejectedWith(InvalidArgument);
      expect(resourceStore.findResourceKey.calledOnce).to.be.true;
    });

    it('can find keys from ResourceStore', async () => {
      const { resourceStore, manager } = makeManager();

      resourceStore.findResourceKey = () => testKeyPublish.resourceKey;

      expect(await manager.findKeyFromResourceId(testKeyPublish.resourceId)).to.be.equal(testKeyPublish.resourceKey);
    });

    it('can find keys from Trustchain', async () => {
      const { client, resourceStore, manager, keyDecryptor } = makeManager();

      client.send = () => [utils.toBase64(serializeBlock(testKeyPublish.block))];
      keyDecryptor.keyFromKeyPublish = () => testKeyPublish.resourceKey;

      expect(await manager.findKeyFromResourceId(testKeyPublish.resourceId)).to.be.equal(testKeyPublish.resourceKey);
      expect(resourceStore.findResourceKey.calledOnce).to.be.true;
    });
  });
});
