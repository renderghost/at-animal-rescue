/**
 * External links used in onboarding. Kept in one place so they're easy to confirm and
 * update (Eurosky's sign-up flow is outside our control; see #11).
 */
export const LINKS = {
  /** Eurosky's page for creating a free account (handle: name.eurosky.social). */
  euroskySignUp: 'https://eurosky.tech/accounts/',
  /** Hosting provider address to enter in Bluesky-compatible apps. */
  euroskyHostingProvider: 'eurosky.social',
  /** Bluesky web app, used to manage app passwords for any Atmosphere account. */
  blueskyApp: 'https://bsky.app',
  appPasswords: 'https://bsky.app/settings/app-passwords',
} as const;
