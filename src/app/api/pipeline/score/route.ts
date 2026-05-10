import { NextResponse } from "next/server";
import { scoreNoticesBatch } from "@/lib/score";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  try {
    const result = await scoreNoticesBatch();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
