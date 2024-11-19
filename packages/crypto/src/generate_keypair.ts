import sodium from 'libsodium-wrappers';
import { toBase64 } from './utils';

(async () => {
  await sodium.ready;
  const keypair = sodium.crypto_box_keypair();
  const b64keypair = {
    privateKey: toBase64(keypair.privateKey),
    publicKey: toBase64(keypair.publicKey),
  };
  console.log(b64keypair); // eslint-disable-line no-console
})();
