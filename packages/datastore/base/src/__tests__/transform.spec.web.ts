import { expect } from '@tanker/test-utils';

import { fixObjects } from '../transform';

describe('datastore transform operations (web)', () => {
  it('should fix Uint8Array constructor when calling fixObjects on objects of another frame', () => {
    const iframe = document.createElement('iframe');
    const { body } = document;

    body.appendChild(iframe);

    // FrameUint8Array is a Class (explaining the `eslint-disable`)
    // @ts-expect-error Uint8Array is defined in the Window object
    const FrameUint8Array = iframe.contentWindow.Uint8Array; // eslint-disable-line @typescript-eslint/naming-convention

    const obj = { key: new Uint8Array(42) };
    const array = [new Uint8Array(42)];

    expect(fixObjects({ key: new FrameUint8Array(42) })).to.deep.equal(obj);
    expect(fixObjects([new FrameUint8Array(42)])).to.deep.equal(array);

    body.removeChild(iframe);
  });
});
