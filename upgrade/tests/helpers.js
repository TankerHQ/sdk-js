// @flow

const fs = require('fs');
const path = require('path');

const context = JSON.parse(process.env.TRUSTCHAIN_CONTEXT || '{}');
const old = parseInt(process.env.OLD_SDK || '0', 10);


let TankerModule;

if (old) {
  TankerModule = require('@tanker/client-node'); // eslint-disable-line global-require
} else {
  TankerModule = require('../../packages/client-node'); // eslint-disable-line global-require
}

const { Tanker, fromBase64, toBase64 } = TankerModule;

const password = 'plop';


function makeTanker(prefix = 'default') {
  const dbPath = path.join('/tmp', `${prefix}${context.trustchain_id.replace(/[/\\]/g, '_')}/`);
  if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath);
  }
  const tanker = new Tanker({
    trustchainId: context.trustchain_id,
    url: context.trustchain_url,
    sdkType: 'test',
    // $FlowIKnow Adapter not needed for upgrade tests
    dataStore: {
      dbPath,
    },
  });
  tanker.on('unlockRequired', async () => {
    await tanker.unlockCurrentDevice({ password })
      .catch((e) => {
        console.error(e);
        process.exit(1);
      });
  });
  return tanker;
}

class User {
  _tanker: Tanker;
  _id: string;
  _token: string;

  constructor(tanker: Tanker, id: string, token: string) {
    this._tanker = tanker;
    this._id = id;
    this._token = token;
  }

  async open() {
    await this._tanker.open(this._id, this._token);
  }

  async create() {
    await this.open();
    if (!await this._tanker.hasRegisteredUnlockMethods()) {
      await this._tanker.registerUnlock({ password });
    }
  }

  async close() {
    await this._tanker.close();
  }

  async encrypt(message: string, userIds: Array<string>, groupIds: Array<string>) {
    return toBase64(await this._tanker.encrypt(message, { shareWithUsers: userIds, shareWithGroups: groupIds }));
  }

  async decrypt(encryptedData: string) {
    return this._tanker.decrypt(fromBase64(encryptedData));
  }

  async createGroup(ids: Array<string>) {
    return this._tanker.createGroup(ids);
  }

  get id() {
    return this._id;
  }
}

function makeBob() {
  const tanker = makeTanker(context.bob_id);
  return new User(tanker, context.bob_id, context.bob_token);
}

function makeBobPhone() {
  const tanker = makeTanker(`${context.bob_id}Phone`);
  return new User(tanker, context.bob_id, context.bob_token);
}

function makeAlice() {
  const tanker = makeTanker(context.alice_id);
  return new User(tanker, context.alice_id, context.alice_token);
}

function runner(oldMain: Function, currentMain: Function) {
  let main;
  if (old) {
    main = oldMain;
  } else {
    main = currentMain;
  }
  main()
    .then(() => process.exit(0))
    .catch(e => {
      console.error(e);
      process.exit(1);
    });
}

function assertMessage(expected: string, received: string) {
  if (received !== expected) {
    console.error(`expected: "${expected}", received: "${received}"`);
    process.exit(1);
  }
}

module.exports = {
  makeBob,
  makeBobPhone,
  makeAlice,
  runner,
  assertMessage,
};
