import * as Sentry from '@sentry/node';
import type { Instrumentation } from 'next';
import { redactPath } from '@/lib/analytics';

type ErrorEvent = Parameters<NonNullable<Sentry.NodeOptions['beforeSend']>>[0];

/**
 * What an error report may carry (#48): the error, the route and a path with any share-link
 * secret redacted. Never cookies, headers, bodies, query strings, users or breadcrumbs.
 */
export function scrubEvent<T extends ErrorEvent>(event: T): T {
  delete event.user;
  event.breadcrumbs = [];
  if (event.request) {
    const url = event.request.url?.split('?')[0];
    event.request = {
      ...(url && { url: redactPath(url) }),
      ...(event.request.method && { method: event.request.method }),
    };
  }
  return event;
}

/** Server errors to self-hosted Bugsink, through the Sentry SDK, when SENTRY_DSN is set. */
export function initErrorReporting(dsn: string): void {
  Sentry.init({
    dsn,
    release: process.env.IMAGE_TAG,
    environment: process.env.SENTRY_ENVIRONMENT || 'production',
    // Nothing about the person or their request: no user, cookies, headers, bodies or queries.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    // Errors only: no tracing, and none of the integrations that record requests, console
    // output or outgoing fetches, which can hold personal data. Next itself handles crashes.
    defaultIntegrations: false,
    integrations: [
      Sentry.functionToStringIntegration(),
      Sentry.linkedErrorsIntegration(),
      Sentry.dedupeIntegration(),
      Sentry.contextLinesIntegration(),
      Sentry.nodeContextIntegration(),
    ],
    maxBreadcrumbs: 0,
    beforeSend: scrubEvent,
  });
}

/** A request that failed on the server, from Next's onRequestError hook. */
export function reportRequestError(
  error: unknown,
  request: Parameters<Instrumentation.onRequestError>[1],
  context: Parameters<Instrumentation.onRequestError>[2],
): void {
  Sentry.withScope((scope) => {
    scope.setTag('route', context.routePath);
    scope.setTag('routeType', context.routeType);
    scope.setTag('method', request.method);
    scope.setContext('request', { path: redactPath(request.path.split('?')[0]!) });
    Sentry.captureException(error);
  });
}
