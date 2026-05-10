// score-notices
// For each company profile, finds notices that haven't been scored yet for
// that company and scores them with Gemini via the Lovable AI Gateway.
// Caps batches at 10 notices/company to stay under the 60s edge timeout.
// run-pipeline calls this in a loop of up to 5 batches.

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { matchesPenalty } from "../_shared/keywords.ts";

const LOVABLE_ENDPOINT =
  "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";
const BATCH_SIZE = 10;

type Company = {
  id: string;
  company_name: string;
  services: string[];
  cpv_codes: string[];
  core_cpv_prefixes: string[];
  boost_keywords: string[];
  penalty_keywords: string[];
  preferred_regions: string[];
  cannot_deliver: string[];
  strengths: string[];
  budget_min: number;
  budget_max: number;
  team_size: number;
};

type Notice = {
  id: string;
  title: string;
  description: string | null;
  buyer: string | null;
  buyer_location: string | null;
  estimated_value: number | null;
  deadline: string | null;
  cpv_codes: string[] | null;
};

function systemPrompt(c: Company) {
  return `You are a tender scoring assistant for a small Norwegian agency.

Agency profile:
- Company: ${c.company_name || "(unnamed)"}
- Services: ${c.services.join(", ") || "n/a"}
- Team size: ${c.team_size} people
- Budget sweet spot: NOK ${c.budget_min} – ${c.budget_max}
- Strengths: ${c.strengths.join(", ") || "n/a"}
- Cannot deliver: ${c.cannot_deliver.join(", ") || "n/a"}
- Preferred regions: ${c.preferred_regions.join(", ") || "No preference"}

Score this tender on FIVE dimensions (0-10 each):

RELEVANCE (0-10): 10=core service, 7=adjacent, 4=tangential, 1=outside.
SIZE_FIT (0-10): 10=in sweet spot, 8=slightly outside, 5=2-3x max, 2=way too big, 0=>10x or unclear.
  If no value stated, estimate from scope and score 5.
WIN_PROBABILITY (0-10): open competition? specific reqs? favors big agencies? achievable for ${c.team_size}?
GEOGRAPHY_FIT (0-10): 10=in preferred region, 7=neighbor, 4=elsewhere in NO, 2=outside NO, 5=unknown.
DEADLINE_COMFORT (0-10): 10=21+ days, 7=14-20, 4=7-13, 1=<7, 0=passed.

CATEGORY: One short Norwegian label (2-3 words) like "Kommunikasjon & PR", "Webutvikling",
"Grafisk design", "Digital markedsføring", "IT-drift", "Strategi & rådgivning",
"Bygg & anlegg", "Helse & omsorg", "Annet". Pick the most precise.

Composite formula:
(relevance × 0.30) + (size_fit × 0.25) + (win_probability × 0.15) + (geography_fit × 0.15) + (deadline_comfort × 0.15)

Return ONLY valid JSON, no prose, no markdown:
{
  "relevance": number, "size_fit": number, "win_probability": number,
  "geography_fit": number, "deadline_comfort": number, "composite": number,
  "category": "string", "summary_no": "string (one sentence in Norwegian)",
  "reasons_to_bid": ["string","string"], "red_flags": ["string"],
  "recommended_action": "BID" | "REVIEW" | "SKIP"
}`;
}

function userPrompt(notice: Notice, c: Company) {
  const desc = (notice.description ?? "").slice(0, 1500);
  const cpvList = (notice.cpv_codes ?? []).join(", ") || "none";
  const titleDesc = `${notice.title} ${notice.description ?? ""}`.toLowerCase();

  const boostHit = c.boost_keywords.some((kw) =>
    kw.trim() && titleDesc.includes(kw.trim().toLowerCase())
  );
  const corePrefixHit = (notice.cpv_codes ?? []).some((cpv) =>
    c.core_cpv_prefixes.some((p) => p && cpv.startsWith(p))
  );

  let extras = "";
  if (boostHit) extras += "\n\nNote: matches a boost keyword.";
  if (corePrefixHit) {
    extras +=
      "\n\nNote: CPV code matches a core prefix for this agency. Score relevance 8-10 unless the description contradicts.";
  }

  return `Title: ${notice.title}
Description: ${desc}
Buyer: ${notice.buyer ?? "n/a"}
Location: ${notice.buyer_location ?? "n/a"}
Estimated value: ${notice.estimated_value ?? "not stated"} NOK
Deadline: ${notice.deadline ?? "n/a"}
CPV codes: ${cpvList}${extras}`;
}

