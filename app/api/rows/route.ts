import { NextResponse } from "next/server";
import { appendRow, isAuthorized, readAll } from "@/lib/sheets";


export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await readAll());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { values } = await req.json();
    const row = await appendRow(values);
    return NextResponse.json({ ok: true, row });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
