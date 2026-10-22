import type messages from '../messages/en.json';

// Type-checks message keys across the app. Locale is a formatting locale (e.g. en-NL).
declare module 'next-intl' {
  interface AppConfig {
    Messages: typeof messages;
  }
}
