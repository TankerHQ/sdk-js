import { type b64string, ready as cryptoReady, tcrypto, utils } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';
import { expect } from '@tanker/test-utils';

import { dataStoreConfig, makePrefix, openDataStore } from '../../__tests__/TestDataStore';
import { UnauthSessionStorage } from '../../UnauthSession/UnauthSessionStorage';

import { OidcStore, TABLE, idFromNonce } from '../OidcStore';

describe('OidcStore', () => {
  let nonceStore: OidcStore;
  let nonceKeys: tcrypto.SodiumKeyPair;
  let b64Nonce: b64string;

  before(() => cryptoReady);

  beforeEach(async () => {
    nonceKeys = tcrypto.makeSignKeyPair();
    b64Nonce = utils.toRawUrlBase64(nonceKeys.publicKey);
    const dbName = `oidcNonce-test-${makePrefix()}`;
    const oidcNonceStoreConfig = { dbName, ...dataStoreConfig, schemas: OidcStore.schemas, defaultVersion: UnauthSessionStorage.defaultVersion };
    const datastore = await openDataStore(oidcNonceStoreConfig);
    nonceStore = await OidcStore.open(datastore);
  });

  it('returns undefined when the nonce is unknown', async () => {
    expect(await nonceStore.findOidcNonce('unknown nonce')).to.eq(undefined);
  });

  it('saves and finds private nonce keys', async () => {
    await nonceStore.saveOidcNonce(nonceKeys.publicKey, nonceKeys.privateKey);
    const noncePrivateKey = await nonceStore.findOidcNonce(b64Nonce);
    expect(noncePrivateKey).to.deep.equal(nonceKeys.privateKey);
  });

  it('throws on updates to nonce keys', async () => {
    const nonceKeys2 = tcrypto.makeSignKeyPair();

    await nonceStore.saveOidcNonce(nonceKeys.publicKey, nonceKeys.privateKey);
    expect(nonceStore.saveOidcNonce(nonceKeys.publicKey, nonceKeys2.privateKey)).to.be.rejectedWith(InternalError);

    const thekey = await nonceStore.findOidcNonce(b64Nonce);
    expect(thekey).to.deep.equal(nonceKeys.privateKey);
  });

  it('removes nonces from storage', async () => {
    const nonceKeys2 = tcrypto.makeSignKeyPair();

    await nonceStore.saveOidcNonce(nonceKeys.publicKey, nonceKeys.privateKey);
    await nonceStore.saveOidcNonce(nonceKeys2.publicKey, nonceKeys2.privateKey);
    await nonceStore.removeOidcNonce(b64Nonce);
    await nonceStore.removeOidcNonce(b64Nonce);

    expect(await nonceStore.findOidcNonce(b64Nonce)).to.be.undefined;
    expect(await nonceStore.findOidcNonce(utils.toRawUrlBase64(nonceKeys2.publicKey))).to.deep.equal(nonceKeys2.privateKey);
  });

  it('cleans outdated nonces', async () => {
    await nonceStore.saveOidcNonce(nonceKeys.publicKey, nonceKeys.privateKey);

    // insert outdated nonce
    const nonceKeys2 = tcrypto.makeSignKeyPair();
    const day = 24 * 60 * 60 * 1000; // 1 day in milliseconds
    const nonce2 = utils.toRawUrlBase64(nonceKeys2.publicKey);
    // eslint-disable-next-line no-underscore-dangle
    await nonceStore._ds.put(TABLE, { _id: idFromNonce(nonce2), b64PrivateNonceKey: nonceKeys2.privateKey, createdAt: Date.now() - day });

    expect(await nonceStore.findOidcNonce(b64Nonce)).to.deep.equal(nonceKeys.privateKey);
    expect(await nonceStore.findOidcNonce(nonce2)).to.deep.equal(nonceKeys2.privateKey);

    await nonceStore.clean();
    expect(await nonceStore.findOidcNonce(b64Nonce)).to.deep.equal(nonceKeys.privateKey);
    expect(await nonceStore.findOidcNonce(nonce2)).to.be.undefined;
  });
});
