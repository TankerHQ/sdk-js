// @flow
import EventEmitter from 'events';
import sinon from 'sinon';
import uuid from 'uuid';
import find from 'array-find';
import { tcrypto, utils, random, obfuscateUserId, createUserSecretB64, type b64string } from '@tanker/crypto';

import { expect } from '@tanker/chai';
import dataStoreConfig, { makePrefix } from './dataStoreConfig';
import { makeRootBlock } from './Helpers';

import { Tanker, TankerStatus, getResourceId } from '..';
import { CHALLENGE_PREFIX } from '../Session/ClientAuthenticator';
import PromiseWrapper from '../PromiseWrapper';
import { createUserToken } from '../Session/delegation';
import { serializeBlock, unserializeBlock, unserializePayload, type UserDeviceRecord, NATURE_KIND, natureKind, type Nature } from '../Blocks/payloads';
import { InvalidArgument, InvalidUserToken, InvalidSessionStatus, MissingEventHandler, InvalidUnlockKey, OperationCanceled } from '../errors';
import { generateUnlockKeyRegistration, DEVICE_TYPE } from '../Unlock/unlock';

// Status shortcuts
const { OPEN } = TankerStatus;

const trustchainKeyPair = tcrypto.makeSignKeyPair();
const userId = 'winnie';

let registeredUsers = [];
let registeredDevices = [];
let lastUserKey = {};
const subscribedSignatureKeys = [];

// copy paste from server-token
async function forgeServerToken(trustchainId: Uint8Array, trustchainPrivateKey: Uint8Array, serverId: string) {
  const userKeys = tcrypto.makeEncryptionKeyPair();
  const obfuscatedServerId = obfuscateUserId(trustchainId, serverId);

  const unlockKeyRegistration = await generateUnlockKeyRegistration({
    trustchainId,
    userId: obfuscatedServerId,
    userKeys,
    deviceType: DEVICE_TYPE.server_device,
    authorDevice: {
      id: trustchainId,
      privateSignatureKey: trustchainPrivateKey,
    }
  });
  const userSecretB64 = createUserSecretB64(utils.toBase64(trustchainId), serverId);
  const userToken = createUserToken(obfuscatedServerId, trustchainPrivateKey, userSecretB64);
  const ghostDevicePrivateEncryptionKey = utils.fromBase64(utils.fromB64Json(unlockKeyRegistration.unlockKey).privateEncryptionKey);
  const ghostDevicePublicEncryptionKey = tcrypto.getEncryptionKeyPairFromPrivateKey(ghostDevicePrivateEncryptionKey).publicKey;

  lastUserKey = {
    public_user_key: utils.toBase64(userKeys.publicKey),
    encrypted_private_user_key: utils.toBase64(tcrypto.sealEncrypt(userKeys.privateKey, ghostDevicePublicEncryptionKey))
  };

  return {
    block: unlockKeyRegistration.block,
    serverToken: utils.toB64Json({
      version: 1,
      type: 'serverToken',
      settings: {
        userToken,
        unlockKey: unlockKeyRegistration.unlockKey,
      },
    }),
  };
}

class SocketIoMock extends EventEmitter {
  pushedBlocks: Array<any>;
  blockIndex: number;
  connected: bool;

  constructor(rootBlock) {
    super();
    this.pushedBlocks = [rootBlock];
    this.blockIndex = 1;
    this.connected = false;
  }

  close = () => {};
  disconnect = () => {};
  emitSelf = (...args) => super.emit(...args);
  open = () => {
    this.connected = true;
    this.emitSelf('connect');
  };

  // $FlowIKnow emit() is moking socketIo (emit to the server) not EventEmitter (emit to self)
  emit = async (eventName, jdata, cb): Promise<any> => {
    try {
      if (!(eventName in this.serverResponses)) {
        throw new Error(`unhandled event ${eventName}`);
      }
      await this.serverResponses[eventName].call(this, jdata, cb);
    } catch (e) {
      console.error('emit failed:', e);
      throw e;
    }
  };

