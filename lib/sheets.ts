import { google } from "googleapis";

const SHEET_ID = process.env.SHEET_ID!;
export const SHEET_NAME = process.env.SHEET_NAME || "2026";
const REMINDERS = "Recordatorios";
const PARAMS = "Parametros";

// ---- Layout hoja "2026": encabezados en B17:K17, datos desde la fila 18.
// B Año | C Mes | D Concepto General | E Subconcepto (FÓRMULA, no se toca) | F Descripción
// G Detalles | H Valor | I Estado | J Saldo Disponible (fórmula) | K Medio de Pago
const HEADER_ROW = 17;

// ---- Layout hoja "Recordatorios": encabezados en B7:K7, datos desde la fila 8.
// B ID | C Fecha | D Mes | E Concepto | F Subconcepto | G Descripción | H Detalles / Cuenta
// I Monto Estimado | J Valor Pagado | K Estado
const REM_HEADER_ROW = 7;

export type Cell = string | number;

function getSheets() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

export function isAuthorized(req: Request) {
  const pass = process.env.APP_PASSWORD;
  return !!pass && req.headers.get("x-app-password") === pass;
}

const blank = (c: Cell | undefined) => String(c ?? "").trim() === "";

// ---------------- Mes como fecha ----------------
const EPOCH = 25569; // días entre 1899-12-30 y 1970-01-01
/** Serial de Sheets para el día 2 del mes (convención de control de la hoja). */
export const monthSerial = (year: number, monthIdx: number) =>
  Date.UTC(year, monthIdx, 2) / 86400000 + EPOCH;
const serialDate = (s: number) => new Date((s - EPOCH) * 86400000);

// ---------------- Parametros ----------------
export async function readParams() {
  const res = await getSheets().spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${PARAMS}'!C1:D200`,
  });
  const seen = new Set<string>();
  const items: { desc: string; sub: string }[] = [];
  for (const [d, s] of res.data.values || []) {
    const desc = String(d ?? "").trim();
    if (!desc || seen.has(desc)) continue;
    seen.add(desc);
    items.push({ desc, sub: String(s ?? "").trim() });
  }
  return items;
}

// ---------------- Hoja 2026 ----------------
async function readRaw() {
  const res = await getSheets().spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${SHEET_NAME}'!B${HEADER_ROW}:K`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const values = (res.data.values || []) as Cell[][];
  const headers = (values[0] || []).map((h) => String(h).trim());
  const rows = values.slice(1).map((v, i) => ({
    row: HEADER_ROW + 1 + i,
    values: headers.map((_, c) => v[c] ?? "") as Cell[],
  }));
  return { headers, rows };
}

// Hay datos si Mes, Concepto, Descripción, Detalles o Valor no están vacíos
// (se ignoran Año, Subconcepto y Saldo, que traen valor/fórmula incluso en filas vacías).
const hasData = (v: Cell[]) => [1, 2, 4, 5, 6].some((i) => !blank(v[i]));

export async function readAll() {
  const { headers, rows } = await readRaw();
  return { headers, rows: rows.filter((r) => hasData(r.values)) };
}

/** v: [Año, Mes, Concepto, (Sub ignorado), Desc, Detalles, Valor, Estado, (Saldo ignorado), Medio] */
async function write(row: number, v: Cell[]) {
  // Subconcepto: misma fórmula que usa la hoja; se escribe siempre porque no todas las filas vacías la traen.
  const subFormula = `=IF(F${row}="", "", IFERROR(XLOOKUP(F${row}, Parametros!$C$1:$C$98, Parametros!$D$1:$D$98), "No Encontrado"))`;
  await getSheets().spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        { range: `'${SHEET_NAME}'!B${row}:D${row}`, values: [v.slice(0, 3)] },
        { range: `'${SHEET_NAME}'!E${row}`, values: [[subFormula]] },
        { range: `'${SHEET_NAME}'!F${row}:I${row}`, values: [v.slice(4, 8)] },
        { range: `'${SHEET_NAME}'!K${row}`, values: [[v[9] ?? ""]] },
      ],
    },
  });
}

export async function appendRow(v: Cell[]) {
  const { rows } = await readRaw();
  const free = rows.find((r) => !hasData(r.values));
  const row = free ? free.row : HEADER_ROW + 1 + rows.length;
  await write(row, v);
  return row;
}

export async function updateRow(row: number, v: Cell[]) {
  await write(row, v);
}

/** Borra los datos de un registro sin eliminar la fila (conserva fórmulas de E y J). */
export async function deleteRow(row: number) {
  if (row <= HEADER_ROW) throw new Error("Fila inválida");
  await getSheets().spreadsheets.values.batchClear({
    spreadsheetId: SHEET_ID,
    requestBody: {
      ranges: [
        `'${SHEET_NAME}'!B${row}:D${row}`,
        `'${SHEET_NAME}'!F${row}:I${row}`,
        `'${SHEET_NAME}'!K${row}`,
      ],
    },
  });
}


// ---------------- Recordatorios ----------------
export type Reminder = {
  row: number; id: number; fecha: number; mes: number; concepto: string; sub: string;
  desc: string; detalle: string; estimado: number; pagado: number | ""; estado: string;
};

export async function readReminders(): Promise<Reminder[]> {
  const res = await getSheets().spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${REMINDERS}'!B${REM_HEADER_ROW + 1}:K`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const out: Reminder[] = [];
  ((res.data.values || []) as Cell[][]).forEach((v, i) => {
    if (blank(v[0]) || blank(v[6])) return;
    out.push({
      row: REM_HEADER_ROW + 1 + i,
      id: Number(v[0]), fecha: Number(v[1]), mes: Number(v[2]),
      concepto: String(v[3] ?? ""), sub: String(v[4] ?? ""), desc: String(v[5] ?? ""),
      detalle: String(v[6] ?? ""),
      estimado: typeof v[7] === "number" ? v[7] : 0,
      pagado: typeof v[8] === "number" ? v[8] : "",
      estado: String(v[9] ?? ""),
    });
  });
  return out;
}

/**
 * Registra el pago de un recordatorio: agrega la fila en la hoja 2026 y
 * marca el recordatorio como Pagado con su valor. Los datos del recordatorio
 * se leen de la hoja (no se confía en lo que envía el cliente).
 */
export async function payReminder(row: number, paid: number, method: string) {
  const rem = (await readReminders()).find((r) => r.row === row);
  if (!rem) throw new Error("Recordatorio no encontrado");
  if (rem.estado.trim().toLowerCase() === "pagado") throw new Error("Este recordatorio ya está pagado");
  if (!(paid > 0)) throw new Error("Valor inválido");

  const d = serialDate(rem.mes);
  const year = d.getUTCFullYear();
  const sign = rem.concepto === "Gastos" ? -1 : 1;
  const sheetRow = await appendRow([
    year, monthSerial(year, d.getUTCMonth()), rem.concepto, "", rem.desc,
    rem.detalle, sign * paid, "✅", "", method,
  ]);

  await getSheets().spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `'${REMINDERS}'!J${row}:K${row}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[paid, "Pagado"]] },
  });
  return sheetRow;
}
