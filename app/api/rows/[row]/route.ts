import { NextResponse } from "next/server";
import { deleteRow, isAuthorized, updateRow } from "@/lib/sheets";

function parseRow(row: string) {
  const n = Number(row);
  return Number.isInteger(n) && n >= 18 ? n : null;
}

export async function PUT(req: Request, { params }: { params: Promise<{ row: string }> }) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const n = parseRow((await params).row);
    if (!n) return NextResponse.json({ error: "Fila inválida" }, { status: 400 });
    const { values } = await req.json();
    await updateRow(n, values);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ row: string }> }) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const n = parseRow((await params).row);
    if (!n) return NextResponse.json({ error: "Fila inválida" }, { status: 400 });
    await deleteRow(n);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
