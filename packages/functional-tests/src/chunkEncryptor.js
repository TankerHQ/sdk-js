// @flow
import uuid from 'uuid';
import { errors } from '@tanker/core';
import { utils } from '@tanker/crypto';
import { expect } from './chai';

import { type TestArgs } from './TestArgs';

const generateChunkEncryptorTests = (args: TestArgs) => {
  describe('ChunkEncryptor', () => {
    let aliceId;
    let bobId;
    let aliceToken;
    let bobToken;

    beforeEach(async () => {
      aliceId = uuid.v4();
      bobId = uuid.v4();
      aliceToken = args.trustchainHelper.generateUserToken(aliceId);
      bobToken = args.trustchainHelper.generateUserToken(bobId);
      await args.aliceLaptop.open(aliceId, aliceToken);
      await args.bobLaptop.open(bobId, bobToken);
    });

    afterEach(async () => {
      await Promise.all([
        args.aliceLaptop.close(),
        args.bobLaptop.close(),
        args.bobPhone.close(),
      ]);
    });

    it('can decrypt data encrypted for self', async () => {
      const letterContents = ['Harder', 'Better', 'Faster', 'Stronger'];

      const encryptor = await args.aliceLaptop.makeChunkEncryptor();
      const encryptedChunks = [];
      for (const word of letterContents)
        encryptedChunks.push(await encryptor.encryptData(utils.fromString(word)));

      const encryptedSeal = await encryptor.seal();

      const decryptor = await args.aliceLaptop.makeChunkEncryptor(encryptedSeal);
      const decryptedChunks = await Promise.all(encryptedChunks.map((c, idx) => decryptor.decryptData(c, idx)));

      expect(decryptedChunks.map(utils.toString)).to.deep.equal(letterContents);
    });

    it('cannot decrypt data encrypted and not shared with self', async () => {
      const letterContents = ['Harder', 'Better', 'Faster', 'Stronger'];

      const encryptor = await args.aliceLaptop.makeChunkEncryptor();
      const encryptedChunks = [];
      for (const word of letterContents)
        encryptedChunks.push(await encryptor.encryptData(utils.fromString(word)));

      const encryptedSeal = await encryptor.seal({ shareWithUsers: [bobId], shareWithSelf: false });

      await expect(args.aliceLaptop.makeChunkEncryptor(encryptedSeal)).to.be.rejectedWith(errors.ResourceNotFound);
    });

    it('cannot seal and share with no one (including myself)', async () => {
      const letterContents = ['Harder', 'Better', 'Faster', 'Stronger'];

      const encryptor = await args.aliceLaptop.makeChunkEncryptor();
      const encryptedChunks = [];
      for (const word of letterContents)
        encryptedChunks.push(await encryptor.encryptData(utils.fromString(word)));

      await expect(encryptor.seal({ shareWithSelf: false })).to.be.rejectedWith(errors.InvalidArgument);
    });

    [
      { prop: 'shareWithUsers', title: 'shares a chunked resource' },
      { prop: 'shareWith', title: 'shares a chunked resource with deprecated option' },
    ].forEach(({ prop, title }) => {
      it(title, async () => {
        const letterContents = ['Harder', 'Better', 'Faster', 'Stronger'];

        const encryptor = await args.aliceLaptop.makeChunkEncryptor();
        const encryptedChunks = [];
        for (const word of letterContents)
          encryptedChunks.push(await encryptor.encryptData(utils.fromString(word)));

        const encryptedSeal = await encryptor.seal({ [prop]: [bobId] });

        const decryptor = await args.bobLaptop.makeChunkEncryptor(encryptedSeal);
        const decryptedChunks = await Promise.all(encryptedChunks.map((c, idx) => decryptor.decryptData(c, idx)));

        expect(decryptedChunks.map(utils.toString)).to.deep.equal(letterContents);
      });
    });
  });
};

export default generateChunkEncryptorTests;
