import { NextResponse } from "next/server";
import { clearAllScores } from "@/lib/score";

export const runtime = "nodejs";

export async function POST() {
  await clearAllScores();
  return NextResponse.json({ ok: true });
}
