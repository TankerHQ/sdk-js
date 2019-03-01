// @flow
import { expect } from 'chai';
import { generichash, obfuscateUserId, tcrypto, utils } from '@tanker/crypto';
import { generateUserToken, createIdentity, createProvisionalIdentity, getPublicIdentity, upgradeUserToken } from '../index';

function checkUserSecret(userSecret, obfuscatedUserId) {
  expect(obfuscatedUserId).to.have.lengthOf(tcrypto.HASH_SIZE);
  expect(userSecret).to.have.lengthOf(tcrypto.HASH_SIZE);
  const hashPayload = utils.concatArrays(userSecret.slice(0, userSecret.length - 1), obfuscatedUserId);
  const control = generichash(hashPayload, 16);
  expect(userSecret[userSecret.length - 1]).to.equal(control[0]);
}

function checkDelegationSignature(token, trustchainPublicKey) {
  const signedData = utils.concatArrays(
    utils.fromBase64(token.ephemeral_public_signature_key),
    utils.fromBase64(token.user_id)
  );

  expect(tcrypto.verifySignature(
    signedData,
    utils.fromBase64(token.delegation_signature),
    utils.fromBase64(trustchainPublicKey)
  )).to.equal(true);
}

function checkToken(token, trustchainPublicKey) {
  checkUserSecret(utils.fromBase64(token.user_secret), utils.fromBase64(token.user_id));

  checkDelegationSignature(token, trustchainPublicKey);
}

