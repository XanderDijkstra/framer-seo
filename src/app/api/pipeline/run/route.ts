import { NextResponse } from "next/server";
import { scrapeDoffin } from "@/lib/doffin";
import { scoreNoticesBatch } from "@/lib/score";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SCORE_LOOPS = 5;

export async function POST() {
  const result: Record<string, unknown> = {};

  try {
    result.scrape = await scrapeDoffin();
  } catch (err) {
    result.scrapeError = err instanceof Error ? err.message : String(err);
  }

  let totalScored = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  for (let i = 0; i < MAX_SCORE_LOOPS; i++) {
    try {
      const batch = await scoreNoticesBatch();
      totalScored += batch.scored;
      totalSkipped += batch.skipped;
      totalErrors += batch.errors;
      if (batch.scored === 0 && batch.skipped === 0) break;
    } catch (err) {
      result.scoreError = err instanceof Error ? err.message : String(err);
      break;
    }
  }
  result.totalScored = totalScored;
  result.totalSkipped = totalSkipped;
  result.totalErrors = totalErrors;

  return NextResponse.json(result);
}
