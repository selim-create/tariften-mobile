/**
 * The signed-in member's block list, loaded once per session (GET /me/blocks)
 * and kept in memory so every list can hide blocked members' recipes and
 * comments immediately, including pages rendered from token-less responses.
 *
 * Invalidated on block/unblock (updated locally at once, then re-read from
 * Core), on logout (AuthContext calls forgetMemberBlocks) and on an account
 * switch (the owner key changes). Never persisted to disk.
 *
 * Only React's hooks are imported (no React Native), and nothing imports the
 * auth context, so AuthContext can import forgetMemberBlocks without a cycle.
 */

import { useEffect, useSyncExternalStore } from 'react';
import {
  blockMember, getMyBlocks, unblockMember, type MemberBlock,
} from './report-block-api';

export type BlocksStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface BlocksSnapshot {
  /** `${userId}` of the member the list belongs to; null for guests. */
  owner: string | null;
  status: BlocksStatus;
  blocks: MemberBlock[];
  ids: ReadonlySet<number>;
  /** Comments this member reported in this session; hidden on every list. */
  hiddenComments: ReadonlySet<number>;
}

const RETRY_MS = 30_000;
const EMPTY_IDS: ReadonlySet<number> = new Set<number>();

const empty = (owner: string | null = null): BlocksSnapshot => ({
  owner, status: 'idle', blocks: [], ids: EMPTY_IDS, hiddenComments: EMPTY_IDS,
});

const GUEST: BlocksSnapshot = empty();
let snapshot: BlocksSnapshot = GUEST;
let token: string | null = null;
let inflight: Promise<void> | null = null;
let failedAt = 0;
/** Bumps on every invalidation so a late response never overwrites newer state. */
let generation = 0;
const listeners = new Set<() => void>();

function emit(next: BlocksSnapshot) {
  snapshot = next;
  listeners.forEach(listener => listener());
}

function withBlocks(blocks: MemberBlock[], status: BlocksStatus = snapshot.status): BlocksSnapshot {
  return { ...snapshot, status, blocks, ids: new Set(blocks.map(b => b.user_id)) };
}

export function subscribeMemberBlocks(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function peekMemberBlocks(): BlocksSnapshot {
  return snapshot;
}

/** Drops everything (logout). The next member starts from an empty list. */
export function forgetMemberBlocks() {
  generation += 1;
  token = null;
  inflight = null;
  failedAt = 0;
  emit(GUEST);
}

function load(force: boolean): Promise<void> {
  if (!token || !snapshot.owner) return Promise.resolve();
  if (inflight && !force) return inflight;
  if (!force && snapshot.status === 'ready') return Promise.resolve();
  if (!force && snapshot.status === 'error' && Date.now() - failedAt < RETRY_MS) return Promise.resolve();
  const mine = ++generation;
  const jwt = token;
  if (snapshot.status !== 'ready') emit({ ...snapshot, status: 'loading' });
  const request = getMyBlocks(jwt).then(
    ({ blocks }) => { if (mine === generation) emit(withBlocks(blocks, 'ready')); },
    () => {
      if (mine !== generation) return;
      failedAt = Date.now();
      // A failed refresh keeps the list we already had.
      emit({ ...snapshot, status: snapshot.status === 'ready' ? 'ready' : 'error' });
    },
  ).finally(() => { if (inflight === request) inflight = null; });
  inflight = request;
  return request;
}

/**
 * Binds the store to the signed-in member and loads the list once. A different
 * member (account switch) resets it first; guests (null) clear it.
 */
export function ensureMemberBlocks(memberToken: string | null, userId: number | null | undefined): Promise<void> {
  const owner = memberToken && userId ? String(userId) : null;
  if (!owner) {
    if (snapshot.owner) forgetMemberBlocks();
    return Promise.resolve();
  }
  if (snapshot.owner !== owner) {
    generation += 1;
    inflight = null;
    failedAt = 0;
    token = memberToken;
    emit(empty(owner));
  } else {
    token = memberToken;
  }
  return load(false);
}

/** Re-reads the list from Core (Engellenen üyeler, pull to refresh). */
export function refreshMemberBlocks(): Promise<void> {
  return load(true);
}

/**
 * Blocks a member: hidden everywhere at once, then the list is re-read so
 * Core's name/avatar/date replace the local row.
 */
export async function blockAndRemember(
  memberToken: string, author: { id: number; name?: string | null; avatar?: string | null },
): Promise<void> {
  await blockMember(memberToken, author.id);
  if (!snapshot.ids.has(author.id)) {
    const row: MemberBlock = {
      user_id: author.id,
      name: String(author.name ?? '').trim() || 'Tariften üyesi',
      avatar: author.avatar && /^https:\/\//i.test(author.avatar) ? author.avatar : null,
      blocked_at: new Date().toISOString(),
    };
    generation += 1; // any read in flight predates this block
    emit(withBlocks([row, ...snapshot.blocks]));
  }
  void load(true);
}

/** Unblocks a member: visible again at once, then the list is re-read. */
export async function unblockAndForget(memberToken: string, userId: number): Promise<void> {
  await unblockMember(memberToken, userId);
  generation += 1;
  emit(withBlocks(snapshot.blocks.filter(b => b.user_id !== userId)));
  void load(true);
}

/** After a successful report (or a 404) the comment disappears from this session's lists. */
export function hideCommentLocally(commentId: number) {
  if (!Number.isSafeInteger(commentId) || commentId < 1 || snapshot.hiddenComments.has(commentId)) return;
  emit({ ...snapshot, hiddenComments: new Set([...snapshot.hiddenComments, commentId]) });
}

/** The block list for read-only UI; pass null for guests (nothing is fetched). */
export function useMemberBlocks(memberToken: string | null, userId: number | null | undefined): BlocksSnapshot {
  const data = useSyncExternalStore(subscribeMemberBlocks, peekMemberBlocks, peekMemberBlocks);
  useEffect(() => {
    void ensureMemberBlocks(memberToken, userId);
  }, [memberToken, userId]);
  const owner = memberToken && userId ? String(userId) : null;
  // Until the effect binds the store, never show another member's list.
  return owner && data.owner === owner ? data : GUEST;
}
