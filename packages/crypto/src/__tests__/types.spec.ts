import { InvalidArgument } from '@tanker/errors';
import { expect } from '@tanker/test-utils';

import * as utils from '../utils';
import { extractEncryptionFormat } from '../EncryptionFormats/types';

describe('Resource', () => {
  const configs = [
    {
      version: 1,
      testVector: new Uint8Array([
        // encrypted data
        0xc9, 0x5d, 0xe6, 0xa, 0x34, 0xb2, 0x89, 0x42, 0x7a, 0x6d, 0xda, 0xd7,
        0x7b, 0xa4, 0x58, 0xa7, 0xbf, 0xc8, 0x4f,
        // mac
        0xf5, 0x52, 0x9e, 0x12, 0x4, 0x9d, 0xfc, 0xaa, 0x83, 0xb0, 0x71, 0x59,
        0x91, 0xfb, 0xaa, 0xe2,
        // iv
        0x6d, 0x4b, 0x1, 0x7, 0xdc, 0xce, 0xd9, 0xcc, 0xc4, 0xad, 0xdf, 0x89,
        0x7b, 0x86, 0xe, 0x14, 0x22, 0x56, 0x3c, 0x43, 0x16, 0x97, 0x9a, 0x68,
      ]),
    },
    {
      version: 2,
      testVector: new Uint8Array([
        // iv
        0x32, 0x93, 0xa3, 0xf8, 0x6c, 0xa8, 0x82, 0x25, 0xbc, 0x17, 0x7e, 0xb5,
        0x65, 0x9b, 0xee, 0xd, 0xfd, 0xcf, 0xc6, 0x5c, 0x6d, 0xb4, 0x72, 0xe0,
        // encrypted data
        0x5b, 0x33, 0x27, 0x4c, 0x83, 0x84, 0xd1, 0xad, 0xda, 0x5f, 0x86, 0x2,
        0x46, 0x42, 0x91, 0x71, 0x30, 0x65, 0x2e,
        // mac
        0x72, 0x47, 0xe6, 0x48, 0x20, 0xa1, 0x86, 0x91, 0x7f, 0x9c, 0xb5, 0x5e,
        0x91, 0xb3, 0x65, 0x2d,
      ]),
    },
    {
      version: 3,
      testVector: new Uint8Array([
        // encrypted data
        0x37, 0xb5, 0x3d, 0x55, 0x34, 0xb5, 0xc1, 0x3f, 0xe3, 0x72, 0x81, 0x47, 0xf0, 0xca, 0xda, 0x29, 0x99, 0x6e, 0x4,
        // mac
        0xa8, 0x41, 0x81, 0xa0, 0xe0, 0x5e, 0x8e, 0x3a, 0x8, 0xd3, 0x78, 0xfa, 0x5, 0x9f, 0x17, 0xfa,
      ]),
    },
  ];

  it('should throw when an unsupported format version is detected', () => {
    const zeroVersion = new Uint8Array([0]);
    const incorrectVersion = new Uint8Array([52]);
    expect(() => extractEncryptionFormat(zeroVersion)).to.throw(InvalidArgument);
    expect(() => extractEncryptionFormat(incorrectVersion)).to.throw(InvalidArgument);
  });

  configs.forEach(({ version, testVector }) => {
    it(`should detect a buffer v${version}`, () => {
      const resource = utils.concatArrays(new Uint8Array([version]), testVector);
      const { version: detectedVersion } = extractEncryptionFormat(resource);
      expect(detectedVersion).to.deep.equal(version);
    });
  });
});
