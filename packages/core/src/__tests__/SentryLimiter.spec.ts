import { expect } from '@tanker/test-utils';
import { BREADCRUMB_LIMIT, SentryLimiter } from '../SentryLimiter';
import type { Breadcrumb } from '@sentry/types';

describe('SentryLimiter', () => {
  it('adds timestamp on breadcrumbs', async () => {
    // @ts-expect-error Not using a real Hub object
    const limiter = new SentryLimiter({
      addBreadcrumb: (breadcrumb: Breadcrumb) => {
        expect(breadcrumb.timestamp).to.be.a('number');
        expect(breadcrumb.message).to.equal('plop');
      },
    });

    limiter.addBreadcrumb({
      message: 'plop',
      // no timestamp
    });
  });

  it('only keeps the last BREADCRUMB_LIMIT breadcrumbs', async () => {
    let result: Array<Breadcrumb> = [];
    // @ts-expect-error Not using a real Hub object
    const limiter = new SentryLimiter({
      addBreadcrumb: (b: Breadcrumb) => result.push(b),
    });

    const NUM_TO_DROP = 10;
    for (let i = 0; i < BREADCRUMB_LIMIT + NUM_TO_DROP; i += 1) {
      limiter.addBreadcrumb({
        level: 'info',
        message: `${i}`,
      });
    }
    expect(result.length).to.equal(0);

    limiter.flush();
    expect(result.length).to.equal(BREADCRUMB_LIMIT);
    result.forEach((b, idx) => {
      expect(b.level).to.equal('info');
      expect(b.message).to.equal(`${NUM_TO_DROP + idx}`);
    });
  });
});
