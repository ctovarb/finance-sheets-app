import { NextResponse } from "next/server";
import { isAuthorized, readReminders } from "@/lib/sheets";

export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    return NextResponse.json({ rows: await readReminders() });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
