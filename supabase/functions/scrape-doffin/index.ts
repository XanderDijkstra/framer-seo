// scrape-doffin
// Pulls active tenders from the Doffin v2 API and inserts new ones into
// `public.notices`. Aggregates CPV codes and keywords across every company
// profile in the tenant — Doffin data is public, so the cache is shared.
//
// Doffin quirks we learned the hard way:
//  - searchString does NOT support OR. Run one HTTP request per keyword.
//  - cpvCode is a repeatable query param — pass many in one call.
//  - Pagination is 1-indexed.

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";

const DOFFIN_BASE =
  "https://dof-notices-prod-api.azure-api.net/public/v2/search";

type DoffinHit = {
  id?: string;
  noticeId?: string;
  heading?: string;
  title?: string;
  description?: string;
  buyer?: Array<{ name?: string }>;
  locationId?: string[];
  estimatedValue?: { amount?: number; currency?: string };
  deadline?: string;
  cpvCodes?: string[];
  noticeType?: string;
  doffinClassicUrl?: string;
};

function thirtyDaysAgo(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 30);
  return d.toISOString().slice(0, 10);
}

async function doffinFetch(
  apiKey: string,
  params: URLSearchParams,
): Promise<DoffinHit[]> {
  const url = `${DOFFIN_BASE}?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      "Ocp-Apim-Subscription-Key": apiKey,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error("[scrape-doffin] HTTP", res.status, url, txt.slice(0, 300));
    return [];
  }
  const json = await res.json().catch(() => null) as
    | { hits?: DoffinHit[]; results?: DoffinHit[] }
    | null;
  if (!json) return [];
  return json.hits ?? json.results ?? [];
}

function mapHit(hit: DoffinHit) {
  const id = hit.id ?? hit.noticeId;
  if (!id) return null;
  const title = hit.heading ?? hit.title ?? "(uten tittel)";
  const buyer = (hit.buyer ?? [])
    .map((b) => b?.name)
    .filter(Boolean)
    .join(", ");
  const buyer_location = (hit.locationId ?? []).filter(Boolean).join(", ");
  return {
    id,
    title,
    description: hit.description ?? null,
    buyer: buyer || null,
    buyer_location: buyer_location || null,
    estimated_value: hit.estimatedValue?.amount ?? null,
    currency: hit.estimatedValue?.currency ?? "NOK",
    deadline: hit.deadline ?? null,
    cpv_codes: hit.cpvCodes ?? [],
    notice_type: hit.noticeType ?? null,
    url: hit.doffinClassicUrl ?? null,
    raw_json: hit,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const apiKey = Deno.env.get("DOFFIN_API_KEY");
  if (!apiKey) {
    return jsonResponse({ error: "DOFFIN_API_KEY not set" }, { status: 500 });
  }

  const supabase = serviceClient();

  // Aggregate CPV codes + keywords across every company profile.
  const { data: companies, error: cErr } = await supabase
    .from("company_profile")
    .select("cpv_codes, search_keywords");
  if (cErr) {
    return jsonResponse({ error: cErr.message }, { status: 500 });
  }

  const cpvSet = new Set<string>();
  const keywordSet = new Set<string>();
  for (const row of companies ?? []) {
    for (const cpv of row.cpv_codes ?? []) {
      if (typeof cpv === "string" && cpv.trim()) cpvSet.add(cpv.trim());
    }
    const kw = (row.search_keywords ?? "").toString();
    for (const part of kw.split(/\s+OR\s+/i)) {
      const trimmed = part.trim();
      if (trimmed) keywordSet.add(trimmed);
    }
  }

  if (!cpvSet.size && !keywordSet.size) {
    return jsonResponse({
      totalNew: 0,
      totalSkipped: 0,
      note: "No company profiles with CPV codes or search keywords yet.",
    });
  }

  const issueDateFrom = thirtyDaysAgo();
  const seen = new Map<string, ReturnType<typeof mapHit>>();

  // Pass 1: a single CPV-filtered request with all codes appended.
  if (cpvSet.size) {
    const params = new URLSearchParams();
    params.set("status", "ACTIVE");
    params.set("issueDateFrom", issueDateFrom);
    params.set("numHitsPerPage", "100");
    params.set("page", "1");
    for (const code of cpvSet) params.append("cpvCode", code);
    const hits = await doffinFetch(apiKey, params);
    for (const hit of hits) {
      const mapped = mapHit(hit);
      if (mapped && !seen.has(mapped.id)) seen.set(mapped.id, mapped);
    }
  }

  // Pass 2: one request per keyword (Doffin doesn't honour OR).
  for (const kw of keywordSet) {
    const params = new URLSearchParams();
    params.set("status", "ACTIVE");
    params.set("issueDateFrom", issueDateFrom);
    params.set("numHitsPerPage", "50");
    params.set("page", "1");
    params.set("searchString", kw);
    const hits = await doffinFetch(apiKey, params);
    for (const hit of hits) {
      const mapped = mapHit(hit);
      if (mapped && !seen.has(mapped.id)) seen.set(mapped.id, mapped);
    }
  }

  // Insert new rows; ignore duplicates by id.
  let totalNew = 0;
  let totalSkipped = 0;
  const rows = [...seen.values()].filter(Boolean) as Array<
    NonNullable<ReturnType<typeof mapHit>>
  >;

  // Fetch existing ids in chunks so we don't blow the URL length.
  const existingIds = new Set<string>();
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map((r) => r.id);
    const { data: existing } = await supabase
      .from("notices")
      .select("id")
      .in("id", chunk);
    for (const row of existing ?? []) existingIds.add(row.id as string);
  }

  const toInsert = rows.filter((r) => !existingIds.has(r.id));
  totalSkipped = rows.length - toInsert.length;

  for (let i = 0; i < toInsert.length; i += 100) {
    const chunk = toInsert.slice(i, i + 100);
    const { error } = await supabase.from("notices").insert(chunk);
    if (error) {
      console.error("[scrape-doffin] insert error", error.message);
      continue;
    }
    totalNew += chunk.length;
  }

  return jsonResponse({
    totalNew,
    totalSkipped,
    cpvCount: cpvSet.size,
    keywordCount: keywordSet.size,
  });
});
