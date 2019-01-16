// @flow
import { expect } from 'chai';
import { utils } from '@tanker/crypto';

import FilePolyfill from '../File.polyfill';

describe('FilePolyfill (web)', () => {
  // Skip if nothing to test
  if (FilePolyfill === undefined || FilePolyfill === File)
    return;

  let content: string;
  let bytes: Uint8Array;
  let name: string;

  before(() => {
    content = '0123456789abcdef';
    bytes = utils.fromString(content);
    name = 'file.pdf';
  });

  it('is a FilePolyfill instance which inherits File and Blob', () => {
    const file = new FilePolyfill([bytes], name);
    expect(file).to.be.an.instanceof(FilePolyfill);
    expect(file).to.be.an.instanceof(File);
    expect(file).to.be.an.instanceof(Blob);
  });

  it('sets the name and other options given to the constructor', () => {
    const options = { lastModified: Date.now(), type: 'application/pdf' };
    const file = new FilePolyfill([bytes], name, options);
    expect(file.name).to.equal(name);
    expect(file.lastModified).to.equal(options.lastModified);
    expect(file.lastModifiedDate).to.deep.equal(new Date(options.lastModified));
    expect(file.type).to.equal(options.type);
  });

  it('has a default last modified date', () => {
    const file = new FilePolyfill([bytes], name);
    expect(typeof file.lastModified).to.equal('number');
    expect(file.lastModifiedDate).to.be.an.instanceof(Date);
    expect(file.lastModifiedDate).to.deep.equal(new Date(file.lastModified));
  });

  it('can be sliced and read by a regular FileReader', async () => {
    const file = new FilePolyfill([bytes], name);

    const reader = new FileReader();
    const readPromise = new Promise((resolve, reject) => {
      reader.addEventListener('error', reject);
      reader.addEventListener('load', (event: any) => {
        const buffer = event.target.result;
        const string = utils.toString(new Uint8Array(buffer));
        resolve(string);
      });
    });

    const start = 10;
    const end = 13;
    const byteWindow = file.slice(start, end);
    reader.readAsArrayBuffer(byteWindow);

    const result = await readPromise;
    expect(result).to.equal(content.slice(start, end));
  });
});
