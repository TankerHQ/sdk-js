// @flow
import File from '@tanker/file-ponyfill';
import { utils } from '@tanker/crypto';

import { expect } from './chai';
import FileReader from '../FileReader';

describe('FileReader', () => {
  const ascii = 'The quick brown fox jumps over the lazy dog';
  const utf8 = '古池や蛙飛び込む水の音';
  const type = 'plain/text';
  const binary = new Uint8Array([
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
    0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
    0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17,
    0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f,
  ]);

  [
    { name: 'Blob', builder: (...args) => new Blob(args[0], args[2]) },
    { name: 'File', builder: (...args) => new File(...args) },
  ].forEach(({ name, builder }) => {
    describe(`${name} reading`, () => {
      it('can read a text content', async () => {
        const source = builder([ascii], 'ascii.txt', { type });
        const reader = new FileReader(source);
        const content = await reader.readAsText('ASCII');
        expect(content).to.equal(ascii);
      });

      it('can read a text content with UTF-8 encoding', async () => {
        const source = builder([utf8], 'utf8.txt', { type });
        const reader = new FileReader(source);
        const content = await reader.readAsText('UTF-8');
        expect(content).to.equal(utf8);
      });

      it('can read a text content multiple times', async () => {
        const source = builder([ascii], 'ascii.txt', { type });
        const reader = new FileReader(source);
        expect([
          await reader.readAsText(),
          await reader.readAsText(),
        ]).to.deep.equal([ascii, ascii]);
      });

      it('can read text as a data url with base64 content', async () => {
        const source = builder([ascii], 'ascii.txt', { type });
        const reader = new FileReader(source);
        const dataURL = await reader.readAsDataURL();
        const expectedDataURL = `data:${type};base64,${utils.toBase64(utils.fromString(ascii))}`;
        expect(dataURL).to.equal(expectedDataURL);
      });

      it('can read binary content as a whole', async () => {
        const source = builder([binary], 'utf8.txt', { type });
        const reader = new FileReader(source);
        const content = await reader.readAsArrayBuffer();
        expect(content).to.be.an.instanceOf(ArrayBuffer);
        expect(new Uint8Array(content)).to.deep.equal(binary);
      });

      it('can read binary content in chunks of any size', async () => {
        const source = builder([binary], 'utf8.txt', { type });
        const reader = new FileReader(source);

        const parts = [
          await reader.readAsArrayBuffer(8),
          await reader.readAsArrayBuffer(4),
          await reader.readAsArrayBuffer(4),
          await reader.readAsArrayBuffer(4),
          await reader.readAsArrayBuffer(), // up to the end of the source
        ];

        const partLengths = parts.map(buf => buf.byteLength);
        expect(partLengths).to.deep.equal([8, 4, 4, 4, 12]);

        const content = new Uint8Array(binary.length);
        let position = 0;
        parts.forEach((part, index) => {
          content.set(new Uint8Array(part), position);
          position += partLengths[index];
        });
        expect(content).to.deep.equal(binary);
      });

      it('does not throw if reading more than actual size', async () => {
        const source = builder([binary], 'utf8.txt', { type });
        const reader = new FileReader(source);
        const content = await reader.readAsArrayBuffer(binary.length + 42);
        expect(content).to.be.an.instanceOf(ArrayBuffer);
        expect(new Uint8Array(content)).to.deep.equal(binary);
      });

      it('returns empty buffers if repeatedly reading beyond maximum size', async () => {
        const source = builder([binary], 'utf8.txt', { type });
        const reader = new FileReader(source);
        // reading the whole file
        await reader.readAsArrayBuffer(binary.length);
        // continue reading anyway...
        const additionalReads = [
          await reader.readAsArrayBuffer(4),
          await reader.readAsArrayBuffer(),
        ];
        const additionalReadLength = additionalReads.reduce((prev, curr) => prev + curr.byteLength, 0);
        expect(additionalReadLength).to.equal(0);
      });

      it('gracefully aborts a read', async () => {
        const source = builder([binary], 'utf8.txt', { type });
        const reader = new FileReader(source);
        const readPromise = reader.readAsArrayBuffer();
        reader.abort();
        await expect(readPromise).to.be.rejected;
      });
    });
  });
});
