// @flow
import semver from 'semver';

import { AppHelper, appdUrl, trustchaindUrl } from '../../../../packages/functional-tests/src/helpers';
import { fromBase64, toBase64 } from '../../../../packages/client-node';
import { getPublicIdentity } from '../../../../packages/identity';

export { AppHelper, toBase64 };

const password = 'plop';

class User {
  constructor(tanker, identity) {
    this._tanker = tanker;
    this._identity = identity;
  }

  async start() {
    const status = await this._tanker.start(this._identity);
    if (status === this._tanker.constructor.statuses.IDENTITY_VERIFICATION_NEEDED) {
      await this._tanker.verifyIdentity({ passphrase: password });
    } else if (status === this._tanker.constructor.statuses.IDENTITY_REGISTRATION_NEEDED) {
      await this._tanker.registerIdentity({ passphrase: password });
    }
  }

  async stop() {
    await this._tanker.stop();
  }

  get identity() {
    return this._identity;
  }

  get id() {
    return getPublicIdentity(this._identity);
  }

  get deviceId() {
    return this._tanker.deviceId;
  }

  async encrypt(message, userIds, groupIds) {
    return toBase64(await this._tanker.encrypt(message, { shareWithUsers: userIds, shareWithGroups: groupIds }));
  }

  async decrypt(encryptedData) {
    return this._tanker.decrypt(fromBase64(encryptedData));
  }

  async createGroup(ids) {
    return this._tanker.createGroup(ids);
  }

  async revokeDevice(deviceId) {
    return this._tanker.revokeDevice(deviceId);
  }

  async createEncryptionSession(userIds, groupIds) {
    return this._tanker.createEncryptionSession({ shareWithUsers: userIds, shareWithGroups: groupIds });
  }

  getRevocationPromise() {
    return new Promise(resolve => this._tanker.once('deviceRevoked', resolve));
  }

  async upload(file) {
    return this._tanker.upload(file);
  }

  async download(fileId) {
    return this._tanker.download(fileId);
  }

  async share(resourceId, userId) {
    return this._tanker.share([resourceId], { shareWithUsers: [userId] });
  }
}

function makeTanker(Tanker, adapter, appId, prefix) {
  const sdkVersion = Tanker.version;
  const httpSDK = semver.satisfies(sdkVersion, '0.0.1 || > 2.5.0'); // local or recent
  const url = httpSDK ? appdUrl : trustchaindUrl;

  return new Tanker({
    appId,
    url,
    sdkType: 'test',
    dataStore: { adapter, prefix },
  });
}

export function makeUser(opts) {
  const Tanker = opts.Tanker || require('../../../../packages/client-node').default; // eslint-disable-line global-require
  const adapter = opts.adapter || require('../../../../packages/datastore/pouchdb-memory').default; // eslint-disable-line global-require
  const tanker = makeTanker(Tanker, adapter, opts.appId, opts.prefix);
  return new User(tanker, opts.identity);
}
