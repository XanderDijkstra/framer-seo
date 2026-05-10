import "server-only";
import { desc, notInArray } from "drizzle-orm";
import { db, schema } from "./db";
import { matchesPenalty } from "./keywords";
import type { CompanyProfile, Notice } from "./schema";

const LOVABLE_ENDPOINT =
  "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";
export const SCORE_BATCH_SIZE = 10;

function systemPrompt(c: CompanyProfile) {
  return `You are a tender scoring assistant for a small Norwegian agency.

Agency profile:
- Company: ${c.companyName || "(unnamed)"}
- Services: ${c.services.join(", ") || "n/a"}
- Team size: ${c.teamSize} people
- Budget sweet spot: NOK ${c.budgetMin} – ${c.budgetMax}
- Strengths: ${c.strengths.join(", ") || "n/a"}
- Cannot deliver: ${c.cannotDeliver.join(", ") || "n/a"}
- Preferred regions: ${c.preferredRegions.join(", ") || "No preference"}

Score this tender on FIVE dimensions (0-10 each):

RELEVANCE (0-10): 10=core service, 7=adjacent, 4=tangential, 1=outside.
SIZE_FIT (0-10): 10=in sweet spot, 8=slightly outside, 5=2-3x max, 2=way too big, 0=>10x or unclear.
  If no value stated, estimate from scope and score 5.
WIN_PROBABILITY (0-10): open competition? specific reqs? favors big agencies? achievable for ${c.teamSize}?
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

function userPrompt(notice: Notice, c: CompanyProfile) {
  const desc = (notice.description ?? "").slice(0, 1500);
  const cpvList = (notice.cpvCodes ?? []).join(", ") || "none";
  const titleDesc = `${notice.title} ${notice.description ?? ""}`.toLowerCase();

  const boostHit = c.boostKeywords.some(
    (kw) => kw.trim() && titleDesc.includes(kw.trim().toLowerCase()),
  );
  const corePrefixHit = (notice.cpvCodes ?? []).some((cpv) =>
    c.coreCpvPrefixes.some((p) => p && cpv.startsWith(p)),
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
Location: ${notice.buyerLocation ?? "n/a"}
Estimated value: ${notice.estimatedValue ?? "not stated"} NOK
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
  const apiKey = process.env.LOVABLE_API_KEY;
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

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export type ScoreBatchResult = {
  scored: number;
  skipped: number;
  errors: number;
};

export async function scoreNoticesBatch(): Promise<ScoreBatchResult> {
  const company = await db.query.companyProfile.findFirst();
  if (!company) {
    return { scored: 0, skipped: 0, errors: 0 };
  }

  // Find notices that don't have a score yet, newest first.
  const scoredRows = await db
    .select({ id: schema.scores.noticeId })
    .from(schema.scores);
  const scoredIds = scoredRows.map((r) => r.id);

  const queue = await db
    .select()
    .from(schema.notices)
    .where(
      scoredIds.length
        ? notInArray(schema.notices.id, scoredIds)
        : undefined,
    )
    .orderBy(desc(schema.notices.fetchedAt))
    .limit(SCORE_BATCH_SIZE);

  let scored = 0;
  let skipped = 0;
  let errors = 0;

  for (const notice of queue) {
    const blob = `${notice.title} ${notice.description ?? ""}`;

    if (matchesPenalty(blob, company.penaltyKeywords)) {
      try {
        await db
          .insert(schema.scores)
          .values({
            noticeId: notice.id,
            relevance: 0,
            sizeFit: 5,
            winProbability: 0,
            geographyFit: 5,
            deadlineComfort: 5,
            composite: 1,
            category: "Annet",
            summaryNo: "Treffer eksplisitte ekskluderingsnøkkelord.",
            reasonsToBid: [],
            redFlags: ["Treffer eksplisitte ekskluderingsnøkkelord"],
            recommendedAction: "SKIP",
          })
          .onConflictDoUpdate({
            target: schema.scores.noticeId,
            set: {
              recommendedAction: "SKIP",
              composite: 1,
              summaryNo: "Treffer eksplisitte ekskluderingsnøkkelord.",
              scoredAt: new Date(),
            },
          });
        skipped++;
      } catch (err) {
        console.error("[score] penalty upsert", err);
        errors++;
      }
      continue;
    }

    try {
      const parsed = (await callGemini(
        systemPrompt(company),
        userPrompt(notice, company),
      )) as Record<string, unknown>;

      const action = parsed.recommended_action;
      const validAction =
        action === "BID" || action === "REVIEW" || action === "SKIP"
          ? action
          : "REVIEW";

      const values = {
        noticeId: notice.id,
        relevance: numOrNull(parsed.relevance),
        sizeFit: numOrNull(parsed.size_fit),
        winProbability: numOrNull(parsed.win_probability),
        geographyFit: numOrNull(parsed.geography_fit),
        deadlineComfort: numOrNull(parsed.deadline_comfort),
        composite: numOrNull(parsed.composite),
        category:
          typeof parsed.category === "string" ? parsed.category : null,
        summaryNo:
          typeof parsed.summary_no === "string" ? parsed.summary_no : null,
        reasonsToBid: Array.isArray(parsed.reasons_to_bid)
          ? (parsed.reasons_to_bid as string[])
          : [],
        redFlags: Array.isArray(parsed.red_flags)
          ? (parsed.red_flags as string[])
          : [],
        recommendedAction: validAction as "BID" | "REVIEW" | "SKIP",
      };

      await db
        .insert(schema.scores)
        .values(values)
        .onConflictDoUpdate({
          target: schema.scores.noticeId,
          set: {
            relevance: values.relevance,
            sizeFit: values.sizeFit,
            winProbability: values.winProbability,
            geographyFit: values.geographyFit,
            deadlineComfort: values.deadlineComfort,
            composite: values.composite,
            category: values.category,
            summaryNo: values.summaryNo,
            reasonsToBid: values.reasonsToBid,
            redFlags: values.redFlags,
            recommendedAction: values.recommendedAction,
            scoredAt: new Date(),
          },
        });
      scored++;
    } catch (err) {
      console.error(
        "[score] LLM error for",
        notice.id,
        err instanceof Error ? err.message : String(err),
      );
      errors++;
    }
  }

  return { scored, skipped, errors };
}

// Wipe all existing scores so the next batch starts fresh.
export async function clearAllScores(): Promise<void> {
  await db.delete(schema.scores);
}
