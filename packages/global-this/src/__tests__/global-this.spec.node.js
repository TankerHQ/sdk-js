// @flow
/* eslint-disable */
import { expect } from '@tanker/test-utils';

import { globalThis, getGlobalThis } from '..';

describe('globalThis', () => {
  it('is always defined', () => {
    expect(globalThis).to.exist; // not null nor undefined
  });

  it('is equal to global', () => {
    expect(globalThis).to.deep.equal(global); // not null nor undefined
  });
});

describe('getGlobalThis', () => {
  it('works in an arrow function', () => {
    expect(getGlobalThis()).to.deep.equal(global);
  });

  it('works in a function', function () {
    expect(getGlobalThis()).to.deep.equal(global);
  });

  it('works in a strict mode arrow function', () => {
    'use-strict';

    expect(getGlobalThis()).to.deep.equal(global);
  });

  it('works in a strict mode function', function () {
    'use-strict';

    expect(getGlobalThis()).to.deep.equal(global);
  });
});
