// @flow
import { expect } from '@tanker/test-utils';

import { fixObjects } from '../transform';

describe('datastore transform operations (web)', () => {
  declare function notNull<T>(body: T | null): T; // eslint-disable-line no-unused-vars

  it('should fix Uint8Array constructor when calling fixObjects on objects of another frame', () => {
    const iframe = document.createElement('iframe');
    let { body } = document; // eslint-disable-line prefer-const
    /*:: body = notNull(body); */
    body.appendChild(iframe);

    const FrameUint8Array = iframe.contentWindow.Uint8Array;

    const obj = { key: new Uint8Array(42) };
    const array = [new Uint8Array(42)];

    expect(fixObjects({ key: new FrameUint8Array(42) })).to.deep.equal(obj);
    expect(fixObjects([new FrameUint8Array(42)])).to.deep.equal(array);

    body.removeChild(iframe);
  });
});
