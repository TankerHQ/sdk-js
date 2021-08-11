/* eslint-disable */
import { expect } from '@tanker/test-utils';

import { globalThis, getGlobalThis } from '..';

describe('globalThis', () => {
  it('is always defined', () => {
    expect(globalThis).to.exist; // not null nor undefined
  });

  it('is equal to window', () => {
    expect(globalThis).to.deep.equal(window);
  });

  it('is equal to self', () => {
    expect(globalThis).to.deep.equal(self);
  });
});

describe('getGlobalThis', () => {
  it('works in an arrow function', () => {
    expect(getGlobalThis()).to.deep.equal(self);
  });

  it('works in a function', function () {
    expect(getGlobalThis()).to.deep.equal(self);
  });

  it('works in a strict mode arrow function', () => {
    'use-strict';

    expect(getGlobalThis()).to.deep.equal(self);
  });

  it('works in a strict mode function', function () {
    'use-strict';

    expect(getGlobalThis()).to.deep.equal(self);
  });
});