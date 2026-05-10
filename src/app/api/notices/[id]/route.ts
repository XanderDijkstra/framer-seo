import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const [row] = await db
    .select()
    .from(schema.notices)
    .leftJoin(schema.scores, eq(schema.scores.noticeId, schema.notices.id))
    .where(eq(schema.notices.id, id))
    .limit(1);

  if (!row) {
    return NextResponse.json({ notice: null }, { status: 404 });
  }

  const company = await db.query.companyProfile.findFirst();
  return NextResponse.json({
    notice: { ...row.notices, score: row.scores ?? null },
    company: company ?? null,
  });
}