  serverResponses = {
    'get user status': async (jdata, cb) => {
      const data = JSON.parse(jdata);
      const userExist = registeredUsers.some(u => u.id === data.user_id);
      const json = {
        user_exists: userExist,
        device_exists: registeredDevices.indexOf(data.device_public_signature_key) !== -1,
        last_reset: utils.toBase64(new Uint8Array(tcrypto.HASH_SIZE)),
      };

      cb(JSON.stringify(json));
    },
    'get blocks': async (jdata, cb) => {
      const from = JSON.parse(jdata).index;
      cb(JSON.stringify(this.pushedBlocks.filter(b => b.index > from).map(serializeBlock).map(utils.toBase64)));
    },
    'get blocks 2': async (jdata, cb) => {
      const from = JSON.parse(jdata).index;
      cb(JSON.stringify(this.pushedBlocks.filter(b => b.index > from).map(serializeBlock).map(utils.toBase64)));
    },
    'push block': async (data: b64string, cb) => {
      // attribute an index
      const block = unserializeBlock(utils.fromBase64(data));
      this.blockIndex += 1;
      block.index = this.blockIndex;

      // emulate server sending the 'device created' signal after having
      // sent the 'subscribe to creation' signal to the server
      const nature: Nature = (block.nature: any);
      if (natureKind(nature) === NATURE_KIND.device_creation) {
        const payload: UserDeviceRecord = (unserializePayload(block): any);
        if (find(subscribedSignatureKeys, key => key === utils.toBase64(payload.public_signature_key))) {
          this.emitSelf('device created', null);
        }
      }
      this.pushedBlocks.push(block);
      // echo the block
      this.emitSelf('new block', utils.toBase64(serializeBlock(block)));
      // return
      cb('null');
    },
    'push keys': async (jdata, cb) => {
      for (const block of JSON.parse(jdata)) {
        this.serverResponses['push block'](block, (a) => a);
      }
      cb('null');
    },
    'request auth challenge': async (jdata, cb) => {
      cb(JSON.stringify({ challenge: `${CHALLENGE_PREFIX}test_session_id` }));
    },
    'authenticate device': async (jdata, cb) => {
      cb('null');
    },
    'subscribe to creation': async (jdata, cb) => {
      const signatureKeyB64 = JSON.parse(jdata).public_signature_key;
      subscribedSignatureKeys.push(signatureKeyB64);
      cb('null');
    },
    'last user key': async (jdata, cb) => {
      cb(JSON.stringify(lastUserKey));
    },
  };
}

describe('Tanker device addition', () => {
  let tanker;
  let userToken;

  beforeEach(async () => {
    // init tanker
    const rootBlock = makeRootBlock(trustchainKeyPair);
    const trustchainId = rootBlock.trustchain_id;
    const socket = new SocketIoMock(rootBlock);
    // user exists but new device
    socket.serverResponses['get user status'] = async (jdata, cb) => cb(JSON.stringify({ user_exists: true, device_exists: false, last_reset: '' }));
    tanker = new Tanker({
      trustchainId: utils.toBase64(trustchainId),
      socket,
      dataStore: { ...dataStoreConfig, prefix: makePrefix() },
    });

    // Create user token
    const obfuscatedUserId = obfuscateUserId(trustchainId, userId);
    const userSecretB64 = createUserSecretB64(utils.toBase64(trustchainId), userId);
    userToken = createUserToken(obfuscatedUserId, trustchainKeyPair.privateKey, userSecretB64);
  });

  afterEach(async () => {
    await tanker.close();
  });

  it('should not get out of open and emit the unlockRequired event', async () => {
    const eventPromise = new Promise(async (resolve, reject) => {
      tanker.on('unlockRequired', () => {
        // wait 50ms more to verify open() is blocking as expected
        setTimeout(resolve, 50);
      });
      await expect(tanker.open(userId, userToken)).to.be.rejectedWith(OperationCanceled);
      reject();
    });

    // new device
    await expect(eventPromise).to.be.fulfilled;
  });

  it('should throw if waitingForValidation event has no handler', async () => {
    // Oops, we forgot to listen on 'waitingForValidation'
    await expect(tanker.open(userId, userToken)).to.be.rejectedWith(MissingEventHandler);
  });
});

