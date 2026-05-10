// run-pipeline
// Orchestrator for both the dashboard "Kjør pipeline" button and the daily
// pg_cron job. Calls scrape-doffin once, then loops score-notices up to 5
// times so it can score ~50 notices/company without blowing the 60s timeout.

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";

const MAX_SCORE_LOOPS = 5;

async function callFunction(name: string): Promise<unknown> {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${name}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({}),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep as string */
  }
  if (!res.ok) {
    throw new Error(`${name} HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return parsed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // When pg_cron triggers us with no auth header, respect each company's
  // schedule (skip "weekly" companies on non-Monday days).
  const isCron = !req.headers.get("authorization");
  if (isCron) {
    const supabase = serviceClient();
    const { data: companies } = await supabase
      .from("company_profile")
      .select("id, pipeline_schedule");
    const isMonday = new Date().getUTCDay() === 1;
    const eligible = (companies ?? []).filter((c) =>
      c.pipeline_schedule === "daily" ||
      (c.pipeline_schedule === "weekly" && isMonday)
    );
    if (!eligible.length) {
      return jsonResponse({ skipped: true, reason: "no schedule match" });
    }
  }

  const result: Record<string, unknown> = {};

  try {
    result.scrape = await callFunction("scrape-doffin");
  } catch (err) {
    result.scrapeError =
      err instanceof Error ? err.message : String(err);
  }

  let totalScored = 0;
  let totalSkipped = 0;
  for (let i = 0; i < MAX_SCORE_LOOPS; i++) {
    let batch: { scored?: number; skipped?: number; errors?: number } = {};
    try {
      batch = await callFunction("score-notices") as typeof batch;
    } catch (err) {
      result.scoreError =
        err instanceof Error ? err.message : String(err);
      break;
    }
    totalScored += batch.scored ?? 0;
    totalSkipped += batch.skipped ?? 0;
    if ((batch.scored ?? 0) === 0 && (batch.skipped ?? 0) === 0) break;
  }
  result.totalScored = totalScored;
  result.totalSkipped = totalSkipped;

  return jsonResponse(result);
});
