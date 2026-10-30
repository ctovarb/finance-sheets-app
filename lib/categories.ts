export const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export const CONCEPTS = ["Gastos", "Ingresos"] as const;
export const PAYMENT_METHODS = ["Tarjeta de Crédito", "Cuenta Corriente/Ahorros"];
export const DONE = "✅";

// Las fechas de Sheets son días desde 1899-12-30.
export const EPOCH = 25569;
/** Mes de control: se guarda el día 2 del mes. */
export const monthSerial = (year: number, monthIdx: number) =>
  Date.UTC(year, monthIdx, 2) / 86400000 + EPOCH;
export const serialDate = (s: number) => new Date((s - EPOCH) * 86400000);

export const normalizeStr = (s: string) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

export const isCardMethod = (method: string) => normalizeStr(method).includes("tarjeta");
export const isCardPaymentDesc = (desc: string) => normalizeStr(desc).includes("pago tarjeta");