function stripFences(s: string) {
  return s
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

async function callGemini(system: string, user: string): Promise<unknown> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
  const res = await fetch(LOVABLE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Gemini HTTP ${res.status}: ${txt.slice(0, 300)}`);
  }
  const json = await res.json();
  const content: string = json?.choices?.[0]?.message?.content ?? "";
  return JSON.parse(stripFences(content));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = serviceClient();
  let totalScored = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  const { data: companies, error: cErr } = await supabase
    .from("company_profile")
    .select("*");
  if (cErr) {
    return jsonResponse({ error: cErr.message }, { status: 500 });
  }

  for (const company of (companies ?? []) as Company[]) {
    // Find notices not yet scored for this company.
    const { data: scored } = await supabase
      .from("scores")
      .select("notice_id")
      .eq("company_id", company.id);
    const scoredIds = new Set((scored ?? []).map((r) => r.notice_id));

    const { data: candidates, error: nErr } = await supabase
      .from("notices")
      .select(
        "id, title, description, buyer, buyer_location, estimated_value, deadline, cpv_codes",
      )
      .order("fetched_at", { ascending: false })
      .limit(500);
    if (nErr) {
      console.error("[score-notices] fetch notices:", nErr.message);
      continue;
    }

    const queue = (candidates ?? [])
      .filter((n) => !scoredIds.has(n.id))
      .slice(0, BATCH_SIZE);

    for (const notice of queue as Notice[]) {
      const blob = `${notice.title} ${notice.description ?? ""}`;

      // Pre-AI shortcut for explicit penalty matches.
      if (matchesPenalty(blob, company.penalty_keywords)) {
        const { error } = await supabase.from("scores").upsert(
          {
            notice_id: notice.id,
            company_id: company.id,
            relevance: 0,
            size_fit: 5,
            win_probability: 0,
            geography_fit: 5,
            deadline_comfort: 5,
            composite: 1,
            category: "Annet",
            summary_no: "Treffer eksplisitte ekskluderingsnøkkelord.",
            reasons_to_bid: [],
            red_flags: ["Treffer eksplisitte ekskluderingsnøkkelord"],
            recommended_action: "SKIP",
          },
          { onConflict: "notice_id,company_id" },
        );
        if (error) {
          console.error("[score-notices] penalty upsert:", error.message);
          totalErrors++;
        } else {
          totalSkipped++;
        }
        continue;
      }

      try {
        const parsed = await callGemini(
          systemPrompt(company),
          userPrompt(notice, company),
        ) as Record<string, unknown>;

        const action = parsed.recommended_action;
        const validAction =
          action === "BID" || action === "REVIEW" || action === "SKIP"
            ? action
            : "REVIEW";

        const { error } = await supabase.from("scores").upsert(
          {
            notice_id: notice.id,
            company_id: company.id,
            relevance: numOrNull(parsed.relevance),
            size_fit: numOrNull(parsed.size_fit),
            win_probability: numOrNull(parsed.win_probability),
            geography_fit: numOrNull(parsed.geography_fit),
            deadline_comfort: numOrNull(parsed.deadline_comfort),
            composite: numOrNull(parsed.composite),
            category: typeof parsed.category === "string"
              ? parsed.category
              : null,
            summary_no: typeof parsed.summary_no === "string"
              ? parsed.summary_no
              : null,
            reasons_to_bid: Array.isArray(parsed.reasons_to_bid)
              ? parsed.reasons_to_bid
              : [],
            red_flags: Array.isArray(parsed.red_flags) ? parsed.red_flags : [],
            recommended_action: validAction,
          },
          { onConflict: "notice_id,company_id" },
        );
        if (error) {
          console.error("[score-notices] upsert:", error.message);
          totalErrors++;
        } else {
          totalScored++;
        }
      } catch (err) {
        console.error(
          "[score-notices] LLM error for",
          notice.id,
          err instanceof Error ? err.message : String(err),
        );
        totalErrors++;
      }
    }
  }

  return jsonResponse({
    scored: totalScored,
    skipped: totalSkipped,
    errors: totalErrors,
  });
});

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
