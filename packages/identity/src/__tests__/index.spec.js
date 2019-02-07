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

    const { trustchain_id, provisional_identities } = utils.fromB64Json(b64Identity); // eslint-disable-line camelcase
    expect(trustchain_id).to.equal(trustchain.id);
    expect(provisional_identities.email).to.not.be.null;
    const element = provisional_identities.email;
    expect(element.target).to.be.equal(userEmail);
    expect(element.encryption_key_pair.public_key).to.not.be.null;
    expect(element.encryption_key_pair.private_key).to.not.be.null;
    expect(element.signature_key_pair.public_key).to.not.be.null;
    expect(element.signature_key_pair.private_key).to.not.be.null;
  });

  it('returns a tanker public identity from an tanker indentity', () => {
    const b64Identity = getPublicIdentity(createIdentity(trustchain.id, trustchain.sk, userId));

    const { trustchain_id, user_id, ...trail } = utils.fromB64Json(b64Identity); // eslint-disable-line camelcase

    expect(trustchain_id).to.equal(trustchain.id);
    expect(utils.fromBase64(user_id)).to.have.lengthOf(tcrypto.HASH_SIZE);
    expect(trail).to.be.empty;
  });

  it('returns a tanker public identity from an tanker provisional indentity', () => {
    const b64ProvisionalIdentity = createProvisionalIdentity(userEmail, trustchain.id);
    const b64PublicIdentity = getPublicIdentity(b64ProvisionalIdentity);

    const provisionalIdentity = utils.fromB64Json(b64ProvisionalIdentity);
    const { provisional_identities, trustchain_id, ...trail } = utils.fromB64Json(b64PublicIdentity); // eslint-disable-line camelcase

    expect(trustchain_id).to.equal(trustchain.id);
    expect(trail).to.be.empty;
    expect(provisional_identities).to.not.be.null;
    expect(provisional_identities.email).to.not.be.null;
    const { target, signature_public_key, encryption_public_key } = provisional_identities.email; // eslint-disable-line camelcase
    expect(target).to.be.equal(userEmail);
    expect(target).to.be.equal(userEmail);
    expect(encryption_public_key).to.not.be.null;
    expect(signature_public_key).to.not.be.null;
    expect(encryption_public_key).to.equal(provisionalIdentity.provisional_identities.email.encryption_key_pair.public_key);
    expect(signature_public_key).to.equal(provisionalIdentity.provisional_identities.email.signature_key_pair.public_key);
  });

  it('upgrade a user token to an identity', () => {
    const b64Identity = upgradeUserToken(trustchain.id, generateUserToken(trustchain.id, trustchain.sk, userId));
    const identity = utils.fromB64Json(b64Identity);

    expect(identity.trustchain_id).to.be.equal(trustchain.id);
    checkToken(identity, trustchain.pk);
  });
});
