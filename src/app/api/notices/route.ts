import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { matchesPenalty } from "@/lib/keywords";

export const runtime = "nodejs";

export async function GET() {
  const company = await db.query.companyProfile.findFirst();

  const rows = await db
    .select()
    .from(schema.notices)
    .leftJoin(
      schema.scores,
      eq(schema.scores.noticeId, schema.notices.id),
    )
    .orderBy(desc(schema.scores.composite), desc(schema.notices.fetchedAt));

  const penalty = company?.penaltyKeywords ?? [];
  const filtered = rows
    .map((r) => ({
      ...r.notices,
      score: r.scores ?? null,
    }))
    .filter((n) => {
      if (!penalty.length) return true;
      return !matchesPenalty(`${n.title} ${n.description ?? ""}`, penalty);
    });

  return NextResponse.json({
    notices: filtered,
    company: company ?? null,
  });
}
