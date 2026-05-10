import { NextResponse } from "next/server";
import { scrapeDoffin } from "@/lib/doffin";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  try {
    const result = await scrapeDoffin();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