describe('Tanker #open', () => {
  describe('with userToken', () => {
    let userSecretB64;
    let userToken;
    let tanker;
    let socket;
    let trustchainId;
    let obfuscatedUserId;

    beforeEach(async () => {
      registeredUsers = [];
      registeredDevices = [];

      const rootBlock = makeRootBlock(trustchainKeyPair);
      trustchainId = rootBlock.trustchain_id;
      socket = new SocketIoMock(rootBlock);
      tanker = new Tanker({
        trustchainId: utils.toBase64(trustchainId),
        socket,
        dataStore: { ...dataStoreConfig, prefix: makePrefix() },
      });

      obfuscatedUserId = obfuscateUserId(trustchainId, userId);
      userSecretB64 = createUserSecretB64(utils.toBase64(trustchainId), userId);
      userToken = createUserToken(obfuscatedUserId, trustchainKeyPair.privateKey, userSecretB64);
    });

    afterEach(async () => {
      await tanker.close();
    });

    it('should add a new user', async () => {
      await tanker.open(userId, userToken);
      const extractedPayloads = socket.pushedBlocks.map(x => unserializePayload(x));

      expect(extractedPayloads).to.have.a.lengthOf(2);
      const userAddPayload: UserDeviceRecord = (extractedPayloads[1]: any);
      expect(userAddPayload.user_id).to.deep.equal(obfuscateUserId(trustchainId, userId));
    });

    it('should throw on server error', async () => {
      const err = { error: { status: 500, code: 'internal_error', message: 'No space left on device' } };
      socket.serverResponses['push block'] = (jdata, cb) => {
        cb(JSON.stringify(err));
      };
      const promise = tanker.open(userId, userToken);
      await expect(promise).to.be.rejectedWith(err);
    });

    it('should be able to open a session', async () => {
      await tanker.open(userId, userToken);

      registeredUsers.push({ id: utils.toBase64(obfuscatedUserId) });
      registeredDevices.push(utils.toBase64(tanker._session.storage.keyStore.publicSignatureKey)); // eslint-disable-line no-underscore-dangle
      await tanker.close();

      const tankerStatus = await tanker.open(userId, userToken);
      expect(tankerStatus).to.equal(OPEN);
    });

    it('should throw when token is not base64', async () => {
      await expect(tanker.open(userId, 'garbage')).to.be.rejected;
      // $FlowIKnow
      await expect(tanker.open(userId, null)).to.be.rejected;
    });

    it('should throw when secret is incorrect', async () => {
      await tanker.open(userId, userToken);
      await tanker.close();

      // empty
      let badSecret = '';
      userToken = createUserToken(obfuscatedUserId, trustchainKeyPair.privateKey, badSecret);
      let promise = tanker.open(userId, userToken);
      await expect(promise).to.be.rejectedWith(InvalidUserToken);

      // wrong size
      badSecret = utils.toBase64(random(tcrypto.USER_SECRET_SIZE - 1));
      userToken = createUserToken(obfuscatedUserId, trustchainKeyPair.privateKey, badSecret);
      promise = tanker.open(userId, userToken);
      await expect(promise).to.be.rejectedWith(InvalidUserToken);

      // does not match user
      badSecret = utils.toBase64(random(tcrypto.USER_SECRET_SIZE));
      userToken = createUserToken(obfuscatedUserId, trustchainKeyPair.privateKey, badSecret);
      promise = tanker.open(userId, userToken);
      await expect(promise).to.be.rejectedWith(InvalidUserToken);
    });

    describe('setupUnlock type check', () => {
      it('should throw on on invalid password type', async () => {
        await tanker.open(userId, userToken);
        // $FlowIKnow
        await expect(tanker.setupUnlock({ password: new Uint8Array(12) })).to.be.rejectedWith(InvalidArgument);
        // $FlowIKnow
        await expect(tanker.setupUnlock({ password: 12 })).to.be.rejectedWith(InvalidArgument);
      });

      it('should throw on on invalid email type', async () => {
        await tanker.open(userId, userToken);
        // $FlowIKnow
        await expect(tanker.setupUnlock({ email: new Uint8Array(12) })).to.be.rejectedWith(InvalidArgument);
      });
    });

    describe('updateUnlock type check', () => {
      it('should throw on on invalid password type', async () => {
        await tanker.open(userId, userToken);
        // $FlowIKnow
        await expect(tanker.updateUnlock({ password: 12 })).to.be.rejectedWith(InvalidArgument);
        // $FlowIKnow
        await expect(tanker.updateUnlock({ password: new Uint8Array(12) })).to.be.rejectedWith(InvalidArgument);
      });

      it('should throw on on invalid email type', async () => {
        await tanker.open(userId, userToken);
        // $FlowIKnow
        await expect(tanker.updateUnlock({ email: new Uint8Array(12) })).to.be.rejectedWith(InvalidArgument);
      });

      it('should throw on on invalid unlockKey type', async () => {
        await tanker.open(userId, userToken);
        // $FlowIKnow
        await expect(tanker.updateUnlock({ password: 'paf', email: 'pif', unlockKey: new Uint8Array(12) }))
          .to.be.rejectedWith(InvalidArgument);
      });
    });
  });

  describe('with serverToken', () => {
    let serverId;
    let serverTokenB64;
    let socket;
    let tanker;
    let trustchainId;

    beforeEach(async () => {
      const rootBlock = makeRootBlock(trustchainKeyPair);
      trustchainId = rootBlock.trustchain_id;
      serverId = uuid.v4();
      socket = new SocketIoMock(rootBlock);

      // WILL SET lastUserKey!!!
      const res = await forgeServerToken(trustchainId, trustchainKeyPair.privateKey, serverId);
      serverTokenB64 = res.serverToken; // eslint-disable-line prefer-destructuring
      await socket.emit('push block', utils.toBase64(serializeBlock(res.block)), (e) => {}); // eslint-disable-line no-unused-vars
      registeredUsers.push({ id: utils.toBase64(obfuscateUserId(trustchainId, serverId)) });

      tanker = new Tanker({
        trustchainId: utils.toBase64(trustchainId),
        socket,
        dataStore: { ...dataStoreConfig, prefix: makePrefix() },
      });
    });

    it('should open a session', async () => {
      await tanker.open(serverId, serverTokenB64);

      expect(tanker.status).to.equal(OPEN);
    });

    it('should throw when the unlock key is invalid', async () => {
      const token = utils.fromB64Json(serverTokenB64);
      token.settings.unlockKey = 'AAA=';
      const fakeToken = utils.toB64Json(token);

      await expect(tanker.open(serverId, fakeToken)).to.be.rejectedWith(InvalidUnlockKey);
    });
  });

  describe('server session', () => {
    let randomUserId;
    let obfuscatedUserId;
    let userToken;
    let tanker;
    let socket;

    const initTanker = async () => {
      const rootBlock = makeRootBlock(trustchainKeyPair);
      const trustchainId = rootBlock.trustchain_id;
      socket = new SocketIoMock(rootBlock);
      tanker = new Tanker({
        trustchainId: utils.toBase64(trustchainId),
        socket,
        dataStore: { ...dataStoreConfig, prefix: makePrefix() },
      });

      randomUserId = uuid.v4();
      obfuscatedUserId = obfuscateUserId(trustchainId, randomUserId);
      const userSecretB64 = createUserSecretB64(utils.toBase64(trustchainId), randomUserId);
      userToken = createUserToken(obfuscatedUserId, trustchainKeyPair.privateKey, userSecretB64);
    };

    const testSessionOpens = () => it('should authenticate with the server', async () => {
      const authenticateDevice = sinon.spy();
      socket.serverResponses['authenticate device'] = (jdata, cb) => {
        authenticateDevice();
        cb('null');
      };
      await tanker.open(randomUserId, userToken);

      expect(authenticateDevice.calledOnce).to.be.true;
    });

    const testSessionReopens = () => it('should re-authenticate with the server after reconnecting', async () => {
      await tanker.open(randomUserId, userToken);

      const pw = new PromiseWrapper();
      const reAuthenticateDevice = sinon.spy();

      socket.serverResponses['authenticate device'] = (jdata, cb) => {
        reAuthenticateDevice();
        cb('null');
        setTimeout(() => { pw.resolve(); }, 500);
      };

      setTimeout(() => !pw.settled && pw.reject(new Error('test failed')), 1000);

      socket.emitSelf('reconnect');
      await expect(pw.promise).to.be.fulfilled;
      expect(reAuthenticateDevice.calledOnce).to.be.true;
    });

    describe('new device', () => {
      beforeEach(initTanker);
      afterEach(() => tanker.close());
      testSessionOpens();
      testSessionReopens();
    });

    describe('already existing device', () => {
      beforeEach(async () => {
        await initTanker();
        await tanker.open(randomUserId, userToken);
        registeredUsers = [{ id: utils.toBase64(obfuscatedUserId) }];
        registeredDevices = [utils.toBase64(tanker._session.storage.keyStore.publicSignatureKey)]; // eslint-disable-line no-underscore-dangle
        await tanker.close();
      });
      afterEach(() => tanker.close());
      testSessionOpens();
      testSessionReopens();
    });
  });
});

