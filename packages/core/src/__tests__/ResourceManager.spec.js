// @flow

import sinon from 'sinon';

import { expect } from './chai';
import { InvalidArgument } from '../errors';
import { ResourceManager } from '../Resource/ResourceManager';
import { preferredNature, NATURE_KIND } from '../Blocks/Nature';

class TrustchainStub {
  sync = sinon.spy();
  findKeyPublish = sinon.spy();
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
  const trustchain = new TrustchainStub();
  const resourceStore = new ResourceStoreStub();
  const keyDecryptor = new KeyDecryptorStub();

  // $FlowExpectedError
  const manager = new ResourceManager(resourceStore, trustchain, keyDecryptor);
  return {
    trustchain,
    resourceStore,
    keyDecryptor,
    manager
  };
}

describe('ResourceManager', () => {
  describe('SaveResourceKey', () => {
    it('can save Resource', async () => {
      const { resourceStore, manager } = makeManager();

      const id = new Uint8Array([0]);
      const key = new Uint8Array([1]);
      await manager.saveResourceKey(id, key);

      expect(resourceStore.saveResourceKey.withArgs(id, key).calledOnce).to.be.true;
    });
  });

  describe('FindKeyFromResourceId', () => {
    it('throws InvalidArgument after a single try when it cannot find the resource', async () => {
      const { trustchain, resourceStore, manager } = makeManager();

      const id = new Uint8Array([0]);

      await expect(manager.findKeyFromResourceId(id)).to.be.rejectedWith(InvalidArgument);
      expect(resourceStore.findResourceKey.calledOnce).to.be.true;
      expect(trustchain.findKeyPublish.calledOnce).to.be.true;
      expect(trustchain.sync.notCalled).to.be.true;
    });

    it('throws InvalidArgument on second try when it cannot find the resource and retry is one', async () => {
      const { trustchain, resourceStore, manager } = makeManager();

      const id = new Uint8Array([0]);

      await expect(manager.findKeyFromResourceId(id, true)).to.be.rejectedWith(InvalidArgument);
      expect(resourceStore.findResourceKey.calledTwice).to.be.true;
      expect(trustchain.findKeyPublish.calledTwice).to.be.true;
      expect(trustchain.sync.calledOnce).to.be.true;
    });

    it('can find keys from ResourceStore', async () => {
      const { resourceStore, manager } = makeManager();

      resourceStore.findResourceKey = (arg) => arg;

      const id = new Uint8Array([0]);

      expect(await manager.findKeyFromResourceId(id, true)).to.be.equal(id);
    });

    it('can find keys from Trustchain', async () => {
      const { trustchain, resourceStore, manager } = makeManager();

      trustchain.findKeyPublish = (arg) => arg;
      // $FlowExpectedError
      manager.extractAndSaveResourceKey = (arg) => arg;

      const id = new Uint8Array([0]);

      expect(await manager.findKeyFromResourceId(id, true)).to.be.equal(id);
      expect(resourceStore.findResourceKey.calledOnce).to.be.true;
    });
  });

  describe('ProcessKeyPublish', () => {
    const keyPublishEntry = {
      resourceId: new Uint8Array([0]),
      author: new Uint8Array([0]),
      key: new Uint8Array([0]),
      nature: preferredNature(NATURE_KIND.key_publish_to_device),
      recipient: new Uint8Array([0])
    };

    const internalError = new Error('Error thrown on purpose in unit tests');

    it('returns null if storage is not ready', async () => {
      const { keyDecryptor, manager } = makeManager();
      keyDecryptor.deviceReady = () => false;

      expect(await manager.extractAndSaveResourceKey(keyPublishEntry)).to.be.null;
    });

    it('extracts and saves resource key', async () => {
      const { resourceStore, manager } = makeManager();

      expect(await manager.extractAndSaveResourceKey(keyPublishEntry)).to.be.equal(keyPublishEntry.key);
      expect(resourceStore.saveResourceKey.calledOnce).to.be.true;
    });

    it('throws when saving resource failed', async () => {
      const { resourceStore, manager } = makeManager();
      resourceStore.saveResourceKey = () => { throw internalError; };

      await expect(manager.extractAndSaveResourceKey(keyPublishEntry)).to.be.rejected;
    });

    it('throws when key extraction failed', async () => {
      const { keyDecryptor, manager } = makeManager();
      keyDecryptor.keyFromKeyPublish = () => { throw internalError; };

      await expect(manager.extractAndSaveResourceKey(keyPublishEntry)).to.be.rejected;
    });
  });
});
