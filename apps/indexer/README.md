# @homeward/indexer

Follows [Jetstream](https://github.com/bluesky-social/jetstream) for public `pet.homeward.*` records (organisation profiles, animals, listings) and keeps the search index in Postgres up to date (`@homeward/db` `IndexStore`).

```sh
pnpm services:up && pnpm db:migrate
pnpm --filter @homeward/indexer dev   # reads the repository-root .env
```

| Variable                   | Default                                                              |
| -------------------------- | -------------------------------------------------------------------- |
| `DATABASE_URL`             | required                                                             |
| `JETSTREAM_URL`            | `wss://jetstream2.us-east.bsky.network/subscribe`                    |
| `PORT`                     | `8081` (health check at `/health`; 503 when disconnected)            |
| `HANDLE_PROVIDER_SUFFIXES` | `bsky.social,eurosky.social`: handles under these get no domain fact |
| `BSKY_APPVIEW_URL`         | `https://public.api.bsky.app`                                        |
| `EXTRA_VERIFIERS`          | none: DIDs of verifiers to trust beyond Bluesky's own list           |

## Behaviour

- **Untrusted input:** records are converted from JSON and validated against our lexicons. Anything invalid is logged and skipped, never stored.
- **Ordered, at-least-once:** events are handled one at a time. The cursor only advances past an event once it has been handled, and is saved every few seconds and on shutdown. Reconnects rewind 5 seconds, which is safe because every write is idempotent.
- **Failures:** if handling an event fails (e.g. the database is down), the connection is abandoned, anything queued is dropped, and the reconnect replays from the last handled event, so nothing is skipped.
- **Accounts:** deactivated, suspended, taken-down or deleted accounts are removed from the index. Handle changes are followed, and handles are only stored after a bidirectional check.
- **Efficiency:** network-wide identity and account events for accounts not in the index are ignored without touching the database.

## Checked facts (#29)

Organisation pages show facts, never a "verified" badge. The indexer checks them when a profile or identity changes, and again about once a day (it looks hourly for facts older than a day). A check that fails, for example because a server is down, keeps the previous result rather than erasing it.

- **Domain:** the handle is the organisation's own domain and points back to the account, by DNS or HTTPS, checked both ways. Handles under a hosting provider (`HANDLE_PROVIDER_SUFFIXES`) prove nothing about the organisation, so they get no fact.
- **Bluesky verification:** valid `app.bsky.graph.verification` records by the verifiers Bluesky trusts, as reported by the AppView (which also checks they're still valid). `EXTRA_VERIFIERS` adds verifiers Bluesky doesn't list, such as an EU body. Their records are read from their own repositories and count only while the organisation's handle and display name still match what they verified.

Jetstream's public instances are run by Bluesky in the US. For EU data residency we can self-host Jetstream next to the indexer (#47); only `JETSTREAM_URL` changes.
