// @flow
import { InvalidArgument } from '@tanker/errors';
import { expect, sinon } from '@tanker/test-utils';

import { ProgressHandler } from '../DataProtection/ProgressHandler';

describe('ProgressHandler', () => {
  it('can report progress knowing the total byte size', async () => {
    const onProgress = sinon.spy();
    const totalBytes = 6;

    const handler = new ProgressHandler({ onProgress });
    expect(onProgress.notCalled).to.be.true;

    handler.start(totalBytes);
    handler.report(2);
    handler.report(1);
    handler.report(3);

    expect(onProgress.callCount).to.equal(4);

    expect(onProgress.args).to.deep.equal([
      [{ currentBytes: 0, totalBytes }],
      [{ currentBytes: 2, totalBytes }],
      [{ currentBytes: 3, totalBytes }],
      [{ currentBytes: 6, totalBytes }],
    ]);
  });

  it('can report progress even if total bytes is zero', async () => {
    const onProgress = sinon.spy();
    const totalBytes = 0;

    const handler = new ProgressHandler({ onProgress });
    expect(onProgress.notCalled).to.be.true;

    handler.start(totalBytes);
    handler.report(0);
    expect(onProgress.callCount).to.equal(2);

    expect(onProgress.args).to.deep.equal([
      [{ currentBytes: 0, totalBytes }],
      [{ currentBytes: 0, totalBytes }],
    ]);
  });

  it('can report progress without a total byte size', async () => {
    const onProgress = sinon.spy();

    const handler = new ProgressHandler({ onProgress });
    expect(onProgress.notCalled).to.be.true;

    handler.start();
    handler.report(2);
    handler.report(1);
    handler.report(3);

    expect(onProgress.callCount).to.equal(4);

    expect(onProgress.args).to.deep.equal([
      [{ currentBytes: 0 }],
      [{ currentBytes: 2 }],
      [{ currentBytes: 3 }],
      [{ currentBytes: 6 }],
    ]);
  });

  it('defaults as a no-op if no onProgress given', async () => {
    const handler = new ProgressHandler({});

    expect(() => {
      handler.start();
      handler.report(2);
      handler.report(1);
      handler.report(3);
    }).not.to.throw();
  });

  it('throws if invalid options given', async () => {
    [
      null,
      () => {},
      { onProgress: false },
      { onProgress: 'on' },
      { onProgress: { progress: () => {} } },
    ].forEach((invalidOptions, i) => {
      // $FlowExpectedError Giving invalid options
      expect(() => new ProgressHandler(invalidOptions), `failed test #${i}`).to.throw(InvalidArgument);
    });
  });
});
