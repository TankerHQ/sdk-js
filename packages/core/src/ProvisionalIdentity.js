// @flow
import { utils } from '@tanker/crypto';
import { type PublicProvisionalIdentity } from '@tanker/identity';
import { Client } from './Network/Client';

export type FullPublicProvisionalIdentity = {
  trustchainId: Uint8Array,
  target: string,
  value: string,
  appSignaturePublicKey: Uint8Array,
  appEncryptionPublicKey: Uint8Array,
  tankerSignaturePublicKey: Uint8Array,
  tankerEncryptionPublicKey: Uint8Array,
};

export async function fillProvisionalIdentities(
  client: Client,
  partialProvisionalIdentities: Array<PublicProvisionalIdentity>
): Promise<Array<FullPublicProvisionalIdentity>> {
  if (partialProvisionalIdentities.length === 0)
    return [];

  const provisionalIds = partialProvisionalIdentities.map(e => ({ [e.target]: e.value }));
  const tankerPublicKeys = await client.getProvisionalIdentityKeys(provisionalIds);
  const provisionalIdentities = tankerPublicKeys.map((e, i) => {
    const provisionalIdentity = partialProvisionalIdentities[i];
    return ({
      trustchainId: provisionalIdentity.trustchain_id,
      target: provisionalIdentity.target,
      value: provisionalIdentity.value,
      ...e,
      appSignaturePublicKey: utils.fromBase64(provisionalIdentity.public_signature_key),
      appEncryptionPublicKey: utils.fromBase64(provisionalIdentity.public_encryption_key),
    }: FullPublicProvisionalIdentity);
  });

  return provisionalIdentities;
}
