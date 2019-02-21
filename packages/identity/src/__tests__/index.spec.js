// @flow
import { expect } from 'chai';
import { generichash, tcrypto, utils } from '@tanker/crypto';
import { generateUserToken, createIdentity, createProvisionalIdentity, getPublicIdentity, upgradeUserToken } from '../index';

function checkToken(token, trustchainPublicKey) {
  // check valid control byte in user secret
  const hashedUserId = utils.fromBase64(token.user_id);
  const userSecret = utils.fromBase64(token.user_secret);
  expect(hashedUserId).to.have.lengthOf(tcrypto.HASH_SIZE);
  expect(userSecret).to.have.lengthOf(tcrypto.HASH_SIZE);
  const hashPayload = utils.concatArrays(userSecret.slice(0, userSecret.length - 1), hashedUserId);
  const control = generichash(hashPayload, 16);
  expect(userSecret[userSecret.length - 1]).to.equal(control[0]);

  // verify signature
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

describe('Identity', () => {
  const trustchain = {
    id: 'AzES0aJwDCej9bQVY9AUMZBCLdX0msEc/TJ4DOhZaQs=',
    pk: 'dOeLBpHz2IF37UQkS36sXomqEcEAjSyCsXZ7irn9UQA=',
    sk: 'cBAq6A00rRNVTHicxNHdDFuq6LNUo6gAz58oKqy9CGd054sGkfPYgXftRCRLfqxeiaoRwQCNLIKxdnuKuf1RAA=='
  };
  const userId = 'b_eich';
  const userEmail = 'brendan.eich@tanker.io';

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

  it('upgrade a user token to an identity', () => {
    const b64Identity = upgradeUserToken(trustchain.id, generateUserToken(trustchain.id, trustchain.sk, userId));
    const identity = utils.fromB64Json(b64Identity);

    expect(identity.trustchain_id).to.be.equal(trustchain.id);
    checkToken(identity, trustchain.pk);
  });
});
