import { random, ready as cryptoReady, tcrypto, utils } from '@tanker/crypto';
import { createUserSecretBinary } from '@tanker/identity';
import { expect, sinon } from '@tanker/test-utils';

import dataStoreConfig, { makePrefix, openDataStore } from '../../__tests__/TestDataStore';

import { TransparentSessionStore } from '../SessionStore';
import { computeRecipientHash } from '../Manager';

const makeSession = () => ({
  id: random(tcrypto.SESSION_ID_SIZE),
  key: random(tcrypto.SYMMETRIC_KEY_SIZE),
});

describe('TransparentSessionStore', () => {
  let stub: sinon.SinonStub | null = null;
  let sessionStore: TransparentSessionStore;
  let hash: Uint8Array;

  before(() => cryptoReady);

  afterEach(() => {
    if (stub !== null)
      stub.restore();
    stub = null;
  });

  beforeEach(async () => {
    const dbName = `sessionStore-test-${makePrefix()}`;
    const userSecret = createUserSecretBinary('trustchainid', 'Merkle–Damgård');
    const sessionStoreConfig = { dbName, ...dataStoreConfig, schemas: TransparentSessionStore.schemas };
    const datastore = await openDataStore(sessionStoreConfig);
    sessionStore = await TransparentSessionStore.open(datastore, userSecret);
    hash = random(32);
  });

  it('saves and finds session keys', async () => {
    const session = makeSession();

    await sessionStore.saveSessionKey(hash, session.id, session.key);

    expect(await sessionStore.findSessionKey(hash)).to.deep.equal(session);
  });

  it('overrides session', async () => {
    let session = makeSession();

    await sessionStore.saveSessionKey(hash, session.id, session.key);

    session = makeSession();
    await sessionStore.saveSessionKey(hash, session.id, session.key);

    expect(await sessionStore.findSessionKey(hash)).to.deep.equal(session);
  });

  it('does not find outdated session keys', async () => {
    const nowStub = sinon.stub(sessionStore, 'now');
    stub = nowStub;
    nowStub.returns(new Date('2022-01-01T00:00').getTime());
    const session = makeSession();

    await sessionStore.saveSessionKey(hash, session.id, session.key);
    // one day later
    nowStub.returns(new Date('2022-01-02T00:00').getTime());

    expect(await sessionStore.findSessionKey(hash)).to.be.null;
  });

  it('does not find session keys from the future', async () => {
    const nowStub = sinon.stub(sessionStore, 'now');
    stub = nowStub;
    nowStub.returns(new Date('2022-01-02T00:00').getTime());
    const session = makeSession();

    await sessionStore.saveSessionKey(hash, session.id, session.key);
    // one day earlier
    nowStub.returns(new Date('2022-01-01T00:00').getTime());

    expect(await sessionStore.findSessionKey(hash)).to.be.null;
  });
});

describe('computeRecipientHash', () => {
  it('computes different hash for different lists', () => {
    const ids = [utils.toBase64(random(32)), utils.toBase64(random(32)), utils.toBase64(random(32))];

    for (let index = 0; index < ids.length; index++) {
      expect(
        computeRecipientHash({ shareWithUsers: ids.slice(index) }),
      ).to.not.deep.equal(
        computeRecipientHash({ shareWithGroups: ids.slice(index) }),
      );
    }

    for (let index = 0; index < ids.length; index++) {
      expect(
        computeRecipientHash({ shareWithUsers: [ids[0]!] }),
      ).to.not.deep.equal(
        computeRecipientHash({ shareWithUsers: ids.slice(2) }),
      );
    }

    expect(
      computeRecipientHash({ shareWithUsers: ids.slice(0, 1) }),
    ).to.not.deep.equal(
      computeRecipientHash({ shareWithUsers: ids.slice(1) }),
    );
  });

  it('ignores order inside arrays', () => {
    const id1 = utils.toBase64(random(32));
    const id2 = utils.toBase64(random(32));

    const hash = computeRecipientHash({
      shareWithGroups: [id1, id2],
    });

    expect(computeRecipientHash({
      shareWithGroups: [id2, id1],
    })).to.deep.equal(hash);
  });

  it('changes when sharing w/ and w/o self', () => {
    const groupId = utils.toBase64(random(32));

    const hash = computeRecipientHash({
      shareWithGroups: [groupId],
      shareWithSelf: true,
    });

    expect(computeRecipientHash({
      shareWithGroups: [groupId],
      shareWithSelf: false,
    })).to.not.deep.equal(hash);
  });
});
