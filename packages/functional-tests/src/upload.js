// @flow
import { errors } from '@tanker/core';
import { encryptionV4, utils } from '@tanker/crypto';
import { getPublicIdentity } from '@tanker/identity';
import { expect, sinon, BufferingObserver, makeTimeoutPromise } from '@tanker/test-utils';
import { SlicerStream, MergerStream, Writable } from '@tanker/stream-base';

import type { TestArgs } from './helpers';
import { expectProgressReport, expectType, expectDeepEqual, pipeStreams } from './helpers';

export const generateUploadTests = (args: TestArgs) => {
  // Detection of: Edge | Edge iOS | Edge Android - but not Edge (Chromium-based)
  const isEdge = () => /(edge|edgios|edga)\//i.test(typeof navigator === 'undefined' ? '' : navigator.userAgent);

  // Detection of: IE 11
  const isIE = () => /(Trident)\//i.test(typeof navigator === 'undefined' ? '' : navigator.userAgent);

  // Some sizes may not be tested on some platforms (e.g. 'big' on Safari)
  const forEachSize = (sizes: Array<string>, fun: (size: string) => void) => {
    const availableSizes = Object.keys(args.resources);
    return sizes.filter(size => availableSizes.includes(size)).forEach(fun);
  };

  describe('binary file upload and download', () => {
    let appHelper;
    let aliceIdentity;
    let aliceLaptop;
    let bobIdentity;
    let bobLaptop;
    let bobPublicIdentity;

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

    ['gcs', 's3'].forEach((storage) => {
      describe(storage, () => {
        if (storage === 's3') {
          before(() => appHelper.setS3());
          after(() => appHelper.unsetS3());
        }

        forEachSize(['empty', 'small', 'medium'], size => {
          it(`can upload and download a ${size} file`, async () => {
            const { type: originalType, resource: clear } = args.resources[size][2];

            const fileId = await aliceLaptop.upload(clear);

            const decrypted = await aliceLaptop.download(fileId);

            expectType(decrypted, originalType);
            expectDeepEqual(decrypted, clear);
          });
        });

        const expectUploadProgressReport = (onProgress: sinon.proxyApi, clearSize: number) => {
          const encryptedSize = encryptionV4.getEncryptedSize(clearSize, encryptionV4.defaultMaxEncryptedChunkSize);
          let chunkSize;
          if (storage === 's3') {
            chunkSize = 5 * 1024 * 1024;
          } else if (isEdge()) {
            chunkSize = encryptedSize;
          } else {
            chunkSize = encryptionV4.defaultMaxEncryptedChunkSize;
          }
          expectProgressReport(onProgress, encryptedSize, chunkSize);
          onProgress.resetHistory();
        };

        it('can report progress at simple upload and download', async () => {
          const onProgress = sinon.fake();
          const { type: originalType, resource: clear, size: clearSize } = args.resources.medium[2];

          const fileId = await aliceLaptop.upload(clear, { onProgress });
          expectUploadProgressReport(onProgress, clearSize);

          const decrypted = await aliceLaptop.download(fileId, { onProgress });
          expectType(decrypted, originalType);
          expectDeepEqual(decrypted, clear);
          expectProgressReport(onProgress, clearSize, encryptionV4.defaultMaxEncryptedChunkSize - encryptionV4.overhead);
        });

        it('can report progress at stream upload and download', async () => {
          const onProgress = sinon.fake();
          const { type, resource: clear, size: clearSize } = args.resources.medium[0];

          const uploadStream = await aliceLaptop.createUploadStream(clearSize, { onProgress });
          const fileId = uploadStream.resourceId;
          const slicer = new SlicerStream({ source: clear });
          await pipeStreams({ streams: [slicer, uploadStream], resolveEvent: 'finish' });

          expectUploadProgressReport(onProgress, clearSize);

          const downloadStream = await aliceLaptop.createDownloadStream(fileId, { onProgress });
          const merger = new MergerStream({ type, ...downloadStream.metadata });
          const decrypted = await pipeStreams({ streams: [downloadStream, merger], resolveEvent: 'data' });

          expectType(decrypted, type);
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

        it('can download a file shared via upload with streams', async () => {
          const { type, resource: clear, size: clearSize } = args.resources.medium[0];

          const uploadStream = await aliceLaptop.createUploadStream(clearSize, { shareWithUsers: [bobPublicIdentity] });
          const fileId = uploadStream.resourceId;
          const slicer = new SlicerStream({ source: clear });
          await pipeStreams({ streams: [slicer, uploadStream], resolveEvent: 'finish' });

          const decrypted = await bobLaptop.download(fileId, { type });

          expectDeepEqual(decrypted, clear);
        });

        it('can download with streams a file shared via upload', async () => {
          const { type, resource: clear } = args.resources.medium[0];

          const fileId = await aliceLaptop.upload(clear, { shareWithUsers: [bobPublicIdentity] });

          const downloadStream = await bobLaptop.createDownloadStream(fileId);
          const merger = new MergerStream({ type, ...downloadStream.metadata });
          const decrypted = await pipeStreams({ streams: [downloadStream, merger], resolveEvent: 'data' });

          expectType(decrypted, type);
          expectDeepEqual(decrypted, clear);
        });

        it('can upload a file and not share with self', async () => {
          const { type: originalType, resource: clear } = args.resources.small[2];

          const fileId = await aliceLaptop.upload(clear, { shareWithUsers: [bobPublicIdentity], shareWithSelf: false });

          await expect(aliceLaptop.download(fileId)).to.be.rejectedWith(errors.InvalidArgument);

          const decrypted = await bobLaptop.download(fileId);

          expectType(decrypted, originalType);
          expectDeepEqual(decrypted, clear);
        });

        it('can upload a file and share with a group', async () => {
          const { type: originalType, resource: clear } = args.resources.small[2];
          const groupId = await aliceLaptop.createGroup([bobPublicIdentity]);
          const fileId = await aliceLaptop.upload(clear, { shareWithGroups: [groupId] });
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

        it('throws InvalidArgument if given an invalid clearSize', async () => {
          const promises = [undefined, null, 'not a clearSize', [], {}, -1].map(async (invalidClearSize, i) => {
            // $FlowExpectedError Giving invalid clearSize
            await expect(aliceLaptop.createUploadStream(invalidClearSize), `failed test #${i}`).to.be.rejectedWith(errors.InvalidArgument);
          });

          await Promise.all(promises);
        });

        it('throws InvalidArgument if given too much data', async () => {
          const clearSize = 50;
          const uploadStream = await aliceLaptop.createUploadStream(clearSize);

          await expect(new Promise((resolve, reject) => {
            uploadStream.on('error', reject);
            uploadStream.on('finish', resolve);
            uploadStream.write(new Uint8Array(clearSize + 1));
            uploadStream.end();
          })).to.be.rejectedWith(errors.InvalidArgument);
        });

        // no need to check for edge with gcs (the upload ends in one request anyway)
        const canTestBackPressure = !(isEdge() && storage === 'gcs') && !isIE();

        if (canTestBackPressure) {
          const KB = 1024;
          const MB = KB * KB;

          describe('UploadStream', () => {
            // we buffer data upload depending on the cloud provider
            const maxBufferedLength = storage === 's3' ? 40 * MB : 15 * MB;
            // more chunk are needed for s3 since we need one more resizer
            const nbChunk = storage === 's3' ? 8 : 4;
            const chunkSize = 7 * MB;
            const inputSize = nbChunk * chunkSize;

            it(`buffers at most ${maxBufferedLength / MB}MB when uploading ${inputSize / MB}MB split in ${nbChunk} chunks`, async () => {
              const chunk = new Uint8Array(chunkSize);
              const bufferCounter = new BufferingObserver();
              const timeout = makeTimeoutPromise(50);
              let prevCount = 0;
              const uploadStream = await aliceLaptop.createUploadStream(inputSize, {
                onProgress: (progressReport) => {
                  const newBytes = progressReport.currentBytes - prevCount;
                  prevCount = progressReport.currentBytes;
                  bufferCounter.incrementOutputAndSnapshot(newBytes);
                }
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

              bufferCounter.snapshots.forEach((bufferedLength) => {
                expect(bufferedLength).to.be.at.most(maxBufferedLength + encryptionV4.defaultMaxEncryptedChunkSize, `buffered data exceeds threshold max buffered size: got ${bufferedLength}, max ${maxBufferedLength})`);
              });
            });
          });

          describe('DownloadStream', () => {
            const storageChunkDownloadSize = 1 * MB;
            const maxBufferedLength = 2 * storageChunkDownloadSize + 5 * encryptionV4.defaultMaxEncryptedChunkSize;
            const payloadSize = 30;

            it(`buffers at most ${maxBufferedLength / MB}MB when downloading ${payloadSize}MB`, async () => {
              const inputSize = payloadSize * MB;
              const bufferCounter = new BufferingObserver();
              const resourceId = await aliceLaptop.upload(new Uint8Array(inputSize));
              const timeout = makeTimeoutPromise(700);

              const downloadStream = await aliceLaptop.createDownloadStream(resourceId);
              // hijack push to control size of output buffer
              // eslint-disable-next-line no-underscore-dangle
              const push = downloadStream._headStream.push.bind(downloadStream._headStream);
              // eslint-disable-next-line no-underscore-dangle
              downloadStream._headStream.push = (data) => {
                timeout.reset();
                if (data) {
                  bufferCounter.incrementInput(data.length);
                }

                return push(data);
              };

              const slowWritable = new Writable({
                objectMode: true,
                highWaterMark: 1,
                write: async (buffer, encoding, done) => {
                  // flood every stream before unlocking writing end
                  await timeout.promise;
                  bufferCounter.incrementOutputAndSnapshot(buffer.length);
                  done();
                }
              });

              await new Promise((resolve, reject) => {
                downloadStream.on('error', reject);
                downloadStream.on('end', resolve);
                downloadStream.pipe(slowWritable);
              });

              bufferCounter.snapshots.forEach((bufferedLength) => {
                expect(bufferedLength).to.be.at.most(maxBufferedLength, `buffered data exceeds threshold max buffered size: got ${bufferedLength}, max buffered size ${maxBufferedLength}`);
              });
            });
          });
        }
      });
    });
  });
};
