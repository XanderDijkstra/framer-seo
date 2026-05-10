import { NextResponse } from "next/server";
import { scrapeDoffin } from "@/lib/doffin";
import { scoreNoticesBatch } from "@/lib/score";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300; // Vercel Pro: up to 300s on cron

const MAX_SCORE_LOOPS = 5;

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Reject anything else.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev convenience — in prod, set CRON_SECRET
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Honour pipeline_schedule: skip if today doesn't match.
  const company = await db.query.companyProfile.findFirst();
  if (!company) {
    return NextResponse.json({ skipped: true, reason: "no company yet" });
  }
  if (company.pipelineSchedule === "weekly") {
    const isMonday = new Date().getUTCDay() === 1;
    if (!isMonday) {
      return NextResponse.json({ skipped: true, reason: "weekly: not Monday" });
    }
  }

  const result: Record<string, unknown> = {};
  try {
    result.scrape = await scrapeDoffin();
  } catch (err) {
    result.scrapeError = err instanceof Error ? err.message : String(err);
  }
  let totalScored = 0;
  let totalSkipped = 0;
  for (let i = 0; i < MAX_SCORE_LOOPS; i++) {
    try {
      const batch = await scoreNoticesBatch();
      totalScored += batch.scored;
      totalSkipped += batch.skipped;
      if (batch.scored === 0 && batch.skipped === 0) break;
    } catch (err) {
      result.scoreError = err instanceof Error ? err.message : String(err);
      break;
    }
  }
  result.totalScored = totalScored;
  result.totalSkipped = totalSkipped;
  return NextResponse.json(result);
}
