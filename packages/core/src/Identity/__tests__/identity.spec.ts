import { type b64string, generichash, ready as cryptoReady, utils } from '@tanker/crypto';
import { InvalidArgument } from '@tanker/errors';
import { expect } from '@tanker/test-utils';
import {
  obfuscateUserId, createIdentity,
  createProvisionalIdentity, getPublicIdentity,
} from '@tanker/identity';

import {
  _deserializePermanentIdentity, _deserializeProvisionalIdentity,
  _deserializePublicIdentity, _splitProvisionalAndPermanentPublicIdentities,
  _serializeIdentity, assertTrustchainId,
} from '../identity';
import type {
  SecretPermanentIdentity, PublicIdentity,
  SecretProvisionalIdentity,
} from '../identity';

describe('Identity', () => {
  const trustchain = {
    id: 'tpoxyNzh0hU9G2i9agMvHyyd+pO6zGCjO9BfhrCLjd4=',
    sk: 'cTMoGGUKhwN47ypq4xAXAtVkNWeyUtMltQnYwJhxWYSvqjPVGmXd2wwa7y17QtPTZhn8bxb015CZC/e4ZI7+MQ==',
    pk: 'r6oz1Rpl3dsMGu8te0LT02YZ/G8W9NeQmQv3uGSO/jE=',
  };

  const userId = 'b_eich';
  const userEmail = 'brendan.eich@tanker.io';

  let hashedUserEmail: b64string;
  let obfuscatedUserId: b64string;

  before(async () => {
    await cryptoReady;

    obfuscatedUserId = utils.toBase64(obfuscateUserId(utils.fromBase64(trustchain.id), userId));
    hashedUserEmail = utils.toBase64(generichash(utils.fromString(userEmail)));
  });

  describe('deserialize', () => {
    const goodPermanentIdentity = 'eyJ0cnVzdGNoYWluX2lkIjoidHBveHlOemgwaFU5RzJpOWFnTXZIeXlkK3BPNnpHQ2pPOUJmaHJDTGpkND0iLCJ0YXJnZXQiOiJ1c2VyIiwidmFsdWUiOiJSRGEwZXE0WE51ajV0VjdoZGFwak94aG1oZVRoNFFCRE5weTRTdnk5WG9rPSIsImRlbGVnYXRpb25fc2lnbmF0dXJlIjoiVTlXUW9sQ3ZSeWpUOG9SMlBRbWQxV1hOQ2kwcW1MMTJoTnJ0R2FiWVJFV2lyeTUya1d4MUFnWXprTHhINmdwbzNNaUE5cisremhubW9ZZEVKMCtKQ3c9PSIsImVwaGVtZXJhbF9wdWJsaWNfc2lnbmF0dXJlX2tleSI6IlhoM2kweERUcHIzSFh0QjJRNTE3UUt2M2F6TnpYTExYTWRKRFRTSDRiZDQ9IiwiZXBoZW1lcmFsX3ByaXZhdGVfc2lnbmF0dXJlX2tleSI6ImpFRFQ0d1FDYzFERndvZFhOUEhGQ2xuZFRQbkZ1Rm1YaEJ0K2lzS1U0WnBlSGVMVEVOT212Y2RlMEhaRG5YdEFxL2RyTTNOY3N0Y3gwa05OSWZodDNnPT0iLCJ1c2VyX3NlY3JldCI6IjdGU2YvbjBlNzZRVDNzMERrdmV0UlZWSmhYWkdFak94ajVFV0FGZXh2akk9In0=';
    const goodProvisionalIdentity = 'eyJ0cnVzdGNoYWluX2lkIjoidHBveHlOemgwaFU5RzJpOWFnTXZIeXlkK3BPNnpHQ2pPOUJmaHJDTGpkND0iLCJ0YXJnZXQiOiJlbWFpbCIsInZhbHVlIjoiYnJlbmRhbi5laWNoQHRhbmtlci5pbyIsInB1YmxpY19lbmNyeXB0aW9uX2tleSI6Ii8yajRkSTNyOFBsdkNOM3VXNEhoQTV3QnRNS09jQUNkMzhLNk4wcSttRlU9IiwicHJpdmF0ZV9lbmNyeXB0aW9uX2tleSI6IjRRQjVUV212Y0JyZ2V5RERMaFVMSU5VNnRicUFPRVE4djlwakRrUGN5YkE9IiwicHVibGljX3NpZ25hdHVyZV9rZXkiOiJXN1FFUUJ1OUZYY1hJcE9ncTYydFB3Qml5RkFicFQxckFydUQwaC9OclRBPSIsInByaXZhdGVfc2lnbmF0dXJlX2tleSI6IlVtbll1dmRUYUxZRzBhK0phRHBZNm9qdzQvMkxsOHpzbXJhbVZDNGZ1cVJidEFSQUc3MFZkeGNpazZDcnJhMC9BR0xJVUJ1bFBXc0N1NFBTSDgydE1BPT0ifQ==';
    const goodPublicIdentity = 'eyJ0cnVzdGNoYWluX2lkIjoidHBveHlOemgwaFU5RzJpOWFnTXZIeXlkK3BPNnpHQ2pPOUJmaHJDTGpkND0iLCJ0YXJnZXQiOiJ1c2VyIiwidmFsdWUiOiJSRGEwZXE0WE51ajV0VjdoZGFwak94aG1oZVRoNFFCRE5weTRTdnk5WG9rPSJ9';
    const goodOldPublicProvisionalIdentity = 'eyJ0cnVzdGNoYWluX2lkIjoidHBveHlOemgwaFU5RzJpOWFnTXZIeXlkK3BPNnpHQ2pPOUJmaHJDTGpkND0iLCJ0YXJnZXQiOiJlbWFpbCIsInZhbHVlIjoiYnJlbmRhbi5laWNoQHRhbmtlci5pbyIsInB1YmxpY19lbmNyeXB0aW9uX2tleSI6Ii8yajRkSTNyOFBsdkNOM3VXNEhoQTV3QnRNS09jQUNkMzhLNk4wcSttRlU9IiwicHVibGljX3NpZ25hdHVyZV9rZXkiOiJXN1FFUUJ1OUZYY1hJcE9ncTYydFB3Qml5RkFicFQxckFydUQwaC9OclRBPSJ9';
    const goodPublicProvisionalIdentity = 'eyJ0cnVzdGNoYWluX2lkIjoidHBveHlOemgwaFU5RzJpOWFnTXZIeXlkK3BPNnpHQ2pPOUJmaHJDTGpkND0iLCJ0YXJnZXQiOiJoYXNoZWRfZW1haWwiLCJ2YWx1ZSI6IjB1MmM4dzhFSVpXVDJGelJOL3l5TTVxSWJFR1lUTkRUNVNrV1ZCdTIwUW89IiwicHVibGljX2VuY3J5cHRpb25fa2V5IjoiLzJqNGRJM3I4UGx2Q04zdVc0SGhBNXdCdE1LT2NBQ2QzOEs2TjBxK21GVT0iLCJwdWJsaWNfc2lnbmF0dXJlX2tleSI6Ilc3UUVRQnU5RlhjWElwT2dxNjJ0UHdCaXlGQWJwVDFyQXJ1RDBoL05yVEE9In0=';

    it('can parse a valid permanent identity', () => {
      const identity = _deserializePermanentIdentity(goodPermanentIdentity);

      expect(identity.trustchain_id).to.be.equal(trustchain.id);
      expect(identity.target).to.be.equal('user');
      expect(identity.value).to.equal(obfuscatedUserId);
      expect(identity.delegation_signature).to.equal('U9WQolCvRyjT8oR2PQmd1WXNCi0qmL12hNrtGabYREWiry52kWx1AgYzkLxH6gpo3MiA9r++zhnmoYdEJ0+JCw==');
      expect(identity.ephemeral_public_signature_key).to.equal('Xh3i0xDTpr3HXtB2Q517QKv3azNzXLLXMdJDTSH4bd4=');
      expect(identity.ephemeral_private_signature_key).to.equal('jEDT4wQCc1DFwodXNPHFClndTPnFuFmXhBt+isKU4ZpeHeLTENOmvcde0HZDnXtAq/drM3Ncstcx0kNNIfht3g==');
      expect(identity.user_secret).to.equal('7FSf/n0e76QT3s0DkvetRVVJhXZGEjOxj5EWAFexvjI=');

      // @ts-expect-error hidden property
      expect(identity.serializedIdentity).to.equal(goodPermanentIdentity);
    });

    it('can parse a valid provisional identity', () => {
      const identity = _deserializeProvisionalIdentity(goodProvisionalIdentity) as SecretProvisionalIdentity;

      expect(identity.trustchain_id).to.be.equal(trustchain.id);
      expect(identity.target).to.be.equal('email');
      expect(identity.value).to.equal(userEmail);
      expect(identity.public_signature_key).to.equal('W7QEQBu9FXcXIpOgq62tPwBiyFAbpT1rAruD0h/NrTA=');
      expect(identity.private_signature_key).to.equal('UmnYuvdTaLYG0a+JaDpY6ojw4/2Ll8zsmramVC4fuqRbtARAG70Vdxcik6Crra0/AGLIUBulPWsCu4PSH82tMA==');
      expect(identity.public_encryption_key).to.equal('/2j4dI3r8PlvCN3uW4HhA5wBtMKOcACd38K6N0q+mFU=');
      expect(identity.private_encryption_key).to.equal('4QB5TWmvcBrgeyDDLhULINU6tbqAOEQ8v9pjDkPcybA=');

      // @ts-expect-error hidden property
      expect(identity.serializedIdentity).to.equal(goodProvisionalIdentity);
    });

    it('can parse a valid public identity', () => {
      const identity = _deserializePublicIdentity(goodPublicIdentity);

      expect(identity.trustchain_id).to.equal(trustchain.id);
      expect(identity.target).to.equal('user');
      expect(identity.value).to.equal(obfuscatedUserId);

      // @ts-expect-error hidden property
      expect(identity.serializedIdentity).to.equal(goodPublicIdentity);
      expect(_serializeIdentity(identity)).to.equal(goodPublicIdentity);
    });

    it('can parse a valid non-hashed email public provisional identity', () => {
      const identity = _deserializeProvisionalIdentity(goodOldPublicProvisionalIdentity);

      expect(identity.trustchain_id).to.be.equal(trustchain.id);
      expect(identity.target).to.be.equal('email');
      expect(identity.value).to.equal(userEmail);
      expect(identity.public_signature_key).to.equal('W7QEQBu9FXcXIpOgq62tPwBiyFAbpT1rAruD0h/NrTA=');
      expect(identity.public_encryption_key).to.equal('/2j4dI3r8PlvCN3uW4HhA5wBtMKOcACd38K6N0q+mFU=');

      // @ts-expect-error hidden property
      expect(identity.serializedIdentity).to.equal(goodOldPublicProvisionalIdentity);
      expect(_serializeIdentity(identity)).to.equal(goodOldPublicProvisionalIdentity);
    });

    it('can parse a valid hashed email public provisional identity', () => {
      const identity = _deserializeProvisionalIdentity(goodPublicProvisionalIdentity);

      expect(identity.trustchain_id).to.be.equal(trustchain.id);
      expect(identity.target).to.be.equal('hashed_email');
      expect(identity.value).to.equal(hashedUserEmail);
      expect(identity.public_signature_key).to.equal('W7QEQBu9FXcXIpOgq62tPwBiyFAbpT1rAruD0h/NrTA=');
      expect(identity.public_encryption_key).to.equal('/2j4dI3r8PlvCN3uW4HhA5wBtMKOcACd38K6N0q+mFU=');

      // @ts-expect-error hidden property
      expect(identity.serializedIdentity).to.equal(goodPublicProvisionalIdentity);
    });
  });

  describe('_splitProvisionalAndPermanentPublicIdentities', () => {
    let b64Identity: b64string;
    let identity: SecretPermanentIdentity;
    let b64PublicIdentity: b64string;
    let publicIdentity: PublicIdentity;
    let b64ProvisionalIdentity: b64string;
    let provisionalIdentity: SecretProvisionalIdentity;
    let b64PublicProvisionalIdentity: b64string;
    let publicProvisionalIdentity: PublicIdentity;

    before(async () => {
      b64Identity = await createIdentity(trustchain.id, trustchain.sk, userId);
      identity = _deserializePermanentIdentity(b64Identity);
      b64PublicIdentity = await getPublicIdentity(b64Identity);
      publicIdentity = _deserializePublicIdentity(b64PublicIdentity);
      b64ProvisionalIdentity = await createProvisionalIdentity(trustchain.id, 'email', userEmail);
      provisionalIdentity = _deserializeProvisionalIdentity(b64ProvisionalIdentity) as SecretProvisionalIdentity;
      b64PublicProvisionalIdentity = await getPublicIdentity(b64ProvisionalIdentity);
      publicProvisionalIdentity = _deserializePublicIdentity(b64PublicProvisionalIdentity);
    });

    it('splits identities as expected', async () => {
      const { permanentIdentities, provisionalIdentities } = _splitProvisionalAndPermanentPublicIdentities([publicIdentity, publicProvisionalIdentity]);

      expect(permanentIdentities).to.deep.equal([publicIdentity]);
      expect(provisionalIdentities).to.deep.equal([publicProvisionalIdentity]);
    });

    it('throws when given a secret permanent identity', async () => {
      expect(() => _splitProvisionalAndPermanentPublicIdentities([identity, publicProvisionalIdentity])).to.throw(InvalidArgument);
    });

    it('throws when given a secret provisional identity', async () => {
      // @ts-expect-error testing edge case with permanentIdentity
      expect(() => _splitProvisionalAndPermanentPublicIdentities([publicIdentity, provisionalIdentity])).to.throw(InvalidArgument);
    });
  });

  describe('assertTrustchainId', () => {
    const trustchain2 = {
      id: 'gOhJDFYKK/GNScGOoaZ1vLAwxkuqZCY36IwEo4jcnDE=',
      sk: 'D9jiQt7nB2IlRjilNwUVVTPsYkfbCX0PelMzx5AAXIaVokZ71iUduWCvJ9Akzojca6lvV8u1rnDVEdh7yO6JAQ==',
    };

    const trustchainIdUint8Array = utils.fromBase64(trustchain.id);

    let validPublicIdentity: PublicIdentity;
    let invalidPublicIdentity: PublicIdentity;
    let validPublicProvisionalIdentity: PublicIdentity;
    let invalidPublicProvidionalIdentity: PublicIdentity;

    before(async () => {
      let b64Identity = await createIdentity(trustchain.id, trustchain.sk, userId);
      let b64PublicIdentity = await getPublicIdentity(b64Identity);
      validPublicIdentity = _deserializePublicIdentity(b64PublicIdentity);

      b64Identity = await createIdentity(trustchain2.id, trustchain2.sk, userId);
      b64PublicIdentity = await getPublicIdentity(b64Identity);
      invalidPublicIdentity = _deserializePublicIdentity(b64PublicIdentity);

      b64Identity = await createProvisionalIdentity(trustchain.id, 'email', userEmail);
      b64PublicIdentity = await getPublicIdentity(b64Identity);
      validPublicProvisionalIdentity = _deserializePublicIdentity(b64PublicIdentity);

      b64Identity = await createProvisionalIdentity(trustchain2.id, 'email', userEmail);
      b64PublicIdentity = await getPublicIdentity(b64Identity);
      invalidPublicProvidionalIdentity = _deserializePublicIdentity(b64PublicIdentity);
    });

    it('does not throw with an empty array', async () => {
      expect(() => assertTrustchainId([], trustchainIdUint8Array)).not.to.throw;
    });

    it('does not throw with valid public identities', async () => {
      expect(() => assertTrustchainId([validPublicIdentity], trustchainIdUint8Array)).not.to.throw;
    });

    it('does not throw with valid public provisional identities', async () => {
      expect(() => assertTrustchainId([validPublicProvisionalIdentity], trustchainIdUint8Array)).not.to.throw;
    });

    it('throws with invalid identities', async () => {
      expect(() => assertTrustchainId([invalidPublicIdentity], trustchainIdUint8Array)).to.throw(InvalidArgument);
    });

    it('throws with invalid provisional identities', async () => {
      expect(() => assertTrustchainId([invalidPublicProvidionalIdentity], trustchainIdUint8Array)).to.throw(InvalidArgument);
    });

    it('throws with a mix of valid and invalid identities', async () => {
      expect(() => assertTrustchainId([validPublicIdentity, validPublicProvisionalIdentity, invalidPublicIdentity, invalidPublicProvidionalIdentity], trustchainIdUint8Array)).to.throw(InvalidArgument);
    });
  });
});
