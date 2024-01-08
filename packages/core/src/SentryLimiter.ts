import type { Breadcrumb, Hub } from '@sentry/types';

export const BREADCRUMB_LIMIT = 20;

export class SentryLimiter {
  breadcrumbs: Array<Breadcrumb>;
  sentryHub: Hub;

  constructor(sentryHub: Hub) {
    this.breadcrumbs = [];
    this.sentryHub = sentryHub;
  }

  addBreadcrumb = (breadcrumb: Breadcrumb) => {
    if (this.breadcrumbs.length == BREADCRUMB_LIMIT)
      this.breadcrumbs.shift();

    this.breadcrumbs.push({
      timestamp: Math.floor(Date.now() / 1000),
      ...breadcrumb,
    });
  };

  flush = () => {
    for (const breadcrumb of this.breadcrumbs)
      this.sentryHub.addBreadcrumb(breadcrumb, undefined);
    this.breadcrumbs = [];
  };
}
