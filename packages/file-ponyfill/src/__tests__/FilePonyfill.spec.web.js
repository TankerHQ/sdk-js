// @flow
import { expect } from 'chai';

import FilePonyfill from '../FilePonyfill';

describe('FilePonyfill (web)', () => {
  // Skip if nothing to test
  if (FilePonyfill === undefined || FilePonyfill === File)
    return;

  let bytes: Uint8Array;
  let name: string;

  before(() => {
    // string '0123456789abcdef' as bytes:
    bytes = new Uint8Array([48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 97, 98, 99, 100, 101, 102]);
    name = 'file.pdf';
  });

  it('is a FilePonyfill instance which inherits File and Blob', () => {
    const file = new FilePonyfill([bytes], name);
    expect(file).to.be.an.instanceof(FilePonyfill);
    expect(file).to.be.an.instanceof(File);
    expect(file).to.be.an.instanceof(Blob);
  });

  it('sets the name and other options given to the constructor', () => {
    const options = { lastModified: Date.now(), type: 'application/pdf' };
    const file = new FilePonyfill([bytes], name, options);
    expect(file.name).to.equal(name);
    expect(file.lastModified).to.equal(options.lastModified);
    expect(file.lastModifiedDate).to.deep.equal(new Date(options.lastModified));
    expect(file.type).to.equal(options.type);
  });

  it('has a default last modified date', () => {
    const file = new FilePonyfill([bytes], name);
    expect(typeof file.lastModified).to.equal('number');
    expect(file.lastModifiedDate).to.be.an.instanceof(Date);
    expect(file.lastModifiedDate).to.deep.equal(new Date(file.lastModified));
  });

  it('can be sliced and read by a regular FileReader', async () => {
    const file = new FilePonyfill([bytes], name);

    const reader = new FileReader();
    const readPromise = new Promise((resolve, reject) => {
      reader.addEventListener('error', reject);
      reader.addEventListener('load', (event: any) => {
        const buffer = event.target.result;
        resolve(new Uint8Array(buffer));
      });
    });

    const start = 10;
    const end = 13;
    const byteWindow = file.slice(start, end);
    reader.readAsArrayBuffer(byteWindow);

    const result = await readPromise;
    expect(result).to.deep.equal(bytes.subarray(start, end));
  });
});
