import { Padding, errors } from '@tanker/core';
import type { EncryptionOptions, Tanker, b64string } from '@tanker/core';
import { EncryptionV4, EncryptionV8, utils } from '@tanker/crypto';
import { getPublicIdentity } from '@tanker/identity';
import { SlicerStream, MergerStream, Writable } from '@tanker/stream-base';
import { expect, sinon, BufferingObserver, makeTimeoutPromise } from '@tanker/test-utils';
import { getConstructorName } from '@tanker/types';

import { AppHelper, ignoreTag  } from './helpers';
import type { TestArgs, TestResourceSize } from './helpers';
import { expectProgressReport, expectType, expectDeepEqual, pipeStreams } from './helpers';

export const generateUploadTests = (args: TestArgs) => {
  // Some sizes may not be tested on some platforms (e.g. 'big' on Safari)
  const forEachSize = (sizes: Array<TestResourceSize>, fun: (size: TestResourceSize) => void) => {
    const availableSizes = Object.keys(args.resources);
    return sizes.filter(size => availableSizes.includes(size)).forEach(fun);
  };

  type TestParameters = {
    options: EncryptionOptions,
    overhead: number,
    defaultMaxEncryptedChunkSize: number,
    getEncryptedSize: (clearSize: number, chunkSize: number) => number,
  };

  const generateTestsWithOptions = ({ options, overhead, defaultMaxEncryptedChunkSize, getEncryptedSize }: TestParameters) => {
    let appHelper: AppHelper;
    let aliceIdentity: b64string;
    let aliceLaptop: Tanker;
    let bobIdentity: b64string;
    let bobLaptop: Tanker;
    let bobPublicIdentity: b64string;

    before(async () => {
      ({ appHelper } = args);

      const appId = utils.toBase64(appHelper.appId);
      aliceIdentity = await appHelper.generateIdentity();
      aliceLaptop = args.makeTanker(appId);
      await aliceLaptop.start(aliceIdentity);
      await aliceLaptop.registerIdentity({ passphrase: 'passphrase' });

      bobIdentity = await appHelper.generateIdentity();
      bobPublicIdentity = await getPublicIdentity(bobIdentity);
      bobLaptop = args.makeTanker(appId);
      await bobLaptop.start(bobIdentity);
      await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
    });

    after(async () => {
      await Promise.all([
        aliceLaptop.stop(),
        bobLaptop.stop(),
      ]);
    });

    ['gcs', 's3'].forEach(storage => {
      describe(storage, () => {
        if (storage === 's3') {
          before(() => appHelper.setS3());
          after(() => appHelper.unsetS3());
        }

        forEachSize(['empty', 'small', 'medium'], size => {
          it(`can upload and download a ${size} file ${ignoreTag}`, async () => {
            const { type, resource: clear } = args.resources[size][2]!;

            const fileId = await aliceLaptop.upload(clear, options);

            const decrypted = await aliceLaptop.download(fileId, { type });

            expectType(decrypted, type);
            expectDeepEqual(decrypted, clear);
          });
        });

        args.resources.small.forEach((resource) => {
          it(`can download and cast to ${getConstructorName(resource.type)}`, async () => {
            const { type, resource: clear } = resource;

            const fileId = await aliceLaptop.upload(clear, options);

            const decrypted = await aliceLaptop.download(fileId, { type });

            expectType(decrypted, type);
            expectDeepEqual(decrypted, clear);
          });
        });

        it(`can download and cast to ${getConstructorName(args.defaultDownloadType)} by default`, async () => {
          const { resource: clear } = args.resources.small[0]!;

          const fileId = await aliceLaptop.upload(clear, options);

          const decrypted = await aliceLaptop.download(fileId);

          expectType(decrypted, args.defaultDownloadType);
        });

        const expectUploadProgressReport = (onProgress: sinon.SinonSpy, clearSize: number) => {
          const encryptedSize = getEncryptedSize(clearSize, defaultMaxEncryptedChunkSize);
          let chunkSize;

          if (storage === 's3') {
            chunkSize = 5 * 1024 * 1024;
          } else {
            chunkSize = defaultMaxEncryptedChunkSize;
          }

          expectProgressReport(onProgress, encryptedSize, chunkSize);
          onProgress.resetHistory();
        };

        it(`can report progress at simple upload and download ${ignoreTag}`, async () => {
          const onProgress = sinon.fake();
          const { type, resource: clear, size: clearSize } = args.resources.medium[2]!;

          const fileId = await aliceLaptop.upload(clear, { ...options, onProgress });
          expectUploadProgressReport(onProgress, clearSize);

          const decrypted = await aliceLaptop.download(fileId, { onProgress, type });
          expectType(decrypted, type);
          expectDeepEqual(decrypted, clear);
          expectProgressReport(onProgress, clearSize, defaultMaxEncryptedChunkSize - overhead);
        });

        it(`can report progress at stream upload and download ${ignoreTag}`, async () => {
          const onProgress = sinon.fake();
          const { type, resource: clear, size: clearSize } = args.resources.medium[0]!;

          const uploadStream = await aliceLaptop.createUploadStream(clearSize, { ...options, onProgress });
          const fileId = uploadStream.resourceId;
          const slicer = new SlicerStream({ source: clear });
          await pipeStreams({ streams: [slicer, uploadStream], resolveEvent: 'finish' });

          expectUploadProgressReport(onProgress, clearSize);

          const downloadStream = await aliceLaptop.createDownloadStream(fileId, { onProgress });
          const merger = new MergerStream({ type, ...downloadStream.metadata });
          const decrypted = await pipeStreams<Uint8Array>({ streams: [downloadStream, merger], resolveEvent: 'data' });

          expectType(decrypted, type);
          expectDeepEqual(decrypted, clear);
          expectProgressReport(onProgress, clearSize, defaultMaxEncryptedChunkSize - overhead);
        });

        it(`can download a file shared at upload ${ignoreTag}`, async () => {
          const { type, resource: clear } = args.resources.small[2]!;

          const fileId = await aliceLaptop.upload(clear, { ...options, shareWithUsers: [bobPublicIdentity] });

          const decrypted = await bobLaptop.download(fileId, { type });

          expectType(decrypted, type);
          expectDeepEqual(decrypted, clear);
        });

        it(`can download a file shared via upload with streams ${ignoreTag}`, async () => {
          const { type, resource: clear, size: clearSize } = args.resources.medium[0]!;

          const uploadStream = await aliceLaptop.createUploadStream(clearSize, { ...options, shareWithUsers: [bobPublicIdentity] });
          const fileId = uploadStream.resourceId;
          const slicer = new SlicerStream({ source: clear });
          await pipeStreams({ streams: [slicer, uploadStream], resolveEvent: 'finish' });

          const decrypted = await bobLaptop.download(fileId, { type });

          expectDeepEqual(decrypted, clear);
        });

        it(`can download with streams a file shared via upload ${ignoreTag}`, async () => {
          const { type, resource: clear } = args.resources.medium[0]!;

          const fileId = await aliceLaptop.upload(clear, { ...options, shareWithUsers: [bobPublicIdentity] });

          const downloadStream = await bobLaptop.createDownloadStream(fileId);
          const merger = new MergerStream({ type, ...downloadStream.metadata });
          const decrypted = await pipeStreams<Uint8Array>({ streams: [downloadStream, merger], resolveEvent: 'data' });

          expectType(decrypted, type);
          expectDeepEqual(decrypted, clear);
        });

        it(`can upload a file and not share with self ${ignoreTag}`, async () => {
          const { type, resource: clear } = args.resources.small[2]!;

          const fileId = await aliceLaptop.upload(clear, { ...options, shareWithUsers: [bobPublicIdentity], shareWithSelf: false });

          await expect(aliceLaptop.download(fileId)).to.be.rejectedWith(errors.InvalidArgument);

          const decrypted = await bobLaptop.download(fileId, { type });

          expectType(decrypted, type);
          expectDeepEqual(decrypted, clear);
        });

        it(`can upload a file and share with a group ${ignoreTag}`, async () => {
          const { type, resource: clear } = args.resources.small[2]!;
          const groupId = await aliceLaptop.createGroup([bobPublicIdentity]);
          const fileId = await aliceLaptop.upload(clear, { ...options, shareWithGroups: [groupId] });
          const decrypted = await bobLaptop.download(fileId, { type });

          expectType(decrypted, type);
          expectDeepEqual(decrypted, clear);
        });

        it(`can share a file after upload ${ignoreTag}`, async () => {
          const { type, resource: clear } = args.resources.small[2]!;

          const fileId = await aliceLaptop.upload(clear, options);
          await aliceLaptop.share([fileId], { shareWithUsers: [bobPublicIdentity] });

          const decrypted = await bobLaptop.download(fileId, { type });

          expectType(decrypted, type);
          expectDeepEqual(decrypted, clear);
        });

        it(`throws InvalidArgument if downloading a non existing file ${ignoreTag}`, async () => {
          const nonExistingFileId = 'AAAAAAAAAAAAAAAAAAAAAA==';
          await expect(aliceLaptop.download(nonExistingFileId)).to.be.rejectedWith(errors.InvalidArgument);
        });

        it(`throws InvalidArgument if giving an obviously wrong fileId ${ignoreTag}`, async () => {
          const promises = [undefined, null, 'not a resourceId', [], {}].map(async (invalidFileId, i) => {
            // @ts-expect-error Giving invalid options
            await expect(aliceLaptop.download(invalidFileId), `failed test #${i}`).to.be.rejectedWith(errors.InvalidArgument);
          });

          await Promise.all(promises);
        });

        it(`throws InvalidArgument if given an invalid clearSize ${ignoreTag}`, async () => {
          const promises = [undefined, null, 'not a clearSize', [], {}, -1].map(async (invalidClearSize, i) => {
            // @ts-expect-error Giving invalid clearSize
            await expect(aliceLaptop.createUploadStream(invalidClearSize, options), `failed test #${i}`).to.be.rejectedWith(errors.InvalidArgument);
          });

          await Promise.all(promises);
        });

        it(`throws InvalidArgument if given too much data ${ignoreTag}`, async () => {
          const clearSize = 50;
          const uploadStream = await aliceLaptop.createUploadStream(clearSize, options);

          await expect(new Promise((resolve, reject) => {
            uploadStream.on('error', reject);
            uploadStream.on('finish', resolve);
            uploadStream.write(new Uint8Array(clearSize + 1));
            uploadStream.end();
          })).to.be.rejectedWith(errors.InvalidArgument);
        });

        // no need to check for edge with gcs (the upload ends in one request anyway)
        // we chose to disable back pressure tests on s3 because they were hanging unexpectidly
        // we will investigate the issue and enable them again.
        const canTestBackPressure = (storage === 'gcs');

        if (canTestBackPressure) {
          const KB = 1024;
          const MB = KB * KB;

          describe('UploadStream', () => {
            // we buffer data upload depending on the cloud provider
            // @ts-expect-error this condition will always return 'false', s3 not tested
            const maxBufferedLength = storage === 's3' ? 40 * MB : 15 * MB;
            // more chunk are needed for s3 since we need one more resizer
            // @ts-expect-error this condition will always return 'false', s3 not tested
            const nbChunk = storage === 's3' ? 8 : 4;
            const chunkSize = 7 * MB;
            const inputSize = nbChunk * chunkSize;

            it(`buffers at most ${maxBufferedLength / MB}MB when uploading ${inputSize / MB}MB split in ${nbChunk} chunks ${ignoreTag}`, async function () { // eslint-disable-line func-names
              this.timeout(60000);
              const chunk = new Uint8Array(chunkSize);
              const bufferCounter = new BufferingObserver();
              const timeout = makeTimeoutPromise(50);
              let prevCount = 0;
              const uploadStream = await aliceLaptop.createUploadStream(inputSize, {
                ...options,
                onProgress: progressReport => {
                  const newBytes = progressReport.currentBytes - prevCount;
                  prevCount = progressReport.currentBytes;
                  bufferCounter.incrementOutputAndSnapshot(newBytes);
                },
              });

              // hijack tail write to lock upload until stream is flooded
              // eslint-disable-next-line no-underscore-dangle
              const write = uploadStream._tailStream._write.bind(uploadStream._tailStream);

              // eslint-disable-next-line no-underscore-dangle
              uploadStream._tailStream._write = async (...vals) => {
                await timeout.promise;
                write(...vals);
              };

              const continueWriting = () => {
                do {
                  // flood every stream before unlocking writing end
                  timeout.reset();
                  bufferCounter.incrementInput(chunk.length);
                } while (uploadStream.write(chunk) && bufferCounter.inputWritten < inputSize);

                if (bufferCounter.inputWritten >= inputSize) {
                  uploadStream.end();
                }
              };

              await new Promise((resolve, reject) => {
                uploadStream.on('error', reject);
                uploadStream.on('drain', continueWriting);
                uploadStream.on('finish', resolve);
                continueWriting();
              });
              bufferCounter.snapshots.forEach(bufferedLength => {
                expect(bufferedLength).to.be.at.most(maxBufferedLength + defaultMaxEncryptedChunkSize, `buffered data exceeds threshold max buffered size: got ${bufferedLength}, max ${maxBufferedLength})`);
              });
            });
          });

          describe('DownloadStream', () => {
            const storageChunkDownloadSize = 1 * MB;
            const maxBufferedLength = 2 * storageChunkDownloadSize + 5 * defaultMaxEncryptedChunkSize;
            const payloadSize = 30;

            it(`buffers at most ${maxBufferedLength / MB}MB when downloading ${payloadSize}MB ${ignoreTag}`, async function () { // eslint-disable-line func-names
              this.timeout(60000);
              const inputSize = payloadSize * MB;
              const bufferCounter = new BufferingObserver();
              const resourceId = await aliceLaptop.upload(new Uint8Array(inputSize), options);
              const timeout = makeTimeoutPromise(700);
              const downloadStream = await aliceLaptop.createDownloadStream(resourceId);

              // hijack push to control size of output buffer
              // eslint-disable-next-line no-underscore-dangle
              const push = downloadStream._headStream.push.bind(downloadStream._headStream);

              // eslint-disable-next-line no-underscore-dangle
              downloadStream._headStream.push = data => {
                timeout.reset();

                if (data) {
                  bufferCounter.incrementInput(data.length);
                }

                return push(data);
              };

              const slowWritable = new Writable({
                objectMode: true,
                highWaterMark: 1,
                write: async (buffer, _, done) => {
                  // flood every stream before unlocking writing end
                  await timeout.promise;
                  bufferCounter.incrementOutputAndSnapshot(buffer.length);
                  done();
                },
              });
              await new Promise((resolve, reject) => {
                downloadStream.on('error', reject);
                downloadStream.on('end', resolve);
                downloadStream.pipe(slowWritable);
              });
              bufferCounter.snapshots.forEach(bufferedLength => {
                expect(bufferedLength).to.be.at.most(maxBufferedLength, `buffered data exceeds threshold max buffered size: got ${bufferedLength}, max buffered size ${maxBufferedLength}`);
              });
            });
          });
        }
      });
    });
  };

  describe('binary file upload and download without padding', () => {
    generateTestsWithOptions({
      options: { paddingStep: Padding.OFF },
      overhead: EncryptionV4.overhead,
      defaultMaxEncryptedChunkSize: EncryptionV4.defaultMaxEncryptedChunkSize,
      getEncryptedSize: EncryptionV4.getEncryptedSize,
    });
  });
  describe('binary file upload and download with padding', () => {
    generateTestsWithOptions({
      options: {},
      overhead: EncryptionV8.overhead,
      defaultMaxEncryptedChunkSize: EncryptionV8.defaultMaxEncryptedChunkSize,
      getEncryptedSize: (clearSize: number, chunkSize: number) => EncryptionV8.getEncryptedSize(clearSize, Padding.AUTO, chunkSize),
    });
  });
};
