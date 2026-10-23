/** Jetstream event shapes (https://github.com/bluesky-social/jetstream). */
export type JetstreamEvent = CommitEvent | IdentityEvent | AccountEvent;

export interface CommitEvent {
  kind: 'commit';
  did: string;
  time_us: number;
  commit:
    | {
        operation: 'create' | 'update';
        collection: string;
        rkey: string;
        record: Record<string, unknown>;
        cid: string;
        rev: string;
      }
    | { operation: 'delete'; collection: string; rkey: string; rev: string };
}

export interface IdentityEvent {
  kind: 'identity';
  did: string;
  time_us: number;
  identity: { did: string; handle?: string; seq: number; time: string };
}

export interface AccountEvent {
  kind: 'account';
  did: string;
  time_us: number;
  account: { did: string; active: boolean; status?: string; seq: number; time: string };
}

/** The public collections the index needs. Adopter profiles are not indexed in the MVP. */
export const INDEXED_COLLECTIONS = [
  'pet.homeward.org.profile',
  'pet.homeward.animal',
  'pet.homeward.listing',
] as const;
