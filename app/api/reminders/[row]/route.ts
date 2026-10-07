import { NextResponse } from "next/server";
import { isAuthorized, payReminder } from "@/lib/sheets";

export async function POST(req: Request, { params }: { params: Promise<{ row: string }> }) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { row } = await params;
    const n = Number(row);
    if (!Number.isInteger(n) || n < 8) return NextResponse.json({ error: "Fila inválida" }, { status: 400 });
    const { paid, method } = await req.json();
    const sheetRow = await payReminder(n, Number(paid), String(method));
    return NextResponse.json({ ok: true, row: sheetRow });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
