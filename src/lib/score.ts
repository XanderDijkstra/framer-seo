import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { desc, notInArray } from "drizzle-orm";
import { db, schema } from "./db";
import { matchesPenalty } from "./keywords";
import type { CompanyProfile, Notice } from "./schema";

// Haiku 4.5 — fast, cheap, plenty of headroom for a five-dimension JSON
// classification. Bump to claude-sonnet-4-6 if recall starts to bite.
const MODEL = "claude-haiku-4-5";
export const SCORE_BATCH_SIZE = 10;

const ScoreSchema = z.object({
  relevance: z.number().min(0).max(10),
  size_fit: z.number().min(0).max(10),
  win_probability: z.number().min(0).max(10),
  geography_fit: z.number().min(0).max(10),
  deadline_comfort: z.number().min(0).max(10),
  composite: z.number().min(0).max(10),
  category: z.string(),
  summary_no: z.string(),
  reasons_to_bid: z.array(z.string()),
  red_flags: z.array(z.string()),
  recommended_action: z.enum(["BID", "REVIEW", "SKIP"]),
});

type ScorePayload = z.infer<typeof ScoreSchema>;

let _client: Anthropic | null = null;
function client() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY env var missing");
    }
    _client = new Anthropic();
  }
  return _client;
}

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

summary_no must be one sentence in Norwegian. recommended_action is "BID", "REVIEW", or "SKIP".`;
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

async function callClaude(
  system: string,
  user: string,
): Promise<ScorePayload> {
  const response = await client().messages.parse({
    model: MODEL,
    max_tokens: 2048,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { format: zodOutputFormat(ScoreSchema) },
  });
  if (!response.parsed_output) {
    throw new Error(
      `No parsed output from Claude (stop_reason=${response.stop_reason})`,
    );
  }
  return response.parsed_output;
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
      const parsed = await callClaude(
        systemPrompt(company),
        userPrompt(notice, company),
      );

      const values = {
        noticeId: notice.id,
        relevance: parsed.relevance,
        sizeFit: parsed.size_fit,
        winProbability: parsed.win_probability,
        geographyFit: parsed.geography_fit,
        deadlineComfort: parsed.deadline_comfort,
        composite: parsed.composite,
        category: parsed.category,
        summaryNo: parsed.summary_no,
        reasonsToBid: parsed.reasons_to_bid,
        redFlags: parsed.red_flags,
        recommendedAction: parsed.recommended_action,
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
      if (err instanceof Anthropic.APIError) {
        console.error(
          "[score] Anthropic",
          err.status,
          err.message,
          "for",
          notice.id,
        );
      } else {
        console.error(
          "[score] error for",
          notice.id,
          err instanceof Error ? err.message : String(err),
        );
      }
      errors++;
    }
  }

  return { scored, skipped, errors };
}

export async function clearAllScores(): Promise<void> {
  await db.delete(schema.scores);
}
