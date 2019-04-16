// @flow
import { expect } from 'chai';
import { tcrypto, utils } from '@tanker/crypto';
import { InvalidIdentity } from '../InvalidIdentity';
import {
  _deserializePermanentIdentity, _deserializeProvisionalIdentity, _deserializePublicIdentity,
  createIdentity, createProvisionalIdentity, getPublicIdentity, upgradeUserToken,
} from '../identity';
import { obfuscateUserId } from '../userId';
import { assertUserSecret } from '../userSecret';

function checkDelegationSignature(identity, trustchainPublicKey) {
  const signedData = utils.concatArrays(
    utils.fromBase64(identity.ephemeral_public_signature_key),
    utils.fromBase64(identity.value)
  );

  expect(tcrypto.verifySignature(
    signedData,
    utils.fromBase64(identity.delegation_signature),
    utils.fromBase64(trustchainPublicKey)
  )).to.equal(true);
}

describe('Identity', () => {
  const trustchain = {
    id: 'tpoxyNzh0hU9G2i9agMvHyyd+pO6zGCjO9BfhrCLjd4=',
    sk: 'cTMoGGUKhwN47ypq4xAXAtVkNWeyUtMltQnYwJhxWYSvqjPVGmXd2wwa7y17QtPTZhn8bxb015CZC/e4ZI7+MQ==',
    pk: 'r6oz1Rpl3dsMGu8te0LT02YZ/G8W9NeQmQv3uGSO/jE=',
  };

  const userId = 'b_eich';
  const userEmail = 'brendan.eich@tanker.io';

  let obfuscatedUserId;

  before(() => {
    obfuscatedUserId = utils.toBase64(obfuscateUserId(utils.fromBase64(trustchain.id), userId));
  });

  describe('parsing and upgrading', () => {
    const goodUserToken = 'eyJkZWxlZ2F0aW9uX3NpZ25hdHVyZSI6IlU5V1FvbEN2UnlqVDhvUjJQUW1kMVdYTkNpMHFtTDEyaE5ydEdhYllSRVdpcnk1MmtXeDFBZ1l6a0x4SDZncG8zTWlBOXIrK3pobm1vWWRFSjArSkN3PT0iLCJlcGhlbWVyYWxfcHJpdmF0ZV9zaWduYXR1cmVfa2V5IjoiakVEVDR3UUNjMURGd29kWE5QSEZDbG5kVFBuRnVGbVhoQnQraXNLVTRacGVIZUxURU5PbXZjZGUwSFpEblh0QXEvZHJNM05jc3RjeDBrTk5JZmh0M2c9PSIsImVwaGVtZXJhbF9wdWJsaWNfc2lnbmF0dXJlX2tleSI6IlhoM2kweERUcHIzSFh0QjJRNTE3UUt2M2F6TnpYTExYTWRKRFRTSDRiZDQ9IiwidXNlcl9pZCI6IlJEYTBlcTRYTnVqNXRWN2hkYXBqT3hobWhlVGg0UUJETnB5NFN2eTlYb2s9IiwidXNlcl9zZWNyZXQiOiI3RlNmL24wZTc2UVQzczBEa3ZldFJWVkpoWFpHRWpPeGo1RVdBRmV4dmpJPSJ9';
    const goodPermanentIdentity = 'eyJ0cnVzdGNoYWluX2lkIjoidHBveHlOemgwaFU5RzJpOWFnTXZIeXlkK3BPNnpHQ2pPOUJmaHJDTGpkND0iLCJ0YXJnZXQiOiJ1c2VyIiwidmFsdWUiOiJSRGEwZXE0WE51ajV0VjdoZGFwak94aG1oZVRoNFFCRE5weTRTdnk5WG9rPSIsImRlbGVnYXRpb25fc2lnbmF0dXJlIjoiVTlXUW9sQ3ZSeWpUOG9SMlBRbWQxV1hOQ2kwcW1MMTJoTnJ0R2FiWVJFV2lyeTUya1d4MUFnWXprTHhINmdwbzNNaUE5cisremhubW9ZZEVKMCtKQ3c9PSIsImVwaGVtZXJhbF9wdWJsaWNfc2lnbmF0dXJlX2tleSI6IlhoM2kweERUcHIzSFh0QjJRNTE3UUt2M2F6TnpYTExYTWRKRFRTSDRiZDQ9IiwiZXBoZW1lcmFsX3ByaXZhdGVfc2lnbmF0dXJlX2tleSI6ImpFRFQ0d1FDYzFERndvZFhOUEhGQ2xuZFRQbkZ1Rm1YaEJ0K2lzS1U0WnBlSGVMVEVOT212Y2RlMEhaRG5YdEFxL2RyTTNOY3N0Y3gwa05OSWZodDNnPT0iLCJ1c2VyX3NlY3JldCI6IjdGU2YvbjBlNzZRVDNzMERrdmV0UlZWSmhYWkdFak94ajVFV0FGZXh2akk9In0=';
    const goodProvisionalIdentity = 'eyJ0cnVzdGNoYWluX2lkIjoidHBveHlOemgwaFU5RzJpOWFnTXZIeXlkK3BPNnpHQ2pPOUJmaHJDTGpkND0iLCJ0YXJnZXQiOiJlbWFpbCIsInZhbHVlIjoiYnJlbmRhbi5laWNoQHRhbmtlci5pbyIsInB1YmxpY19lbmNyeXB0aW9uX2tleSI6Ii8yajRkSTNyOFBsdkNOM3VXNEhoQTV3QnRNS09jQUNkMzhLNk4wcSttRlU9IiwicHJpdmF0ZV9lbmNyeXB0aW9uX2tleSI6IjRRQjVUV212Y0JyZ2V5RERMaFVMSU5VNnRicUFPRVE4djlwakRrUGN5YkE9IiwicHVibGljX3NpZ25hdHVyZV9rZXkiOiJXN1FFUUJ1OUZYY1hJcE9ncTYydFB3Qml5RkFicFQxckFydUQwaC9OclRBPSIsInByaXZhdGVfc2lnbmF0dXJlX2tleSI6IlVtbll1dmRUYUxZRzBhK0phRHBZNm9qdzQvMkxsOHpzbXJhbVZDNGZ1cVJidEFSQUc3MFZkeGNpazZDcnJhMC9BR0xJVUJ1bFBXc0N1NFBTSDgydE1BPT0ifQ==';
    const goodPublicIdentity = 'eyJ0YXJnZXQiOiJ1c2VyIiwidHJ1c3RjaGFpbl9pZCI6InRwb3h5TnpoMGhVOUcyaTlhZ012SHl5ZCtwTzZ6R0NqTzlCZmhyQ0xqZDQ9IiwidmFsdWUiOiJSRGEwZXE0WE51ajV0VjdoZGFwak94aG1oZVRoNFFCRE5weTRTdnk5WG9rPSJ9';
    const goodPublicProvisionalIdentity = 'eyJ0cnVzdGNoYWluX2lkIjoidHBveHlOemgwaFU5RzJpOWFnTXZIeXlkK3BPNnpHQ2pPOUJmaHJDTGpkND0iLCJ0YXJnZXQiOiJlbWFpbCIsInZhbHVlIjoiYnJlbmRhbi5laWNoQHRhbmtlci5pbyIsInB1YmxpY19lbmNyeXB0aW9uX2tleSI6Ii8yajRkSTNyOFBsdkNOM3VXNEhoQTV3QnRNS09jQUNkMzhLNk4wcSttRlU9IiwicHVibGljX3NpZ25hdHVyZV9rZXkiOiJXN1FFUUJ1OUZYY1hJcE9ncTYydFB3Qml5RkFicFQxckFydUQwaC9OclRBPSJ9Cg==';

    it('can parse a valid permanent identity', () => {
      const identity = _deserializePermanentIdentity(goodPermanentIdentity);

      expect(identity.trustchain_id).to.be.equal(trustchain.id);
      expect(identity.target).to.be.equal('user');
      expect(identity.value).to.equal(obfuscatedUserId);
      expect(identity.delegation_signature).to.equal('U9WQolCvRyjT8oR2PQmd1WXNCi0qmL12hNrtGabYREWiry52kWx1AgYzkLxH6gpo3MiA9r++zhnmoYdEJ0+JCw==');
      expect(identity.ephemeral_public_signature_key).to.equal('Xh3i0xDTpr3HXtB2Q517QKv3azNzXLLXMdJDTSH4bd4=');
      expect(identity.ephemeral_private_signature_key).to.equal('jEDT4wQCc1DFwodXNPHFClndTPnFuFmXhBt+isKU4ZpeHeLTENOmvcde0HZDnXtAq/drM3Ncstcx0kNNIfht3g==');
      expect(identity.user_secret).to.equal('7FSf/n0e76QT3s0DkvetRVVJhXZGEjOxj5EWAFexvjI=');
    });

    it('can parse a valid provisional identity', () => {
      const identity = _deserializeProvisionalIdentity(goodProvisionalIdentity);

      expect(identity.trustchain_id).to.be.equal(trustchain.id);
      expect(identity.target).to.be.equal('email');
      expect(identity.value).to.equal(userEmail);
      expect(identity.public_signature_key).to.equal('W7QEQBu9FXcXIpOgq62tPwBiyFAbpT1rAruD0h/NrTA=');
      expect(identity.private_signature_key).to.equal('UmnYuvdTaLYG0a+JaDpY6ojw4/2Ll8zsmramVC4fuqRbtARAG70Vdxcik6Crra0/AGLIUBulPWsCu4PSH82tMA==');
      expect(identity.public_encryption_key).to.equal('/2j4dI3r8PlvCN3uW4HhA5wBtMKOcACd38K6N0q+mFU=');
      expect(identity.private_encryption_key).to.equal('4QB5TWmvcBrgeyDDLhULINU6tbqAOEQ8v9pjDkPcybA=');
    });

    it('can parse a valid public identity', () => {
      const identity = _deserializePublicIdentity(goodPublicIdentity);
      expect(identity.trustchain_id).to.equal(trustchain.id);
      expect(identity.target).to.equal('user');
      expect(identity.value).to.equal(obfuscatedUserId);
    });

    it('can parse a valid public provisional identity', () => {
      const identity = _deserializeProvisionalIdentity(goodPublicProvisionalIdentity);

      expect(identity.trustchain_id).to.be.equal(trustchain.id);
      expect(identity.target).to.be.equal('email');
      expect(identity.value).to.equal(userEmail);
      expect(identity.public_signature_key).to.equal('W7QEQBu9FXcXIpOgq62tPwBiyFAbpT1rAruD0h/NrTA=');
      expect(identity.public_encryption_key).to.equal('/2j4dI3r8PlvCN3uW4HhA5wBtMKOcACd38K6N0q+mFU=');
    });

    it('can upgrade a user token to a permanent identity', async () => {
      const b64PermanentIdentity = await upgradeUserToken(trustchain.id, userId, goodUserToken);
      expect(_deserializePermanentIdentity(b64PermanentIdentity)).to.deep.equal(_deserializePermanentIdentity(goodPermanentIdentity));
    });

    it('throws when upgrading with the wrong userId', async () => {
      await expect(upgradeUserToken(trustchain.id, 'bad user id', goodUserToken)).to.be.rejectedWith(InvalidIdentity);
    });
  });

  describe('create permanent', () => {
    let b64Identity;

    before(async () => {
      b64Identity = await createIdentity(trustchain.id, trustchain.sk, userId);
    });

    it('returns a tanker permanent identity', async () => {
      const identity = _deserializePermanentIdentity(b64Identity);
      expect(identity.trustchain_id).to.be.equal(trustchain.id);
      expect(identity.target).to.be.equal('user');
      expect(identity.value).to.be.equal(obfuscatedUserId);
      assertUserSecret(utils.fromBase64(identity.value), utils.fromBase64(identity.user_secret));
      checkDelegationSignature(identity, trustchain.pk);
    });

    it('returns a tanker public identity from a tanker permanent identity', async () => {
      const b64PublicIdentity = await getPublicIdentity(b64Identity);

      const { trustchain_id, target, value, ...trail } = _deserializePublicIdentity(b64PublicIdentity); // eslint-disable-line camelcase
      expect(trustchain_id).to.equal(trustchain.id);
      expect(target).to.equal('user');
      expect(value).to.equal(obfuscatedUserId);

      expect(trail).to.be.empty;
    });
  });

  describe('create provisional', () => {
    let b64Identity;

    before(async () => {
      b64Identity = await createProvisionalIdentity(trustchain.id, userEmail);
    });

    it('returns a tanker provisional identity', async () => {
      const { trustchain_id, value, target, public_signature_key, public_encryption_key, private_signature_key, private_encryption_key } = _deserializeProvisionalIdentity(b64Identity); // eslint-disable-line camelcase
      expect(trustchain_id).to.equal(trustchain.id);
      expect(target).to.be.equal('email');
      expect(value).to.be.equal(userEmail);
      expect(public_encryption_key).to.be.a('string').that.is.not.empty;
      expect(private_encryption_key).to.be.a('string').that.is.not.empty;
      expect(public_signature_key).to.be.a('string').that.is.not.empty;
      expect(private_signature_key).to.be.a('string').that.is.not.empty;
    });

    it('returns a tanker public identity from a tanker provisional identity', async () => {
      const b64PublicIdentity = await getPublicIdentity(b64Identity);

      const provisionalIdentity = _deserializeProvisionalIdentity(b64Identity);
      const {
        // $FlowIKnow We know a provisional identity is expected
        trustchain_id, target, value, public_signature_key, public_encryption_key, ...trail // eslint-disable-line camelcase
      } = _deserializePublicIdentity(b64PublicIdentity);

      expect(trustchain_id).to.equal(trustchain.id);
      expect(target).to.equal('email');
      expect(value).to.be.equal(userEmail);
      expect(public_encryption_key).to.equal(provisionalIdentity.public_encryption_key);
      expect(public_signature_key).to.equal(provisionalIdentity.public_signature_key);

      expect(trail).to.be.empty;
    });
  });
});
