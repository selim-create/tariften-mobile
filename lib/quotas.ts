/**
 * Authenticated, server-authoritative per-account quotas.
 * Never infer usage from local counter, since web and mobile share one ledger.
 */
import { useCallback, useEffect, useState } from "react";

export type QuotaKind = "menu_month" | "recipe_day" | "recipe_ai_day";
export type QuotaState = {
  limit: number | null;
  used: number;
  remaining: number | null;
  reset_at: string;
  available: boolean;
};
export type AccountQuotas = { success: true; tier: 'administrator' | 'internal' | 'standard' | 'free'; quotas: Record<QuotaKind, QuotaState> };
const BASE = "https://api.tariften.com/wp-json/tariften/v1";

export async function fetchAccountQuotas(token: string): Promise<AccountQuotas> {
  const res = await fetch(`${BASE}/account/quotas`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  const payload: unknown = await res.json();
  if (!res.ok || !payload || typeof payload !== "object" || !("success" in payload) || payload.success !== true) {
    const msg = payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string" ? payload.message : "Kullanım hakları alınamadı.";
    throw new Error(msg);
  }
  const data = payload as AccountQuotas;
  if (!data.quotas?.menu_month || !data.quotas?.recipe_day || !data.quotas?.recipe_ai_day) throw new Error("Kota bilgileri eksik.");
  return data;
}

export function reached(quota: AccountQuotas | null, kind: QuotaKind) {
  const value = quota?.quotas?.[kind];
  return !!value && value.available && value.remaining !== null && value.remaining <= 0;
}
export function resetDate(quota: AccountQuotas | null, kind: QuotaKind): string {
  const raw = quota?.quotas?.[kind]?.reset_at;
  if (!raw) return "";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
}

export function useQuotas(token: string | null) {
  const [data, setData] = useState<AccountQuotas | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    if (!token) { setData(null); setError(""); return null; }
    setLoading(true);
    try {
      const result = await fetchAccountQuotas(token);
      setData(result);
      setError("");
      return result;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Kullanım haklarına ulaşılamadı.");
      setData(null);
      return null;
    } finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { data, error, loading, refresh };
}
