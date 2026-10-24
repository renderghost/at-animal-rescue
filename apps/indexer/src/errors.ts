import * as Sentry from '@sentry/node';

/**
 * Errors to self-hosted Bugsink (#48) through the Sentry SDK, when SENTRY_DSN is set: the
 * error and its context only, never user data or breadcrumbs.
 */
export function initErrorReporting(dsn: string | undefined): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    release: process.env.IMAGE_TAG,
    environment: process.env.SENTRY_ENVIRONMENT || 'production',
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    // Errors only, including crashes; nothing that records network calls or console output.
    defaultIntegrations: false,
    integrations: [
      Sentry.functionToStringIntegration(),
      Sentry.linkedErrorsIntegration(),
      Sentry.dedupeIntegration(),
      Sentry.contextLinesIntegration(),
      Sentry.nodeContextIntegration(),
      Sentry.onUncaughtExceptionIntegration(),
      Sentry.onUnhandledRejectionIntegration(),
    ],
    maxBreadcrumbs: 0,
  });
}

/** Reports an error with what was happening; a no-op when reporting isn't set up. */
export function reportError(error: unknown, context: Record<string, unknown>): void {
  Sentry.withScope((scope) => {
    scope.setContext('indexer', context);
    Sentry.captureException(error);
  });
}

/** Sends what's queued before the process exits. */
export const flushErrors = () => Sentry.flush(2000);
