import "server-only";
import { db, schema } from "./db";

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
    console.error("[doffin] HTTP", res.status, url, txt.slice(0, 300));
    return [];
  }
  const json = (await res.json().catch(() => null)) as
    | { hits?: DoffinHit[]; results?: DoffinHit[] }
    | null;
  if (!json) return [];
  return json.hits ?? json.results ?? [];
}

function mapHit(hit: DoffinHit): typeof schema.notices.$inferInsert | null {
  const id = hit.id ?? hit.noticeId;
  if (!id) return null;
  const title = hit.heading ?? hit.title ?? "(uten tittel)";
  const buyer = (hit.buyer ?? [])
    .map((b) => b?.name)
    .filter(Boolean)
    .join(", ");
  const buyerLocation = (hit.locationId ?? []).filter(Boolean).join(", ");
  return {
    id,
    title,
    description: hit.description ?? null,
    buyer: buyer || null,
    buyerLocation: buyerLocation || null,
    estimatedValue: hit.estimatedValue?.amount ?? null,
    currency: hit.estimatedValue?.currency ?? "NOK",
    deadline: hit.deadline ?? null,
    cpvCodes: hit.cpvCodes ?? [],
    noticeType: hit.noticeType ?? null,
    url: hit.doffinClassicUrl ?? null,
    rawJson: hit as unknown as Record<string, unknown>,
  };
}

export type ScrapeResult = {
  totalNew: number;
  totalSkipped: number;
  cpvCount: number;
  keywordCount: number;
  note?: string;
};

export async function scrapeDoffin(): Promise<ScrapeResult> {
  const apiKey = process.env.DOFFIN_API_KEY;
  if (!apiKey) throw new Error("DOFFIN_API_KEY env var missing");

  // Aggregate CPV codes + keywords across every company profile.
  const companies = await db
    .select({
      cpvCodes: schema.companyProfile.cpvCodes,
      searchKeywords: schema.companyProfile.searchKeywords,
    })
    .from(schema.companyProfile);

  const cpvSet = new Set<string>();
  const keywordSet = new Set<string>();
  for (const row of companies) {
    for (const cpv of row.cpvCodes ?? []) {
      if (typeof cpv === "string" && cpv.trim()) cpvSet.add(cpv.trim());
    }
    const kw = row.searchKeywords ?? "";
    for (const part of kw.split(/\s+OR\s+/i)) {
      const trimmed = part.trim();
      if (trimmed) keywordSet.add(trimmed);
    }
  }

  if (!cpvSet.size && !keywordSet.size) {
    return {
      totalNew: 0,
      totalSkipped: 0,
      cpvCount: 0,
      keywordCount: 0,
      note: "No company profile with CPV codes or search keywords yet.",
    };
  }

  const issueDateFrom = thirtyDaysAgo();
  const seen = new Map<string, NonNullable<ReturnType<typeof mapHit>>>();

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

  const rows = [...seen.values()];

  // Insert with ON CONFLICT DO NOTHING; count the rows actually inserted.
  let totalNew = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const inserted = await db
      .insert(schema.notices)
      .values(chunk)
      .onConflictDoNothing({ target: schema.notices.id })
      .returning({ id: schema.notices.id });
    totalNew += inserted.length;
  }

  return {
    totalNew,
    totalSkipped: rows.length - totalNew,
    cpvCount: cpvSet.size,
    keywordCount: keywordSet.size,
  };
}