describe('Tanker closed session', () => {
  let socket;
  let trustchainId;
  let tanker;

  beforeEach(async () => {
    const rootBlock = makeRootBlock(trustchainKeyPair);
    trustchainId = rootBlock.trustchain_id;
    socket = new SocketIoMock(rootBlock);
    tanker = new Tanker({
      trustchainId: utils.toBase64(trustchainId),
      socket,
      dataStore: { ...dataStoreConfig, prefix: makePrefix() },
    });
  });

  it('should not allow to accept a device', async () => {
    await expect(tanker.acceptDevice('V1d0ak5XTXdlRVJSYmxacFRURktkbGxXWXpGaWEyeElZVWQ0YW1KV1ZUaz0=')).to.be.rejectedWith(InvalidSessionStatus);
  });

  it('should not allow to encrypt/decrypt', async () => {
    await expect(tanker.encrypt('data')).to.be.rejectedWith(InvalidSessionStatus);
    await expect(tanker.decrypt(random(100))).to.be.rejectedWith(InvalidSessionStatus);
  });

  it('should not allow to create a ChunkedEncryptor', async () => {
    await expect(tanker.makeChunkEncryptor()).to.be.rejectedWith(InvalidSessionStatus);
  });

  it('should not allow anything while closing', async () => {
    const obfuscatedUserId = obfuscateUserId(trustchainId, userId);
    const userSecretB64 = createUserSecretB64(utils.toBase64(trustchainId), userId);
    const userToken = createUserToken(obfuscatedUserId, trustchainKeyPair.privateKey, userSecretB64);

    // Open a regular session (which will populate the datastores) and close it right away
    socket.serverResponses['get user status'] = async (jdata, cb) => cb(JSON.stringify({ user_exists: false, device_exists: false, last_reset: '' }));
    await tanker.open(userId, userToken);
    socket.serverResponses['get user status'] = async (jdata, cb) => cb(JSON.stringify({ user_exists: true, device_exists: true, last_reset: '' }));

    const eventuallyClosedSession = new Promise(resolve => tanker.on('sessionClosed', resolve));

    /* no await */ tanker.close();
    await expect(tanker.acceptDevice('V1d0ak5XTXdlRVJSYmxacFRURktkbGxXWXpGaWEyeElZVWQ0YW1KV1ZUaz0=')).to.be.rejectedWith(InvalidSessionStatus);
    await expect(tanker.encrypt('data')).to.be.rejectedWith(InvalidSessionStatus);
    await expect(tanker.decrypt(random(100))).to.be.rejectedWith(InvalidSessionStatus);
    await expect(tanker.makeChunkEncryptor()).to.be.rejectedWith(InvalidSessionStatus);
    await eventuallyClosedSession;
  });
});

