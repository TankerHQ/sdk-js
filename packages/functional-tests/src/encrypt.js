// @flow
import { errors } from '@tanker/core';
import { encryptionV4, tcrypto, utils } from '@tanker/crypto';
import { getConstructor, getConstructorName, getDataLength } from '@tanker/types';
import { createProvisionalIdentity, getPublicIdentity } from '@tanker/identity';
import { expect, sinon, uuid } from '@tanker/test-utils';

import { type TestArgs } from './TestArgs';

const expectProgressReport = (spy, totalBytes, maxBytesPerStep = encryptionV4.defaultMaxEncryptedChunkSize) => {
  // add 1 for initial progress report (currentBytes = 0)
  const stepCount = 1 + (totalBytes === 0 ? 1 : Math.ceil(totalBytes / maxBytesPerStep));
  expect(spy.callCount).to.equal(stepCount);

  let currentBytes = 0;
  for (let step = 0; step < stepCount - 1; step++) {
    expect(spy.getCall(step).args).to.deep.equal([{ currentBytes, totalBytes }]);
    currentBytes += maxBytesPerStep;
  }
  expect(spy.getCall(stepCount - 1).args).to.deep.equal([{ currentBytes: totalBytes, totalBytes }]);
};

const generateEncryptTests = (args: TestArgs) => {
  const clearText: string = 'Rivest Shamir Adleman';

  describe('text resource encryption and sharing - no session', () => {
    let bobLaptop;

    before(() => { bobLaptop = args.makeTanker(); });

    it('throws when using a session in an invalid state', async () => {
      await expect(bobLaptop.encrypt(clearText)).to.be.rejectedWith(errors.PreconditionFailed);
    });

    it('throws when decrypting using a session in an invalid state', async () => {
      await expect(bobLaptop.decrypt(utils.fromString('test'))).to.be.rejectedWith(errors.PreconditionFailed);
    });
  });

  describe('text resource encryption and sharing', () => {
    let aliceLaptop;
    let aliceIdentity;
    let alicePublicIdentity;
    let bobLaptop;
    let bobIdentity;
    let bobPublicIdentity;

    before(async () => {
      aliceIdentity = await args.appHelper.generateIdentity();
      alicePublicIdentity = await getPublicIdentity(aliceIdentity);
      bobIdentity = await args.appHelper.generateIdentity();
      bobPublicIdentity = await getPublicIdentity(bobIdentity);
      aliceLaptop = args.makeTanker();
      bobLaptop = args.makeTanker();
      await aliceLaptop.start(aliceIdentity);
      await aliceLaptop.registerIdentity({ passphrase: 'passphrase' });
      await bobLaptop.start(bobIdentity);
      await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
    });

    after(async () => {
      await Promise.all([
        aliceLaptop.stop(),
        bobLaptop.stop(),
      ]);
    });

    describe('encrypt and decrypt a text resource', () => {
      it('throws when calling encrypt of undefined', async () => {
        // $FlowExpectedError Testing invalid argument
        await expect(bobLaptop.encrypt()).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when decrypting an invalid type', async () => {
        const notUint8ArrayTypes = [undefined, null, 0, {}, [], 'str'];
        for (let i = 0; i < notUint8ArrayTypes.length; i++) {
          // $FlowExpectedError Testing invalid types
          await expect(bobLaptop.decrypt(notUint8ArrayTypes[i]), `bad decryption #${i}`).to.be.rejectedWith(errors.InvalidArgument);
        }
      });

      it('throws when decrypting data with an unknow encryption format', async () => {
        const invalidEncrypted = new Uint8Array([127]);
        await expect(bobLaptop.decrypt(invalidEncrypted)).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when decrypting data with an invalid encryption format', async () => {
        const invalidEncrypted = new Uint8Array([255]); // not a varint
        await expect(bobLaptop.decrypt(invalidEncrypted)).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when decrypting truncated encrypted resource', async () => {
        const encrypted = await bobLaptop.encrypt(clearText);
        // shorter than version + resource id: should not even try to decrypt
        const invalidEncrypted = encrypted.subarray(0, tcrypto.MAC_SIZE - 4);
        await expect(bobLaptop.decrypt(invalidEncrypted)).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when calling decrypt with a corrupted buffer (resource id)', async () => {
        const encrypted = await bobLaptop.encrypt(clearText);
        const corruptPos = encrypted.length - 4;
        encrypted[corruptPos] = (encrypted[corruptPos] + 1) % 256;
        await expect(bobLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when calling decrypt with a corrupted buffer (data)', async () => {
        const encrypted = await bobLaptop.encrypt(clearText);
        const corruptPos = 4;
        encrypted[corruptPos] = (encrypted[corruptPos] + 1) % 256;
        await expect(bobLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.DecryptionFailed);
      });

      it('can encrypt and decrypt a text resource', async () => {
        const encrypted = await bobLaptop.encrypt(clearText);
        const decrypted = await bobLaptop.decrypt(encrypted);
        expect(decrypted).to.equal(clearText);
      });

      it('can report progress when encrypting and decrypting', async () => {
        const onProgress = sinon.spy();

        const encrypted = await bobLaptop.encrypt(clearText, { onProgress });
        expectProgressReport(onProgress, encrypted.length);
        onProgress.resetHistory();

        const decrypted = await bobLaptop.decrypt(encrypted, { onProgress });
        expectProgressReport(onProgress, decrypted.length, encryptionV4.defaultMaxEncryptedChunkSize - encryptionV4.overhead);
      });
    });

    describe('share at encryption time', () => {
      it('encrypt and share with a permanent identity', async () => {
        const encrypted = await bobLaptop.encrypt(clearText, { shareWithUsers: [alicePublicIdentity] });
        const decrypted = await aliceLaptop.decrypt(encrypted);
        expect(decrypted).to.equal(clearText);
      });

      it('encrypt and share with a provisional identity', async () => {
        const email = 'alice@tanker-functional-test.io';
        const provisionalIdentity = await createProvisionalIdentity(utils.toBase64(args.appHelper.appId), email);
        const publicProvisionalIdentity = await getPublicIdentity(provisionalIdentity);
        await expect(bobLaptop.encrypt(clearText, { shareWithUsers: [publicProvisionalIdentity] })).to.be.fulfilled;
      });

      it('throws when sharing with secret permanent identities', async () => {
        await expect(bobLaptop.encrypt(clearText, { shareWithUsers: [aliceIdentity] })).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when sharing with secret provisional identities', async () => {
        const email = 'alice@tanker-functional-test.io';
        const provisionalIdentity = await createProvisionalIdentity(utils.toBase64(args.appHelper.appId), email);
        await expect(bobLaptop.encrypt(clearText, { shareWithUsers: [provisionalIdentity] })).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when sharing with a permanent identity that is not registered', async () => {
        const evePublicIdentity = await getPublicIdentity(await args.appHelper.generateIdentity('eve'));
        await expect(bobLaptop.encrypt(clearText, { shareWithUsers: [evePublicIdentity] })).to.be.rejectedWith(errors.InvalidArgument, evePublicIdentity);
      });

      it('shares even when the recipient is not connected', async () => {
        await aliceLaptop.stop();
        const encrypted = await bobLaptop.encrypt(clearText, { shareWithUsers: [alicePublicIdentity] });

        await aliceLaptop.start(aliceIdentity);
        const decrypted = await aliceLaptop.decrypt(encrypted);
        expect(decrypted).to.equal(clearText);
      });

      it('shares with a device created after sharing', async () => {
        const encrypted = await aliceLaptop.encrypt(clearText, { shareWithUsers: [bobPublicIdentity] });
        const bobPhone = args.makeTanker();
        await bobPhone.start(bobIdentity);
        await bobPhone.verifyIdentity({ passphrase: 'passphrase' });

        const decrypted = await bobPhone.decrypt(encrypted);
        expect(decrypted).to.equal(clearText);
        await bobPhone.stop();
      });
    });

    it('encrypt should ignore resource id argument', async () => {
      const encrypted = await bobLaptop.encrypt(clearText);
      const resourceId = await bobLaptop.getResourceId(encrypted);

      const encrypted2 = await bobLaptop.encrypt(clearText, (({ resourceId }): any));
      const resourceId2 = await bobLaptop.getResourceId(encrypted2);
      expect(resourceId2).to.not.equal(resourceId);
    });

    describe('share after encryption (reshare)', () => {
      it('throws when sharing an invalid resource id', async () => {
        // $FlowExpectedError
        await expect(bobLaptop.share(null, { shareWithUsers: [alicePublicIdentity] })).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when sharing with an invalid recipient list', async () => {
        const encrypted = await bobLaptop.encrypt(clearText);
        const resourceId = await bobLaptop.getResourceId(encrypted);
        // $FlowExpectedError
        await expect(bobLaptop.share([resourceId])).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when sharing a resource that doesn\'t exist', async () => {
        const badResourceId = 'AAAAAAAAAAAAAAAAAAAAAA==';
        await expect(bobLaptop.share([badResourceId], { shareWithUsers: [alicePublicIdentity] })).to.be.rejectedWith(errors.InvalidArgument, badResourceId);
      });

      it('throws when sharing with a permanent identity that is not registered', async () => {
        const edata = await bobLaptop.encrypt(clearText);
        const resourceId = await bobLaptop.getResourceId(edata);
        const evePublicIdentity = await getPublicIdentity(await args.appHelper.generateIdentity('eve'));

        await expect(bobLaptop.share([resourceId], { shareWithUsers: [evePublicIdentity] }))
          .to.be.rejectedWith(errors.InvalidArgument, evePublicIdentity);
      });

      it('shares an existing resource with a permanent identity', async () => {
        const encrypted = await bobLaptop.encrypt(clearText);
        const resourceId = await bobLaptop.getResourceId(encrypted);
        await bobLaptop.share([resourceId], { shareWithUsers: [alicePublicIdentity] });

        const decrypted = await aliceLaptop.decrypt(encrypted);
        expect(decrypted).to.equal(clearText);
      });

      it('shares an existing resource with a provisional identity', async () => {
        const email = 'alice@tanker-functional-test.io';
        const provisionalIdentity = await createProvisionalIdentity(utils.toBase64(args.appHelper.appId), email);
        const publicProvisionalIdentity = await getPublicIdentity(provisionalIdentity);
        const cipherText = await bobLaptop.encrypt(clearText);
        const resourceId = await bobLaptop.getResourceId(cipherText);
        await expect(bobLaptop.share([resourceId], { shareWithUsers: [publicProvisionalIdentity] })).to.be.fulfilled;
      });
    });

    describe('decrypt resources shared with provisional identities', () => {
      let email;
      let provisionalIdentity;
      let publicProvisionalIdentity;

      beforeEach(async () => {
        email = `${uuid.v4()}@tanker-functional-test.io`;
        provisionalIdentity = await createProvisionalIdentity(utils.toBase64(args.appHelper.appId), email);
        publicProvisionalIdentity = await getPublicIdentity(provisionalIdentity);

        const attachResult = await aliceLaptop.attachProvisionalIdentity(provisionalIdentity);
        expect(attachResult).to.deep.equal({
          status: aliceLaptop.constructor.statuses.IDENTITY_VERIFICATION_NEEDED,
          verificationMethod: { type: 'email', email },
        });
      });

      it('does not throw if nothing to claim', async () => {
        const verificationCode = await args.appHelper.getVerificationCode(email);
        await expect(aliceLaptop.verifyProvisionalIdentity({ email, verificationCode })).to.be.fulfilled;
      });

      it('decrypt data shared with an attached provisional identity', async () => {
        const cipherText = await bobLaptop.encrypt(clearText, { shareWithUsers: [publicProvisionalIdentity] });

        const verificationCode = await args.appHelper.getVerificationCode(email);
        await aliceLaptop.verifyProvisionalIdentity({ email, verificationCode });

        const decrypted = await aliceLaptop.decrypt(cipherText);
        expect(decrypted).to.equal(clearText);
      });

      it('decrypt data shared with an attached provisional identity after session restart', async () => {
        const cipherText = await bobLaptop.encrypt(clearText, { shareWithUsers: [publicProvisionalIdentity] });

        const verificationCode = await args.appHelper.getVerificationCode(email);
        await aliceLaptop.verifyProvisionalIdentity({ email, verificationCode });
        await aliceLaptop.stop();

        await aliceLaptop.start(aliceIdentity);
        const decrypted = await aliceLaptop.decrypt(cipherText);
        expect(decrypted).to.equal(clearText);
      });

      it('throws when sharing with already claimed identity', async () => {
        await bobLaptop.encrypt(clearText, { shareWithUsers: [publicProvisionalIdentity] });

        const verificationCode = await args.appHelper.getVerificationCode(email);
        await aliceLaptop.verifyProvisionalIdentity({ email, verificationCode });

        await expect(bobLaptop.encrypt(clearText, { shareWithUsers: [publicProvisionalIdentity] })).to.be.rejectedWith(errors.InternalError);
      });

      it('gracefully accept an already attached provisional identity', async () => {
        await bobLaptop.encrypt(clearText, { shareWithUsers: [publicProvisionalIdentity] });

        const verificationCode = await args.appHelper.getVerificationCode(email);
        await aliceLaptop.verifyProvisionalIdentity({ email, verificationCode });

        const attachResult = await aliceLaptop.attachProvisionalIdentity(provisionalIdentity);
        expect(attachResult).to.deep.equal({ status: aliceLaptop.constructor.statuses.READY });
      });

      it('attach a provisional identity without requesting verification if email already verified', async () => {
        const cipherText = await bobLaptop.encrypt(clearText, { shareWithUsers: [publicProvisionalIdentity] });

        const eveIdentity = await args.appHelper.generateIdentity();
        const eveLaptop = args.makeTanker();

        const verificationCode = await args.appHelper.getVerificationCode(email);

        await eveLaptop.start(eveIdentity);
        await eveLaptop.registerIdentity({ email, verificationCode });

        const attachResult = await eveLaptop.attachProvisionalIdentity(provisionalIdentity);
        expect(attachResult).to.deep.equal({ status: eveLaptop.constructor.statuses.READY });

        const decrypted = await eveLaptop.decrypt(cipherText);
        expect(decrypted).to.equal(clearText);
        await eveLaptop.stop();
      });

      it('throws when verifying provisional identity with wrong verification code', async () => {
        await expect(aliceLaptop.verifyProvisionalIdentity({ email, verificationCode: 'wrongCode' })).to.be.rejectedWith(errors.InvalidVerification);
      });

      it('throws when verifying an email that does not match the provisional identity', async () => {
        const anotherEmail = `${uuid.v4()}@tanker-functional-test.io`;
        const verificationCode = await args.appHelper.getVerificationCode(anotherEmail);
        await expect(aliceLaptop.verifyProvisionalIdentity({ email: anotherEmail, verificationCode })).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when verifying provisional identity without attaching first', async () => {
        const verificationCode = await args.appHelper.getVerificationCode(email);
        await expect(bobLaptop.verifyProvisionalIdentity({ email, verificationCode })).to.be.rejectedWith(errors.PreconditionFailed);
      });

      it('throw when two users attach the same provisional identity', async () => {
        await bobLaptop.encrypt(clearText, { shareWithUsers: [publicProvisionalIdentity] });

        let verificationCode = await args.appHelper.getVerificationCode(email);
        await aliceLaptop.verifyProvisionalIdentity({ email, verificationCode });

        verificationCode = await args.appHelper.getVerificationCode(email);
        await bobLaptop.attachProvisionalIdentity(provisionalIdentity);
        await expect(bobLaptop.verifyProvisionalIdentity({ email, verificationCode })).to.be.rejectedWith(errors.InvalidArgument, 'provisional identity has already been attached');
      });

      it('decrypt resource on a new device', async () => {
        const cipherText = await bobLaptop.encrypt(clearText, { shareWithUsers: [publicProvisionalIdentity] });

        const verificationCode = await args.appHelper.getVerificationCode(email);
        await aliceLaptop.verifyProvisionalIdentity({ email, verificationCode });

        const alicePhone = args.makeTanker();
        await alicePhone.start(aliceIdentity);
        await alicePhone.verifyIdentity({ passphrase: 'passphrase' });
        const decrypted = await alicePhone.decrypt(cipherText);
        expect(decrypted).to.equal(clearText);
        await alicePhone.stop();
      });
    });
  });

  describe('text resource encryption and sharing with multiple devices', () => {
    let aliceLaptop;
    let aliceIdentity;
    let bobLaptop;
    let bobPhone;
    let bobIdentity;

    beforeEach(async () => {
      aliceIdentity = await args.appHelper.generateIdentity();
      bobIdentity = await args.appHelper.generateIdentity();
      aliceLaptop = args.makeTanker();
      bobLaptop = args.makeTanker();
      bobPhone = args.makeTanker();
      await aliceLaptop.start(aliceIdentity);
      await aliceLaptop.registerIdentity({ passphrase: 'passphrase' });

      await bobLaptop.start(bobIdentity);
      await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
      await bobPhone.start(bobIdentity);
      await bobPhone.verifyIdentity({ passphrase: 'passphrase' });
    });

    afterEach(async () => {
      await Promise.all([
        bobPhone.stop(),
        bobLaptop.stop(),
        aliceLaptop.stop(),
      ]);
    });

    it('can decrypt a resource encrypted from another device', async () => {
      const encrypted = await bobLaptop.encrypt(clearText);
      const decrypted = await bobPhone.decrypt(encrypted);
      expect(decrypted).to.equal(clearText);
    });

    it('can access a resource encrypted and shared from a device that was then revoked', async () => {
      const encrypted = await bobLaptop.encrypt(clearText);

      // revoke bobLaptop
      await bobPhone.revokeDevice(bobLaptop.deviceId);

      const decrypted = await bobPhone.decrypt(encrypted);
      expect(decrypted).to.equal(clearText);
    });
  });

  // In Edge and IE11, accessing the webkitRelativePath property on File instances triggers
  // a "TypeError: Invalid calling object", although the property exists. We avoid this error
  // by comparing only a subset of useful File properties:
  const fileProps = (obj: Object) => {
    const { name, size, type, lastModified } = obj;
    return { name, size, type, lastModified };
  };
  const expectType = (obj: Object, type: Object) => expect(getConstructor(obj)).to.equal(type);
  const expectSameType = (a: Object, b: Object) => expect(getConstructor(a)).to.equal(getConstructor(b));
  const expectDeepEqual = (a: Object, b: Object) => {
    if (global.File && a instanceof File) {
      expect(fileProps(a)).to.deep.equal(fileProps(b));
      return;
    }
    expect(a).to.deep.equal(b);
  };

  // Some sizes may not be tested on some platforms (e.g. 'big' on Safari)
  const forEachSize = (sizes: Array<string>, fun: Function) => {
    const availableSizes = Object.keys(args.resources);
    return sizes.filter(size => availableSizes.indexOf(size) !== -1).forEach(fun);
  };

  describe('binary resource encryption', () => {
    let aliceLaptop;
    let aliceIdentity;

    before(async () => {
      aliceIdentity = await args.appHelper.generateIdentity();
      aliceLaptop = args.makeTanker();
      await aliceLaptop.start(aliceIdentity);
      await aliceLaptop.registerIdentity({ passphrase: 'passphrase' });
    });

    after(async () => {
      await aliceLaptop.stop();
    });

    forEachSize(['empty', 'small', 'medium', 'big'], size => {
      args.resources[size].forEach(({ type, resource: clear }) => {
        it(`can encrypt and decrypt a ${size} ${getConstructorName(type)}`, async () => {
          const onProgress = sinon.spy();

          const encrypted = await aliceLaptop.encryptData(clear, { onProgress });
          expectSameType(encrypted, clear);
          expectProgressReport(onProgress, getDataLength(encrypted));
          onProgress.resetHistory();

          const decrypted = await aliceLaptop.decryptData(encrypted, { onProgress });
          expectSameType(decrypted, clear);
          expectDeepEqual(decrypted, clear);
          expectProgressReport(onProgress, getDataLength(decrypted), encryptionV4.defaultMaxEncryptedChunkSize - encryptionV4.overhead);
        });
      });
    });

    // Medium and big resources use the same encryption format, so no need to test on big resources
    forEachSize(['small', 'medium'], size => {
      args.resources[size].forEach(({ type: originalType, resource: clear }) => {
        args.resources[size].forEach(({ type: transientType }) => {
          it(`can encrypt a ${size} ${getConstructorName(originalType)} into a ${getConstructorName(transientType)} and decrypt back a ${getConstructorName(originalType)}`, async () => {
            const encrypted = await aliceLaptop.encryptData(clear, { type: transientType });
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

            const decrypted = await aliceLaptop.decryptData(encrypted, outputOptions);
            expectType(decrypted, originalType);

            expectDeepEqual(decrypted, clear);
          });
        });
      });
    });
  });

  describe('binary file upload and download', () => {
    let aliceIdentity;
    let aliceLaptop;
    let bobIdentity;
    let bobLaptop;
    let bobPublicIdentity;

    before(async () => {
      aliceIdentity = await args.appHelper.generateIdentity();
      aliceLaptop = args.makeTanker();
      await aliceLaptop.start(aliceIdentity);
      await aliceLaptop.registerIdentity({ passphrase: 'passphrase' });

      bobIdentity = await args.appHelper.generateIdentity();
      bobPublicIdentity = await getPublicIdentity(bobIdentity);
      bobLaptop = args.makeTanker();
      await bobLaptop.start(bobIdentity);
      await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
    });

    after(async () => {
      await aliceLaptop.stop();
    });

    forEachSize(['empty', 'small', 'medium'], size => {
      it(`can upload and download a ${size} file`, async () => {
        const { type: originalType, resource: clear } = args.resources[size][2];

        const fileId = await aliceLaptop.upload(clear);

        const decrypted = await aliceLaptop.download(fileId);

        expectType(decrypted, originalType);
        expectDeepEqual(decrypted, clear);
      });
    });

    it('can report progress at upload and download', async () => {
      // Detection of: Edge | Edge iOS | Edge Android - but not Edge (Chromium-based)
      const isEdge = () => /(edge|edgios|edga)\//i.test(typeof navigator === 'undefined' ? '' : navigator.userAgent);

      const onProgress = sinon.spy();

      const { type: originalType, resource: clear, size: clearSize } = args.resources.medium[2];

      const fileId = await aliceLaptop.upload(clear, { onProgress });
      const encryptedSize = encryptionV4.getEncryptedSize(clearSize, encryptionV4.defaultMaxEncryptedChunkSize);
      expectProgressReport(onProgress, encryptedSize, isEdge() ? encryptedSize : encryptionV4.defaultMaxEncryptedChunkSize);
      onProgress.resetHistory();

      const decrypted = await aliceLaptop.download(fileId, { onProgress });
      expectType(decrypted, originalType);
      expectDeepEqual(decrypted, clear);
      expectProgressReport(onProgress, clearSize, encryptionV4.defaultMaxEncryptedChunkSize - encryptionV4.overhead);
    });

    it('can download a file shared at upload', async () => {
      const { type: originalType, resource: clear } = args.resources.small[2];

      const fileId = await aliceLaptop.upload(clear, { shareWithUsers: [bobPublicIdentity] });

      const decrypted = await bobLaptop.download(fileId);

      expectType(decrypted, originalType);
      expectDeepEqual(decrypted, clear);
    });

    it('can share a file after upload', async () => {
      const { type: originalType, resource: clear } = args.resources.small[2];

      const fileId = await aliceLaptop.upload(clear);
      await aliceLaptop.share([fileId], { shareWithUsers: [bobPublicIdentity] });

      const decrypted = await bobLaptop.download(fileId);

      expectType(decrypted, originalType);
      expectDeepEqual(decrypted, clear);
    });

    it('throws InvalidArgument if downloading a non existing file', async () => {
      const nonExistingFileId = 'AAAAAAAAAAAAAAAAAAAAAA==';
      await expect(aliceLaptop.download(nonExistingFileId)).to.be.rejectedWith(errors.InvalidArgument);
    });

    it('throws InvalidArgument if giving an obviously wrong fileId', async () => {
      const promises = [undefined, null, 'not a resourceId', [], {}].map(async (invalidFileId, i) => {
        // $FlowExpectedError Giving invalid options
        await expect(aliceLaptop.download(invalidFileId), `failed test #${i}`).to.be.rejectedWith(errors.InvalidArgument);
      });

      await Promise.all(promises);
    });
  });
};

export default generateEncryptTests;
