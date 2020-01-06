// @flow

import { tcrypto, random } from '@tanker/crypto';
import { expect } from '@tanker/test-utils';

import { serializeTrustchainCreation, unserializeTrustchainCreation } from '../Serialize';


// NOTE: If you ever have to change something here, change it in the Go code too!
// The test vectors should stay the same
describe('TrustchainCreation test vectors', () => {
  it('correctly deserializes a TrustchainCreation test vector', async () => {
    const trustchainCreation = {
      public_signature_key: new Uint8Array([
        0x66, 0x98, 0x23, 0xe7, 0xc5, 0x0e, 0x13, 0xe0, 0xed, 0x4a, 0x56, 0x91, 0xc6, 0x63, 0xc7, 0xeb,
        0x1b, 0xd6, 0x53, 0x12, 0xd4, 0x8d, 0x21, 0xd4, 0x86, 0x76, 0x0f, 0x04, 0x85, 0x7d, 0xf0, 0xef
      ])
    };

    const payload = trustchainCreation.public_signature_key;

    expect(unserializeTrustchainCreation(payload)).to.deep.equal(trustchainCreation);
  });
});

describe('TrustchainCreation', () => {
  it('should throw when serializing an invalid TrustchainCreation', async () => {
    const trustchainCreation = {
      public_signature_key: new Uint8Array(0),
    };
    expect(() => serializeTrustchainCreation(trustchainCreation)).to.throw();
  });


  it('should serialize/unserialize a TrustchainCreation', async () => {
    const trustchainCreation = {
      public_signature_key: random(tcrypto.SYMMETRIC_KEY_SIZE),
    };

    expect(unserializeTrustchainCreation(serializeTrustchainCreation(trustchainCreation))).to.deep.equal(trustchainCreation);
  });
});