describe('Tanker', () => {
  describe('constructor', () => {
    it('should throw with bad config argument', () => {
      [
        // wrong types of options
        undefined,
        null,
        'paf',
        ['a', 'b'],
        // invalid trustchainId
        {},
        { trustchainId: undefined },
        { trustchainId: new Uint8Array(32) },
        // missing dataStore
        { trustchainId: 'ok' },
        // missing adapter
        { trustchainId: 'ok', dataStore: {} },
        // wrong adapter type
        { trustchainId: 'ok', dataStore: { adapter: 'not a function' } },
      ].forEach(invalidOptions => {
        // $FlowExpectedError
        expect(() => { new Tanker(invalidOptions); }).to.throw(/options/); // eslint-disable-line no-new
      });

      expect(() => new Tanker({ trustchainId: 'ok', dataStore: { ...dataStoreConfig, prefix: makePrefix() } })).not.to.throw;
    });

    it('should have configurable defaults', () => {
      const dataStore = { ...dataStoreConfig, prefix: makePrefix() };
      const TankerA = Tanker.defaults({ trustchainId: 'trustchainA', url: 'http://default.io', dataStore });
      // $FlowExpectedError
      let tankerA = new TankerA({});

      // check types
      expect(tankerA instanceof TankerA).to.be.true;
      expect(tankerA instanceof Tanker).to.be.true;

      // check defaults applied
      expect(tankerA.options.trustchainId).to.equal('trustchainA');
      expect(tankerA.options.url).to.equal('http://default.io');

      // check defaults overriden by new options
      tankerA = new TankerA({ trustchainId: 'other', url: 'http://modified.io' });
      expect(tankerA.options.trustchainId).to.equal('other');
      expect(tankerA.options.url).to.equal('http://modified.io');

      // check no defaults from TankerA applied if using Tanker constructor
      const tanker = new Tanker({ trustchainId: 'another', dataStore });
      expect(tanker.options.trustchainId).to.equal('another');
      expect(tanker.options.url).to.not.equal('http://default.io');
      expect(tanker.options.url).to.not.equal('http://modified.io');
    });

    it('should have chainable defaults', () => {
      const dataStore = { ...dataStoreConfig, prefix: makePrefix() };
      const TankerB = Tanker.defaults({ trustchainId: 'trustchainA', url: 'http://default.io' })
                            .defaults({ trustchainId: 'trustchainB', dataStore }); // eslint-disable-line indent
      // $FlowExpectedError
      const tankerB = new TankerB({});
      expect(tankerB.options.url).to.equal('http://default.io');
      expect(tankerB.options.trustchainId).to.equal('trustchainB');
    });
  });

  describe('instance', () => {
    let tanker;

    beforeEach(() => {
      const dataStore = { ...dataStoreConfig, prefix: makePrefix() };
      tanker = new Tanker({ trustchainId: 'nevermind', dataStore });
    });

    it('should have numeric status constants matching TankerStatus', () => {
      const statuses = ['CLOSED', 'CLOSING', 'UNLOCK_REQUIRED', 'OPEN', 'OPENING', 'USER_CREATION'];
      for (const status of statuses) {
        // $FlowIKnow
        expect(typeof tanker[status]).to.equal('number');
        // $FlowIKnow
        expect(tanker[status]).to.equal(TankerStatus[status]);
      }
    });

    it('should throw when getResourceId() is given an invalid argument', async () => {
      const notUint8ArrayTypes = [undefined, null, 0, {}, [], 'wat'];
      // $FlowExpectedError
      notUint8ArrayTypes.forEach(fail => expect(() => tanker.getResourceId(fail)).to.throw(InvalidArgument));
    });
  });

  describe('deprecated getResourceId() util', () => {
    it('should throw when given an invalid type', async () => {
      const notUint8ArrayTypes = [undefined, null, 0, {}, [], 'wat'];
      // $FlowExpectedError
      notUint8ArrayTypes.forEach(fail => expect(() => getResourceId(fail)).to.throw(InvalidArgument));
    });
  });
});
