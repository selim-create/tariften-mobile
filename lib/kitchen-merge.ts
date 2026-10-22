/**
 * Three-way merge for the "Bu Hafta" / "Alışveriş" document, shared by the app
 * and the web (keep both copies identical). Pure: no React, no I/O.
 *
 * base   = the last copy both sides agreed on (what the server had at the last sync)
 * local  = this device's current copy
 * remote = the server's current copy
 *
 * Rules per keyed row (plan by id, shopping by recipeId, manual by key) and
 * for checked keys:
 *   - on both sides          → kept (the side that changed it since base wins;
 *                              if both changed it, the newer addedAt wins)
 *   - only on one side, new  → kept (added on that side)
 *   - only on one side, but
 *     it was in base         → removed (deleted on the other side)
 * So nothing added anywhere is lost and nothing deleted anywhere comes back.
 */

export type MergePlan = { id: string; recipeId: number; slug: string; title: string; image?: string; day: string; addedAt: number };
export type MergeShopping = {
  recipeId: number; slug: string; title: string; servings?: number | null;
  ingredients: { name: string; amount: string; unit: string }[]; addedAt: number;
};
export type MergeManual = { key: string; name: string; addedAt: number };
export type MergeDoc = { version: 1; plan: MergePlan[]; shopping: MergeShopping[]; manual: MergeManual[]; checked: string[] };

export const EMPTY_DOC: MergeDoc = { version: 1, plan: [], shopping: [], manual: [], checked: [] };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function mergeKeyed<T extends { addedAt: number }>(
  base: T[], local: T[], remote: T[], keyOf: (row: T) => string,
): T[] {
  const b = new Map(base.map(r => [keyOf(r), r]));
  const l = new Map(local.map(r => [keyOf(r), r]));
  const s = new Map(remote.map(r => [keyOf(r), r]));
  const out: T[] = [];
  for (const key of new Set([...s.keys(), ...l.keys()])) {
    const inB = b.has(key), lr = l.get(key), sr = s.get(key);
    if (lr && sr) {
      const base = b.get(key);
      const localChanged = !base || !same(lr, base);
      const remoteChanged = !base || !same(sr, base);
      if (localChanged && !remoteChanged) out.push(lr);
      else if (remoteChanged && !localChanged) out.push(sr);
      else out.push(lr.addedAt > sr.addedAt ? lr : sr);
    } else if (lr && !inB) out.push(lr);        // added here
    else if (sr && !inB) out.push(sr);         // added elsewhere
    // else: was in base and is missing on one side → deleted there
  }
  return out.sort((x, y) => x.addedAt - y.addedAt);
}

function mergeSet(base: string[], local: string[], remote: string[]): string[] {
  const b = new Set(base), l = new Set(local), s = new Set(remote);
  const out = [...new Set([...remote, ...local])].filter(k => {
    if (l.has(k) && s.has(k)) return true;
    return !b.has(k); // only on one side: keep if newly checked, drop if unchecked on the other
  });
  return out.sort();
}

export function mergeKitchen(base: MergeDoc | null, local: MergeDoc, remote: MergeDoc): MergeDoc {
  const b = base ?? EMPTY_DOC;
  return {
    version: 1,
    plan: mergeKeyed(b.plan, local.plan, remote.plan, r => r.id),
    shopping: mergeKeyed(b.shopping, local.shopping, remote.shopping, r => String(r.recipeId)),
    manual: mergeKeyed(b.manual, local.manual, remote.manual, r => r.key),
    checked: mergeSet(b.checked, local.checked, remote.checked),
  };
}

/** Order-insensitive equality, so a merge that changes nothing does not write. */
export function sameKitchen(a: MergeDoc, b: MergeDoc): boolean {
  const norm = (d: MergeDoc) => ({
    plan: [...d.plan].sort((x, y) => x.id.localeCompare(y.id)),
    shopping: [...d.shopping].sort((x, y) => x.recipeId - y.recipeId),
    manual: [...d.manual].sort((x, y) => x.key.localeCompare(y.key)),
    checked: [...d.checked].sort(),
  });
  return same(norm(a), norm(b));
}