describe('Identity', () => {
  const goodUserToken = 'eyJkZWxlZ2F0aW9uX3NpZ25hdHVyZSI6IlU5V1FvbEN2UnlqVDhvUjJQUW1kMVdYTkNpMHFtTDEyaE5ydEdhYllSRVdpcnk1MmtXeDFBZ1l6a0x4SDZncG8zTWlBOXIrK3pobm1vWWRFSjArSkN3PT0iLCJlcGhlbWVyYWxfcHJpdmF0ZV9zaWduYXR1cmVfa2V5IjoiakVEVDR3UUNjMURGd29kWE5QSEZDbG5kVFBuRnVGbVhoQnQraXNLVTRacGVIZUxURU5PbXZjZGUwSFpEblh0QXEvZHJNM05jc3RjeDBrTk5JZmh0M2c9PSIsImVwaGVtZXJhbF9wdWJsaWNfc2lnbmF0dXJlX2tleSI6IlhoM2kweERUcHIzSFh0QjJRNTE3UUt2M2F6TnpYTExYTWRKRFRTSDRiZDQ9IiwidXNlcl9pZCI6IlJEYTBlcTRYTnVqNXRWN2hkYXBqT3hobWhlVGg0UUJETnB5NFN2eTlYb2s9IiwidXNlcl9zZWNyZXQiOiI3RlNmL24wZTc2UVQzczBEa3ZldFJWVkpoWFpHRWpPeGo1RVdBRmV4dmpJPSJ9';
  const goodIdentity = 'eyJkZWxlZ2F0aW9uX3NpZ25hdHVyZSI6IlU5V1FvbEN2UnlqVDhvUjJQUW1kMVdYTkNpMHFtTDEyaE5ydEdhYllSRVdpcnk1MmtXeDFBZ1l6a0x4SDZncG8zTWlBOXIrK3pobm1vWWRFSjArSkN3PT0iLCJlcGhlbWVyYWxfcHJpdmF0ZV9zaWduYXR1cmVfa2V5IjoiakVEVDR3UUNjMURGd29kWE5QSEZDbG5kVFBuRnVGbVhoQnQraXNLVTRacGVIZUxURU5PbXZjZGUwSFpEblh0QXEvZHJNM05jc3RjeDBrTk5JZmh0M2c9PSIsImVwaGVtZXJhbF9wdWJsaWNfc2lnbmF0dXJlX2tleSI6IlhoM2kweERUcHIzSFh0QjJRNTE3UUt2M2F6TnpYTExYTWRKRFRTSDRiZDQ9IiwidHJ1c3RjaGFpbl9pZCI6InRwb3h5TnpoMGhVOUcyaTlhZ012SHl5ZCtwTzZ6R0NqTzlCZmhyQ0xqZDQ9IiwidXNlcl9pZCI6IlJEYTBlcTRYTnVqNXRWN2hkYXBqT3hobWhlVGg0UUJETnB5NFN2eTlYb2s9IiwidXNlcl9zZWNyZXQiOiI3RlNmL24wZTc2UVQzczBEa3ZldFJWVkpoWFpHRWpPeGo1RVdBRmV4dmpJPSJ9';
  const goodPublicIdentity = 'eyJ0YXJnZXQiOiJ1c2VyIiwidHJ1c3RjaGFpbl9pZCI6InRwb3h5TnpoMGhVOUcyaTlhZ012SHl5ZCtwTzZ6R0NqTzlCZmhyQ0xqZDQ9IiwidmFsdWUiOiJSRGEwZXE0WE51ajV0VjdoZGFwak94aG1oZVRoNFFCRE5weTRTdnk5WG9rPSJ9';

  const trustchain = {
    id: 'tpoxyNzh0hU9G2i9agMvHyyd+pO6zGCjO9BfhrCLjd4=',
    sk: 'cTMoGGUKhwN47ypq4xAXAtVkNWeyUtMltQnYwJhxWYSvqjPVGmXd2wwa7y17QtPTZhn8bxb015CZC/e4ZI7+MQ==',
    pk: 'r6oz1Rpl3dsMGu8te0LT02YZ/G8W9NeQmQv3uGSO/jE=',
  };
  const userId = 'b_eich';
  const obfuscatedUserId = utils.toBase64(obfuscateUserId(utils.fromBase64(trustchain.id), userId));
  const userEmail = 'brendan.eich@tanker.io';

  const userSecret = '7FSf/n0e76QT3s0DkvetRVVJhXZGEjOxj5EWAFexvjI=';
  const publicSignatureKey = 'Xh3i0xDTpr3HXtB2Q517QKv3azNzXLLXMdJDTSH4bd4=';
  const privateSignatureKey = 'jEDT4wQCc1DFwodXNPHFClndTPnFuFmXhBt+isKU4ZpeHeLTENOmvcde0HZDnXtAq/drM3Ncstcx0kNNIfht3g==';
  const delegationSignature = 'U9WQolCvRyjT8oR2PQmd1WXNCi0qmL12hNrtGabYREWiry52kWx1AgYzkLxH6gpo3MiA9r++zhnmoYdEJ0+JCw==';

  const checkGoodToken = (token) => {
    checkToken(token, trustchain.pk);
    expect(token.user_secret).to.equal(userSecret);
    expect(token.ephemeral_public_signature_key).to.equal(publicSignatureKey);
    expect(token.ephemeral_private_signature_key).to.equal(privateSignatureKey);
    expect(token.delegation_signature).to.equal(delegationSignature);
    expect(token.user_id).to.equal(obfuscatedUserId);
  };

  it('returns a valid token signed with the trustchain private key', () => {
    const b64Token = generateUserToken(trustchain.id, trustchain.sk, userId);
    const token = utils.fromB64Json(b64Token);

    checkToken(token, trustchain.pk);
  });

  it('returns a tanker identity', () => {
    const b64Identity = createIdentity(trustchain.id, trustchain.sk, userId);

    const identity = utils.fromB64Json(b64Identity);

    expect(identity.trustchain_id).to.be.equal(trustchain.id);
    checkToken(identity, trustchain.pk);
  });

  it('returns a tanker provisional identity', () => {
    const b64Identity = createProvisionalIdentity(userEmail, trustchain.id);

    const { trustchain_id, value, target, encryption_key_pair, signature_key_pair } = utils.fromB64Json(b64Identity); // eslint-disable-line camelcase
    expect(trustchain_id).to.equal(trustchain.id);
    expect(target).to.be.equal('email');
    expect(value).to.be.equal(userEmail);
    expect(encryption_key_pair.public_key).to.not.be.null;
    expect(encryption_key_pair.private_key).to.not.be.null;
    expect(signature_key_pair.public_key).to.not.be.null;
    expect(signature_key_pair.private_key).to.not.be.null;
  });

  it('returns a tanker public identity from an tanker indentity', () => {
    const b64Identity = getPublicIdentity(createIdentity(trustchain.id, trustchain.sk, userId));

    const { trustchain_id, target, value, ...trail } = utils.fromB64Json(b64Identity); // eslint-disable-line camelcase
    expect(trustchain_id).to.equal(trustchain.id);
    expect(trail).to.be.empty;

    expect(target).to.equal('user');
    expect(utils.fromBase64(value)).to.have.lengthOf(tcrypto.HASH_SIZE);
  });

  it('returns a tanker public identity from an tanker provisional indentity', () => {
    const b64ProvisionalIdentity = createProvisionalIdentity(userEmail, trustchain.id);
    const b64PublicIdentity = getPublicIdentity(b64ProvisionalIdentity);

    const provisionalIdentity = utils.fromB64Json(b64ProvisionalIdentity);
    const { trustchain_id, target, value, // eslint-disable-line camelcase
      public_signature_key, public_encryption_key, ...trail } = utils.fromB64Json(b64PublicIdentity); // eslint-disable-line camelcase

    expect(trustchain_id).to.equal(trustchain.id);
    expect(trail).to.be.empty;
    expect(target).to.equal('email');
    expect(value).to.be.equal(userEmail);
    expect(public_encryption_key).to.not.be.null;
    expect(public_signature_key).to.not.be.null;
    expect(public_encryption_key).to.equal(provisionalIdentity.encryption_key_pair.public_key);
    expect(public_signature_key).to.equal(provisionalIdentity.signature_key_pair.public_key);
  });

  it('Parse a valid user token', () => {
    const userToken = utils.fromB64Json(goodUserToken);
    checkGoodToken(userToken);
  });

  it('Parse a valid identity', () => {
    const identity = utils.fromB64Json(goodIdentity);
    expect(identity.trustchain_id).to.equal(trustchain.id);
    checkGoodToken(identity);
  });

  it('Parse a valid public identity', () => {
    const identity = utils.fromB64Json(goodPublicIdentity);
    expect(identity.trustchain_id).to.equal(trustchain.id);
    expect(identity.target).to.equal('user');
    expect(identity.value).to.equal(obfuscatedUserId);
  });

  it('upgrade a user token to an identity', () => {
    const b64Identity = upgradeUserToken(trustchain.id, userId, goodUserToken);
    const identity = utils.fromB64Json(b64Identity);

    expect(identity.trustchain_id).to.be.equal(trustchain.id);
    checkToken(identity, trustchain.pk);
  });

  it('throws when upgrading with the wrong userId', () => {
    const token = generateUserToken(trustchain.id, trustchain.sk, userId);
    expect(() => upgradeUserToken(trustchain.id, 'bad user id', token)).to.throw();
  });
});
