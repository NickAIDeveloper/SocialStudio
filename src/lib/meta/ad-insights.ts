// src/lib/meta/ad-insights.ts
// Read-side Meta insights client for ads. Stateless, plaintext token, best-effort
// (a failed ad maps to null so the dashboard still renders). Mirrors ads.ts.

const META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

export interface AdInsight {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  inlineLinkClicks: number;
  ctr: number; // percent
  cpc: number;
  frequency: number;
  results: number;
  resultType: string;
  currency: string | null;
}

type MetaAction = { action_type: string; value: string };

const RESULT_TYPE: Record<string, string> = {
  OUTCOME_TRAFFIC: 'link_click',
  OUTCOME_ENGAGEMENT: 'post_engagement',
  OUTCOME_LEADS: 'link_click',
  OUTCOME_APP_PROMOTION: 'mobile_app_install',
};

const RESULT_FALLBACK: Record<string, string[]> = {
  link_click: ['landing_page_view', 'inline_link_click'],
  mobile_app_install: ['app_install', 'omni_app_install'],
};

export function resultTypeForObjective(metaObjective: string): string {
  return RESULT_TYPE[metaObjective] ?? 'link_click';
}

export function extractResult(actions: MetaAction[] | undefined, type: string): number {
  const list = actions ?? [];
  const direct = list.find((a) => a.action_type === type);
  if (direct) return Number(direct.value) || 0;
  for (const alt of RESULT_FALLBACK[type] ?? []) {
    const hit = list.find((a) => a.action_type === alt);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
}

const FIELDS = [
  'spend', 'impressions', 'reach', 'clicks', 'inline_link_clicks',
  'ctr', 'cpc', 'frequency', 'actions', 'account_currency',
].join(',');

export async function getAdInsights(
  accessToken: string,
  adIds: string[],
  metaObjective: string,
  datePreset: string,
): Promise<Record<string, AdInsight | null>> {
  const type = resultTypeForObjective(metaObjective);
  const entries = await Promise.all(
    adIds.map(async (id) => {
      try {
        const u = new URL(`${GRAPH_BASE}/${id}/insights`);
        u.searchParams.set('fields', FIELDS);
        u.searchParams.set('date_preset', datePreset);
        u.searchParams.set('access_token', accessToken);
        const res = await fetch(u, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return [id, null] as const;
        const j = (await res.json()) as { data?: Array<Record<string, unknown>> };
        const row = j.data?.[0];
        if (!row) return [id, null] as const;
        const num = (v: unknown) => Number(v ?? 0) || 0;
        const insight: AdInsight = {
          spend: num(row.spend),
          impressions: num(row.impressions),
          reach: num(row.reach),
          clicks: num(row.clicks),
          inlineLinkClicks: num(row.inline_link_clicks),
          ctr: num(row.ctr),
          cpc: num(row.cpc),
          frequency: num(row.frequency),
          results: extractResult(row.actions as MetaAction[] | undefined, type),
          resultType: type,
          currency: (row.account_currency as string) ?? null,
        };
        return [id, insight] as const;
      } catch {
        return [id, null] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}
