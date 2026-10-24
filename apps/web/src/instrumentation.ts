import type { Instrumentation } from 'next';

/** Error reporting (#48), on the Node.js server only and only when it's configured. */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.SENTRY_DSN) {
    const { initErrorReporting } = await import('./server/errors');
    initErrorReporting(process.env.SENTRY_DSN);
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || !process.env.SENTRY_DSN) return;
  const { reportRequestError } = await import('./server/errors');
  reportRequestError(error, request, context);
};
