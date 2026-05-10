import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export const runtime = "nodejs";

const body = z.object({ favorited: z.boolean() });

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const { favorited } = body.parse(await req.json());

  const [updated] = await db
    .update(schema.notices)
    .set({ favorited })
    .where(eq(schema.notices.id, id))
    .returning({ id: schema.notices.id, favorited: schema.notices.favorited });

  if (!updated) {
    return NextResponse.json({ error: "Notice not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}
