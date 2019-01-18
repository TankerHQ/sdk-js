// @flow
import uuid from 'uuid';
import { errors } from '@tanker/core';
import { tcrypto, utils } from '@tanker/crypto';
import { getConstructorName } from '@tanker/errors';
import { expect } from './chai';

import { type TestArgs } from './TestArgs';

const generateEncryptTests = (args: TestArgs) => {
  describe('text resource encryption and sharing', () => {
    const clearText: string = 'Rivest Shamir Adleman';
    let aliceId;
    let aliceToken;
    let bobId;
    let bobToken;

    describe('no session', () => {
      it('throws when using a session in an invalid state', async () => {
        await expect(args.bobLaptop.encrypt(clearText)).to.be.rejectedWith(errors.InvalidSessionStatus);
      });

      it('throws when decrypting using a session in an invalid state', async () => {
        await expect(args.bobLaptop.decrypt(utils.fromString('test'))).to.be.rejectedWith(errors.InvalidSessionStatus);
      });
    });

    describe('encrypt and decrypt a text resource', () => {
      before(async () => {
        aliceId = uuid.v4();
        bobId = uuid.v4();
        aliceToken = args.trustchainHelper.generateUserToken(aliceId);
        bobToken = args.trustchainHelper.generateUserToken(bobId);
        await args.aliceLaptop.open(aliceId, aliceToken);
        await args.bobLaptop.open(bobId, bobToken);
      });

      after(async () => {
        await Promise.all([
          args.aliceLaptop.close(),
          args.bobLaptop.close(),
          args.bobPhone.close(),
        ]);
      });

      it('throws when calling encrypt of undefined', async () => {
        // $FlowExpectedError Testing invalid argument
        await expect(args.bobLaptop.encrypt()).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when shareWithSelf = false and no userId is provided', async () => {
        const promise = args.bobLaptop.encrypt(clearText, { shareWithSelf: false });
        await expect(promise).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when decrypting an invalid type', async () => {
        const notUint8ArrayTypes = [undefined, null, 0, {}, [], 'str'];
        for (let i = 0; i < notUint8ArrayTypes.length; i++) {
          // $FlowExpectedError Testing invalid types
          await expect(args.bobLaptop.decrypt(notUint8ArrayTypes[i]), `bad decryption #${i}`).to.be.rejectedWith(errors.InvalidArgument);
        }
      });

      it('throws when decrypting data with an unknow encryption format', async () => {
        const invalidEncrypted = new Uint8Array([127]);
        await expect(args.bobLaptop.decrypt(invalidEncrypted)).to.be.rejectedWith(errors.InvalidEncryptionFormat);
      });

      it('throws when decrypting data with an invalid encryption format', async () => {
        const invalidEncrypted = new Uint8Array([255]); // not a varint
        await expect(args.bobLaptop.decrypt(invalidEncrypted)).to.be.rejectedWith(errors.InvalidEncryptionFormat);
      });

      it('throws when decrypting truncated encrypted resource', async () => {
        const encrypted = await args.bobLaptop.encrypt(clearText);
        // shorter than version + resource ID: should not even try to decrypt
        const invalidEncrypted = encrypted.subarray(0, tcrypto.MAC_SIZE - 4);
        await expect(args.bobLaptop.decrypt(invalidEncrypted)).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when calling decrypt with a corrupted buffer', async () => {
        const encrypted = await args.bobLaptop.encrypt(clearText);
        const corruptPos = encrypted.length - 4;
        encrypted[corruptPos] = (encrypted[corruptPos] + 1) % 256;
        // Depending of where the corruption occurs, one of these exceptions is thrown:
        const exceptionTypes = [errors.DecryptFailed, errors.ResourceNotFound];
        await expect(args.bobLaptop.decrypt(encrypted)).to.be.rejectedWith(exceptionTypes);
      });

      it('can encrypt and decrypt a text resource', async () => {
        const encrypted = await args.bobLaptop.encrypt(clearText);
        const decrypted = await args.bobLaptop.decrypt(encrypted);
        expect(decrypted).to.equal(clearText);
      });

      describe('share at encryption time', () => {
        it('shares with the recipient', async () => {
          const encrypted = await args.bobLaptop.encrypt(clearText, { shareWithUsers: [aliceId] });
          const decrypted = await args.aliceLaptop.decrypt(encrypted);
          expect(decrypted).to.equal(clearText);
        });

        it('shares even when the recipient is not connected', async () => {
          await args.aliceLaptop.close();
          const encrypted = await args.bobLaptop.encrypt(clearText, { shareWithUsers: [aliceId] });

          await args.aliceLaptop.open(aliceId, aliceToken);
          const decrypted = await args.aliceLaptop.decrypt(encrypted);
          expect(decrypted).to.equal(clearText);
        });

        it('shares with a device created after sharing', async () => {
          const bobUnlockKey = await args.bobLaptop.generateAndRegisterUnlockKey();

          const encrypted = await args.aliceLaptop.encrypt(clearText, { shareWithUsers: [bobId] });

          // accept device
          args.bobPhone.once('unlockRequired', async () => {
            args.bobPhone.unlockCurrentDevice({ unlockKey: bobUnlockKey });
          });
          await args.bobPhone.open(bobId, bobToken);

          const decrypted = await args.bobPhone.decrypt(encrypted);
          expect(decrypted).to.equal(clearText);
        });

        it('can\'t decrypt if shareWithSelf = false', async () => {
          const encrypted = await args.bobLaptop.encrypt(clearText, { shareWithSelf: false, shareWithUsers: [aliceId] });
          await expect(args.bobLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.ResourceNotFound);
          await expect(args.aliceLaptop.decrypt(encrypted)).to.be.fulfilled;
        });

        it('can decrypt if shareWithSelf = false but explicitely shared with self at encryption', async () => {
          const encrypted = await args.bobLaptop.encrypt(clearText, { shareWithSelf: false, shareWithUsers: [bobId] });
          await expect(args.bobLaptop.decrypt(encrypted)).to.be.fulfilled;
        });

        describe('deprecated shareWith format', () => {
          it('shares with the recipient', async () => {
            const encrypted = await args.bobLaptop.encrypt(clearText, { shareWith: [aliceId] });
            const decrypted = await args.aliceLaptop.decrypt(encrypted);
            expect(decrypted).to.equal(clearText);
          });
        });
      });
    });

    describe('share after encryption (reshare)', () => {
      before(async () => {
        aliceId = uuid.v4();
        bobId = uuid.v4();
        aliceToken = args.trustchainHelper.generateUserToken(aliceId);
        bobToken = args.trustchainHelper.generateUserToken(bobId);
        await args.aliceLaptop.open(aliceId, aliceToken);
        await args.bobLaptop.open(bobId, bobToken);
      });

      after(async () => {
        await Promise.all([
          args.aliceLaptop.close(),
          args.bobLaptop.close(),
          args.bobPhone.close(),
        ]);
      });

      it('throws when sharing an invalid resource id', async () => {
        // $FlowExpectedError
        await expect(args.bobLaptop.share(null, { shareWithUsers: [aliceId] })).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when sharing with an invalid recipient list', async () => {
        const encrypted = await args.bobLaptop.encrypt(clearText);
        const resourceId = await args.bobLaptop.getResourceId(encrypted);
        // $FlowExpectedError
        await expect(args.bobLaptop.share([resourceId])).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when sharing a resource that doesn\'t exist', async () => {
        const badResourceId = 'AAAAAAAAAAAAAAAAAAAA';

        await expect(args.bobLaptop.share([badResourceId], { shareWithUsers: [aliceId] }))
          .to.be.rejectedWith(errors.ResourceNotFound)
          .and.eventually.have.property('b64ResourceId', badResourceId);
      });

      it('throws when sharing with a user that doesn\'t exist', async () => {
        const edata = await args.bobLaptop.encrypt(clearText);
        const resourceId = await args.bobLaptop.getResourceId(edata);
        const eveId = uuid.v4();

        await expect(args.bobLaptop.share([resourceId], { shareWithUsers: [eveId] }))
          .to.be.rejectedWith(errors.RecipientsNotFound)
          .and.eventually.have.property('recipientIds').to.deep.equal([eveId]);
      });

      it('shares an existing resource to an existing user', async () => {
        const encrypted = await args.bobLaptop.encrypt(clearText);
        const resourceId = await args.bobLaptop.getResourceId(encrypted);
        await args.bobLaptop.share([resourceId], { shareWithUsers: [aliceId] });

        const decrypted = await args.aliceLaptop.decrypt(encrypted);
        expect(decrypted).to.equal(clearText);
      });

      describe('deprecated shareWith format', () => {
        it('shares an existing resource to an existing user', async () => {
          const encrypted = await args.bobLaptop.encrypt(clearText);
          const resourceId = await args.bobLaptop.getResourceId(encrypted);
          await args.bobLaptop.share([resourceId], [aliceId]);

          const decrypted = await args.aliceLaptop.decrypt(encrypted);
          expect(decrypted).to.equal(clearText);
        });
      });
    });

    describe('with multiple devices', () => {
      before(async () => {
        const bobUnlockPassword = 'my password';
        bobId = uuid.v4();
        bobToken = args.trustchainHelper.generateUserToken(bobId);
        await args.bobLaptop.open(bobId, bobToken);
        await args.bobLaptop.registerUnlock({ password: 'my password' });

        args.bobPhone.once('unlockRequired', async () => {
          args.bobPhone.unlockCurrentDevice({ password: bobUnlockPassword });
        });
        await args.bobPhone.open(bobId, bobToken);
      });

      after(async () => {
        await Promise.all([
          args.aliceLaptop.close(),
          args.bobLaptop.close(),
          args.bobPhone.close(),
        ]);
      });

      it('can decrypt a resource encrypted from another device', async () => {
        const encrypted = await args.bobLaptop.encrypt(clearText);
        const decrypted = await args.bobPhone.decrypt(encrypted);
        expect(decrypted).to.equal(clearText);
      });

      it('can\'t decrypt from another device if encrypted with shareWithSelf = false', async () => {
        // create alice so that we can at least share with one recipient
        aliceId = uuid.v4();
        aliceToken = args.trustchainHelper.generateUserToken(aliceId);
        await args.aliceLaptop.open(aliceId, aliceToken);
        await args.aliceLaptop.close();

        const encrypted = await args.bobLaptop.encrypt(clearText, { shareWithSelf: false, shareWithUsers: [aliceId] });
        await expect(args.bobPhone.decrypt(encrypted)).to.be.rejectedWith(errors.ResourceNotFound);
      });

      it('can access a resource encrypted and shared from a device that was then revoked', async () => {
        const encrypted = await args.bobLaptop.encrypt(clearText);

        // revoke args.bobLaptop
        await args.bobLaptop.revokeDevice(args.bobLaptop.deviceId);
        await args.bobLaptop.close(); // NOTE: This shouldn't be necessary, but see revocation.spec.js:120 @ da06447e3

        const decrypted = await args.bobPhone.decrypt(encrypted);
        expect(decrypted).to.equal(clearText);
      });
    });
  });

  // A few helpers needed to test binary resources:
  const objectType = (obj: Object) => {
    const type = getConstructorName(obj);
    return type === 'FilePonyfill' ? 'File' : type;
  };
  // In Edge and IE11, accessing the webkitRelativePath property (though defined) triggers
  // a TypeError: Invalid calling object. We avoid this by comparing only useful props.
  const fileProps = (obj: Object) => {
    const { name, size, type, lastModified } = obj;
    return { name, size, type, lastModified };
  };
  const expectType = (obj: Object, type: string) => expect(objectType(obj)).to.equal(type);
  const expectSameType = (a: Object, b: Object) => expect(objectType(a)).to.equal(objectType(b));
  const expectDeepEqual = (a: Object, b: Object) => {
    if (objectType(a) === 'File') {
      expect(fileProps(a)).to.deep.equal(fileProps(b));
      return;
    }
    expect(a).to.deep.equal(b);
  };

  const sizes = Object.keys(args.resources);

  sizes.forEach(size => {
    describe(`${size} binary resource encryption`, () => {
      const types = Object.keys(args.resources[size]);

      let aliceId;
      let aliceToken;

      before(async () => {
        aliceId = uuid.v4();
        aliceToken = args.trustchainHelper.generateUserToken(aliceId);
        await args.aliceLaptop.open(aliceId, aliceToken);
      });

      after(async () => {
        await args.aliceLaptop.close();
      });

      types.forEach(type => {
        it(`can encrypt and decrypt keeping input type (${type}) by default`, async () => {
          const clear = args.resources[size][type];

          const encrypted = await args.aliceLaptop.encryptData(clear);
          expectSameType(encrypted, clear);

          const decrypted = await args.aliceLaptop.decryptData(encrypted);
          expectSameType(decrypted, clear);

          expectDeepEqual(decrypted, clear);
        });
      });

      types.forEach(originalType => {
        types.forEach(transientType => {
          it(`can encrypt a ${originalType} into a ${transientType} and decrypt back a ${originalType}`, async () => {
            const clear = args.resources[size][originalType];

            const encrypted = await args.aliceLaptop.encryptData(clear, { type: transientType });
            expectType(encrypted, transientType);

            const outputOptions = {};
            outputOptions.type = originalType;

            if (outputOptions.type === 'Blob') {
              outputOptions.mime = clear.type;
            }
            if (outputOptions.type === 'File') {
              outputOptions.mime = clear.type;
              outputOptions.name = clear.name;
              outputOptions.lastModified = clear.lastModified;
            }

            // $FlowIKnow Testing more types other than Uint8Array
            const decrypted = await args.aliceLaptop.decryptData(encrypted, outputOptions);
            expectType(decrypted, originalType);

            expectDeepEqual(decrypted, clear);
          });
        });
      });
    });
  });
};

export default generateEncryptTests;
