import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export const runtime = "nodejs";

const companyInput = z.object({
  companyName: z.string().default(""),
  services: z.array(z.string()).default([]),
  cpvCodes: z.array(z.string()).default([]),
  searchKeywords: z.string().default(""),
  boostKeywords: z.array(z.string()).default([]),
  penaltyKeywords: z.array(z.string()).default([]),
  preferredRegions: z.array(z.string()).default([]),
  cannotDeliver: z.array(z.string()).default([]),
  strengths: z.array(z.string()).default([]),
  budgetMin: z.number().int().nonnegative().default(0),
  budgetMax: z.number().int().nonnegative().default(0),
  teamSize: z.number().int().min(1).default(1),
  pipelineSchedule: z.enum(["daily", "weekly"]).default("daily"),
});

function derivePrefixes(cpvCodes: string[]) {
  return Array.from(
    new Set(cpvCodes.map((c) => c.slice(0, 2)).filter(Boolean)),
  );
}

export async function GET() {
  const company = await db.query.companyProfile.findFirst();
  return NextResponse.json({ company: company ?? null });
}

export async function POST(req: Request) {
  const existing = await db.query.companyProfile.findFirst();
  if (existing) {
    return NextResponse.json(
      { error: "Company profile already exists — use PATCH" },
      { status: 409 },
    );
  }
  const body = companyInput.parse(await req.json());
  const [created] = await db
    .insert(schema.companyProfile)
    .values({
      ...body,
      coreCpvPrefixes: derivePrefixes(body.cpvCodes),
    })
    .returning();
  return NextResponse.json({ company: created });
}

export async function PATCH(req: Request) {
  const existing = await db.query.companyProfile.findFirst();
  if (!existing) {
    return NextResponse.json(
      { error: "No company profile yet — POST one first" },
      { status: 404 },
    );
  }
  const body = companyInput.parse(await req.json());
  const [updated] = await db
    .update(schema.companyProfile)
    .set({
      ...body,
      coreCpvPrefixes: derivePrefixes(body.cpvCodes),
      updatedAt: new Date(),
    })
    .where(eq(schema.companyProfile.id, existing.id))
    .returning();
  return NextResponse.json({ company: updated });
}
