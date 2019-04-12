// @flow
import { errors } from '@tanker/core';
import { tcrypto, utils } from '@tanker/crypto';
import { createProvisionalIdentity, getPublicIdentity } from '@tanker/identity';
import FilePonyfill from '@tanker/file-ponyfill';
import { expect, expectRejectedWithProperty } from './chai';

import { type TestArgs } from './TestArgs';

const getConstructor = instance => {
  if (instance instanceof ArrayBuffer)
    return ArrayBuffer;
  if (global.Buffer && instance instanceof Buffer)
    return Buffer;
  else if (instance instanceof Uint8Array)
    return Uint8Array;
  else if (global.File && instance instanceof File || instance instanceof FilePonyfill) // must be before Blob
    return File;
  // else if (global.Blob && instance instanceof Blob)
  return Blob;
};

const getConstructorName = (constructor: Object): string => {
  if (constructor === ArrayBuffer)
    return 'ArrayBuffer';
  if (global.Buffer && constructor === Buffer)
    return 'Buffer';
  else if (constructor === Uint8Array)
    return 'Uint8Array';
  else if (global.File && constructor === File || constructor === FilePonyfill) // must be before Blob
    return 'File';
  // else if (global.Blob && constructor === Blob)
  return 'Blob';
};

const generateEncryptTests = (args: TestArgs) => {
  const clearText: string = 'Rivest Shamir Adleman';
  describe('text resource encryption and sharing - no session', () => {
    it('throws when using a session in an invalid state', async () => {
      await expect(args.bobLaptop.encrypt(clearText)).to.be.rejectedWith(errors.InvalidSessionStatus);
    });

    it('throws when decrypting using a session in an invalid state', async () => {
      await expect(args.bobLaptop.decrypt(utils.fromString('test'))).to.be.rejectedWith(errors.InvalidSessionStatus);
    });
  });

  describe('text resource encryption and sharing', () => {
    let aliceIdentity;
    let alicePublicIdentity;
    let bobIdentity;
    let bobPublicIdentity;

    beforeEach(async () => {
      aliceIdentity = await args.trustchainHelper.generateIdentity();
      alicePublicIdentity = await getPublicIdentity(aliceIdentity);
      bobIdentity = await args.trustchainHelper.generateIdentity();
      bobPublicIdentity = await getPublicIdentity(bobIdentity);
      await args.aliceLaptop.signUp(aliceIdentity);
      await args.bobLaptop.signUp(bobIdentity);
    });

    afterEach(async () => {
      await Promise.all([
        args.aliceLaptop.signOut(),
        args.bobLaptop.signOut(),
        args.bobPhone.signOut(),
      ]);
    });

    describe('encrypt and decrypt a text resource', () => {
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

      it('throws when calling decrypt with a corrupted buffer (resource id)', async () => {
        const encrypted = await args.bobLaptop.encrypt(clearText);
        const corruptPos = encrypted.length - 4;
        encrypted[corruptPos] = (encrypted[corruptPos] + 1) % 256;
        await expect(args.bobLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.ResourceNotFound);
      });

      it('throws when calling decrypt with a corrupted buffer (data)', async () => {
        const encrypted = await args.bobLaptop.encrypt(clearText);
        const corruptPos = 4;
        encrypted[corruptPos] = (encrypted[corruptPos] + 1) % 256;
        await expect(args.bobLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.DecryptFailed);
      });

      it('can encrypt and decrypt a text resource', async () => {
        const encrypted = await args.bobLaptop.encrypt(clearText);
        const decrypted = await args.bobLaptop.decrypt(encrypted);
        expect(decrypted).to.equal(clearText);
      });

      describe('share at encryption time', () => {
        it('shares with the recipient', async () => {
          const encrypted = await args.bobLaptop.encrypt(clearText, { shareWithUsers: [alicePublicIdentity] });
          const decrypted = await args.aliceLaptop.decrypt(encrypted);
          expect(decrypted).to.equal(clearText);
        });

        it('encrypt and share with provisional users', async () => {
          const email = 'alice@tanker-functional-test.io';
          const provisionalIdentity = await createProvisionalIdentity(utils.toBase64(args.trustchainHelper.trustchainId), email);
          await expect(args.bobLaptop.encrypt(clearText, { shareWithUsers: [provisionalIdentity] })).to.be.fulfilled;
        });

        it('cannot claim without share', async () => {
          const email = 'unique@tanker-functional-test.io';
          const provisionalIdentity = await createProvisionalIdentity(utils.toBase64(args.trustchainHelper.trustchainId), email);

          const verificationCode = await args.trustchainHelper.getVerificationCode(email);
          await expect(args.aliceLaptop.claimProvisionalIdentity(provisionalIdentity, verificationCode)).to.be.rejectedWith(errors.NothingToClaim);
        });

        it('claim provisionalIdentity blocks', async () => {
          const email = 'alice@tanker-functional-test.io';
          const provisionalIdentity = await createProvisionalIdentity(utils.toBase64(args.trustchainHelper.trustchainId), email);
          await args.bobLaptop.encrypt(clearText, { shareWithUsers: [provisionalIdentity] });

          const verificationCode = await args.trustchainHelper.getVerificationCode(email);
          await expect(args.aliceLaptop.claimProvisionalIdentity(provisionalIdentity, verificationCode)).to.be.fulfilled;
        });

        it('decrypt claimed block', async () => {
          const email = 'alice@tanker-functional-test.io';
          const provisionalIdentity = await createProvisionalIdentity(utils.toBase64(args.trustchainHelper.trustchainId), email);
          const cipherText = await args.bobLaptop.encrypt(clearText, { shareWithUsers: [provisionalIdentity] });

          const verificationCode = await args.trustchainHelper.getVerificationCode(email);
          await args.aliceLaptop.claimProvisionalIdentity(provisionalIdentity, verificationCode);
          const decrypted = await args.aliceLaptop.decrypt(cipherText);
          expect(decrypted).to.equal(clearText);
        });

        it('decrypt claimed block after signing-out and back in', async () => {
          const email = 'alice@tanker-functional-test.io';
          const provisionalIdentity = await createProvisionalIdentity(utils.toBase64(args.trustchainHelper.trustchainId), email);
          const verificationCode = await args.trustchainHelper.getVerificationCode(email);
          const cipherText = await args.bobLaptop.encrypt(clearText, { shareWithUsers: [provisionalIdentity] });
          await args.aliceLaptop.claimProvisionalIdentity(provisionalIdentity, verificationCode);
          await args.aliceLaptop.signOut();
          await args.aliceLaptop.signIn(aliceIdentity);
          const decrypted = await args.aliceLaptop.decrypt(cipherText);
          expect(decrypted).to.equal(clearText);
        });

        it('decrypt claimed block on a new device', async () => {
          const email = 'alice@tanker-functional-test.io';
          const provisionalIdentity = await createProvisionalIdentity(utils.toBase64(args.trustchainHelper.trustchainId), email);

          const cipherText = await args.bobLaptop.encrypt(clearText, { shareWithUsers: [provisionalIdentity] });

          const verificationCode = await args.trustchainHelper.getVerificationCode(email);
          await args.aliceLaptop.claimProvisionalIdentity(provisionalIdentity, verificationCode);

          const bobUnlockKey = await args.bobLaptop.generateAndRegisterUnlockKey();

          await args.bobLaptop.revokeDevice(args.bobLaptop.deviceId);

          await args.bobPhone.signIn(bobIdentity, { unlockKey: bobUnlockKey });

          const decrypted = await args.bobPhone.decrypt(cipherText);
          expect(decrypted).to.equal(clearText);
        });

        it('shares even when the recipient is not connected', async () => {
          await args.aliceLaptop.signOut();
          const encrypted = await args.bobLaptop.encrypt(clearText, { shareWithUsers: [alicePublicIdentity] });

          await args.aliceLaptop.signIn(aliceIdentity);
          const decrypted = await args.aliceLaptop.decrypt(encrypted);
          expect(decrypted).to.equal(clearText);
        });

        it('shares with a device created after sharing', async () => {
          const bobUnlockKey = await args.bobLaptop.generateAndRegisterUnlockKey();

          const encrypted = await args.aliceLaptop.encrypt(clearText, { shareWithUsers: [bobPublicIdentity] });

          await args.bobPhone.signIn(bobIdentity, { unlockKey: bobUnlockKey });

          const decrypted = await args.bobPhone.decrypt(encrypted);
          expect(decrypted).to.equal(clearText);
          await args.bobPhone.signOut();
        });

        it('can\'t decrypt if shareWithSelf = false', async () => {
          const encrypted = await args.bobLaptop.encrypt(clearText, { shareWithSelf: false, shareWithUsers: [alicePublicIdentity] });
          await expect(args.bobLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.ResourceNotFound);
          await expect(args.aliceLaptop.decrypt(encrypted)).to.be.fulfilled;
        });

        it('can decrypt if shareWithSelf = false but explicitely shared with self at encryption', async () => {
          const encrypted = await args.bobLaptop.encrypt(clearText, { shareWithSelf: false, shareWithUsers: [bobPublicIdentity] });
          await expect(args.bobLaptop.decrypt(encrypted)).to.be.fulfilled;
        });
      });
    });

    describe('share after encryption (reshare)', () => {
      it('throws when sharing an invalid resource id', async () => {
        // $FlowExpectedError
        await expect(args.bobLaptop.share(null, { shareWithUsers: [alicePublicIdentity] })).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when sharing with an invalid recipient list', async () => {
        const encrypted = await args.bobLaptop.encrypt(clearText);
        const resourceId = await args.bobLaptop.getResourceId(encrypted);
        // $FlowExpectedError
        await expect(args.bobLaptop.share([resourceId])).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when sharing a resource that doesn\'t exist', async () => {
        const badResourceId = 'AAAAAAAAAAAAAAAAAAAAAA==';

        await expectRejectedWithProperty({
          handler: async () => args.bobLaptop.share([badResourceId], { shareWithUsers: [alicePublicIdentity] }),
          exception: errors.ResourceNotFound,
          property: 'b64ResourceId',
          expectedValue: badResourceId
        });
      });

      it('throws when sharing with a user that doesn\'t exist', async () => {
        const edata = await args.bobLaptop.encrypt(clearText);
        const resourceId = await args.bobLaptop.getResourceId(edata);
        const eveIdentity = await getPublicIdentity(await args.trustchainHelper.generateIdentity('eve'));

        await expectRejectedWithProperty({
          handler: async () => args.bobLaptop.share([resourceId], { shareWithUsers: [eveIdentity] }),
          exception: errors.RecipientsNotFound,
          property: 'recipientIds',
          expectedValue: [eveIdentity]
        });
      });

      it('shares an existing resource with an existing user', async () => {
        const encrypted = await args.bobLaptop.encrypt(clearText);
        const resourceId = await args.bobLaptop.getResourceId(encrypted);
        await args.bobLaptop.share([resourceId], { shareWithUsers: [alicePublicIdentity] });

        const decrypted = await args.aliceLaptop.decrypt(encrypted);
        expect(decrypted).to.equal(clearText);
      });

      it('shares an existing resource with a provisional user', async () => {
        const email = 'alice@tanker-functional-test.io';
        const provisionalIdentity = await createProvisionalIdentity(utils.toBase64(args.trustchainHelper.trustchainId), email);
        const cipherText = await args.bobLaptop.encrypt(clearText);
        const resourceId = await args.bobLaptop.getResourceId(cipherText);
        await expect(args.bobLaptop.share([resourceId], { shareWithUsers: [provisionalIdentity] })).to.be.fulfilled;
      });
    });
  });

  describe('text resource encryption and sharing with multiple devices', () => {
    let alicePublicIdentity;

    before(async () => {
      const aliceIdentity = await args.trustchainHelper.generateIdentity();
      alicePublicIdentity = await getPublicIdentity(aliceIdentity);
      const bobIdentity = await args.trustchainHelper.generateIdentity();
      await args.bobLaptop.signUp(bobIdentity);
      await args.aliceLaptop.signUp(aliceIdentity);
      const bobUnlockPassword = 'my password';
      await args.bobLaptop.registerUnlock({ password: bobUnlockPassword });
      await args.bobPhone.signIn(bobIdentity, { password: bobUnlockPassword });
    });

    after(async () => {
      await Promise.all([
        args.bobPhone.signOut(),
        args.bobLaptop.signOut(),
        args.aliceLaptop.signOut(),
      ]);
    });

    it('can decrypt a resource encrypted from another device', async () => {
      const encrypted = await args.bobLaptop.encrypt(clearText);
      const decrypted = await args.bobPhone.decrypt(encrypted);
      expect(decrypted).to.equal(clearText);
    });

    it('can\'t decrypt from another device if encrypted with shareWithSelf = false', async () => {
      const encrypted = await args.bobLaptop.encrypt(clearText, { shareWithSelf: false, shareWithUsers: [alicePublicIdentity] });
      await expect(args.bobPhone.decrypt(encrypted)).to.be.rejectedWith(errors.ResourceNotFound);
    });

    it('can access a resource encrypted and shared from a device that was then revoked', async () => {
      const encrypted = await args.bobLaptop.encrypt(clearText);

      // revoke args.bobLaptop
      await args.bobLaptop.revokeDevice(args.bobLaptop.deviceId);
      await args.bobLaptop.signOut(); // NOTE: This shouldn't be necessary, but see revocation.spec.js:120 @ da06447e3

      const decrypted = await args.bobPhone.decrypt(encrypted);
      expect(decrypted).to.equal(clearText);
    });
  });

  // A few helpers needed to test binary resources:
  const objectType = (obj: Object) => {
    const type = getConstructor(obj);
    return type === 'FilePonyfill' ? File : type;
  };
  // In Edge and IE11, accessing the webkitRelativePath property (though defined) triggers
  // a TypeError: Invalid calling object. We avoid this by comparing only useful props.
  const fileProps = (obj: Object) => {
    const { name, size, type, lastModified } = obj;
    return { name, size, type, lastModified };
  };
  const expectType = (obj: Object, type: Object) => expect(objectType(obj)).to.equal(type);
  const expectSameType = (a: Object, b: Object) => expect(objectType(a)).to.equal(objectType(b));
  const expectDeepEqual = (a: Object, b: Object) => {
    if (global.File && a instanceof File) {
      expect(fileProps(a)).to.deep.equal(fileProps(b));
      return;
    }
    expect(a).to.deep.equal(b);
  };

  const sizes = Object.keys(args.resources);

  sizes.forEach(size => {
    describe(`${size} binary resource encryption`, () => {
      before(async () => {
        const aliceIdentity = await args.trustchainHelper.generateIdentity();
        await args.aliceLaptop.signUp(aliceIdentity);
      });

      after(async () => {
        await args.aliceLaptop.signOut();
      });

      args.resources[size].forEach(({ type, resource: clear }) => {
        it(`can encrypt and decrypt keeping input type (${getConstructorName(type)}) by default`, async () => {
          const encrypted = await args.aliceLaptop.encryptData(clear);
          expectSameType(encrypted, clear);

          const decrypted = await args.aliceLaptop.decryptData(encrypted);
          expectSameType(decrypted, clear);

          expectDeepEqual(decrypted, clear);
        });
      });

      // Type conversions have already been tested with medium resources, so skip for big ones.
      if (size === 'big') return;

      args.resources[size].forEach(({ type: originalType, resource: clear }) => {
        args.resources[size].forEach(({ type: transientType }) => {
          it(`can encrypt a ${getConstructorName(originalType)} into a ${getConstructorName(transientType)} and decrypt back a ${getConstructorName(originalType)}`, async () => {
            const encrypted = await args.aliceLaptop.encryptData(clear, { type: transientType });
            expectType(encrypted, transientType);

            const outputOptions = {};
            outputOptions.type = originalType;

            if (global.Blob && outputOptions.type === Blob) {
              outputOptions.mime = clear.type;
            }
            if (global.File && outputOptions.type === File) {
              outputOptions.mime = clear.type;
              outputOptions.name = clear.name;
              outputOptions.lastModified = clear.lastModified;
            }

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
