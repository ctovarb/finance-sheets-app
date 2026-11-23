"use client";

import { useMemo } from "react";
import {
  MONTHS,
  isCardMethod,
  isCardPaymentDesc,
  serialDate,
} from "@/lib/categories";
import type { Tx } from "@/components/Summary";

type Cell = string | number;
type Row = { row: number; values: Cell[] };

// Índices dentro de B:K de la hoja 2026
const [, MONTH, CONCEPT, SUB, DESC, DETAIL, VALUE, , , METHOD] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

const cop = (n: number) =>
  n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

const short = (n: number) =>
  Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n));

const monthName = (v: Cell) =>
  typeof v === "number" ? MONTHS[serialDate(v).getUTCMonth()] : String(v).trim();
const monthKey = (serial: number) => {
  const d = serialDate(serial);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};

export type CardMovement = {
  row: number;
  monthKey: number;
  monthLabel: string;
  type: "expense" | "payment";
  desc: string;
  detail: string;
  sub: string;
  amount: number;
  rawSigned: number; // + para pagos, - para gastos
  rawRow: Row;
};

const heroStyle = {
  background:
    "radial-gradient(120% 90% at 100% 20%, rgba(240, 118, 74, 0.85) 0%, rgba(217, 85, 143, 0.45) 35%, transparent 70%), radial-gradient(120% 100% at 0% 0%, #6a3fc0 0%, rgba(80, 52, 160, 0.7) 45%, transparent 80%), linear-gradient(180deg, #2a1d6b 0%, #0b0b1f 100%)",
};

export default function CreditCardView({
  rows,
  txs,
  activeMonth,
  onSelectMonth,
  onAddPayment,
  onAddExpense,
  onEditRow,
}: {
  rows: Row[];
  txs: Tx[];
  activeMonth: number | "all";
  onSelectMonth: (m: number | "all") => void;
  onAddPayment: () => void;
  onAddExpense: () => void;
  onEditRow: (r: Row) => void;
}) {
  // Lista de meses disponibles ordenada descendentemente (incluye siempre el mes actual)
  const availableMonths = useMemo(() => {
    const map = new Map<number, string>();
    const now = new Date();
    const curKey = now.getFullYear() * 12 + now.getMonth();
    const curLabel = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
    map.set(curKey, curLabel);

    txs.forEach((t) => map.set(t.monthKey, t.monthLabel));
    return [...map.entries()].sort(([a], [b]) => b - a);
  }, [txs]);

  // Filtrar todos los movimientos de tarjeta de crédito
  const movements: CardMovement[] = useMemo(() => {
    const list: CardMovement[] = [];

    rows.forEach((r) => {
      const mesCell = r.values[MONTH];
      if (typeof mesCell !== "number") return;
      const mKey = monthKey(mesCell);
      const mLabel = `${monthName(mesCell)} ${serialDate(mesCell).getUTCFullYear()}`;
      const desc = String(r.values[DESC] ?? "").trim();
      const method = String(r.values[METHOD] ?? "").trim();
      const detail = String(r.values[DETAIL] ?? "").trim();
      const sub = String(r.values[SUB] ?? "").trim();
      const val = typeof r.values[VALUE] === "number" ? (r.values[VALUE] as number) : 0;
      const absVal = Math.abs(val);

      if (absVal === 0) return;

      // 1. Abonos / Pagos a la tarjeta (descripción contiene 'Pago Tarjeta')
      if (isCardPaymentDesc(desc)) {
        list.push({
          row: r.row,
          monthKey: mKey,
          monthLabel: mLabel,
          type: "payment",
          desc,
          detail,
          sub,
          amount: absVal,
          rawSigned: absVal, // Positivo para el saldo final
          rawRow: r,
        });
      }
      // 2. Gastos realizados con medio de pago Tarjeta de Crédito
      else if (isCardMethod(method)) {
        list.push({
          row: r.row,
          monthKey: mKey,
          monthLabel: mLabel,
          type: "expense",
          desc,
          detail,
          sub,
          amount: absVal,
          rawSigned: -absVal, // Negativo para el saldo final
          rawRow: r,
        });
      }
    });

    return list;
  }, [rows]);

  // Movimientos filtrados por el mes activo
  const filtered = useMemo(() => {
    if (activeMonth === "all") return movements;
    return movements.filter((m) => m.monthKey === activeMonth);
  }, [movements, activeMonth]);

  // Totales calculados
  const totalExpenses = useMemo(
    () => filtered.filter((m) => m.type === "expense").reduce((acc, m) => acc + m.amount, 0),
    [filtered]
  );

  // Pagos son positivos
  const totalPayments = useMemo(
    () => filtered.filter((m) => m.type === "payment").reduce((acc, m) => acc + m.amount, 0),
    [filtered]
  );

  // Saldo final = Pagos (+) - Gastos con tarjeta (-)
  const saldoFinal = totalPayments - totalExpenses;
  const saldoPendiente = Math.max(0, totalExpenses - totalPayments);

  // Desglose de gastos por categoría (subconcepto)
  const bySubcategory = useMemo(() => {
    const map = new Map<string, number>();
    filtered
      .filter((m) => m.type === "expense")
      .forEach((m) => {
        const cat = m.sub || "Sin categoría";
        map.set(cat, (map.get(cat) ?? 0) + m.amount);
      });
    return [...map.entries()].sort(([, a], [, b]) => b - a);
  }, [filtered]);

  const activeLabel =
    activeMonth === "all"
      ? "Histórico acumulado"
      : availableMonths.find(([k]) => k === activeMonth)?.[1] ?? "Mes seleccionado";

  return (
    <div className="space-y-6">
      {/* Header con estilo gradiente */}
      <header style={heroStyle} className="rounded-b-[2.5rem] md:rounded-3xl md:mt-4 px-6 md:px-8 pb-8 pt-10 md:pt-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-white">Tarjeta de Crédito</h1>
          {/* Selector de Mes */}
          <select
            value={activeMonth === "all" ? "all" : String(activeMonth)}
            onChange={(e) => onSelectMonth(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-semibold capitalize text-white backdrop-blur-md outline-none"
          >
            <option value="all" className="bg-[#1a1a2e] text-white">
              Todos los meses
            </option>
            {availableMonths.map(([k, label]) => (
              <option key={k} value={k} className="bg-[#1a1a2e] text-white capitalize">
                {label}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-1 text-sm text-white/70">Control de consumos, abonos y saldo final</p>

        {/* Tarjeta Visual Estilizada */}
        <div className="relative mt-6 overflow-hidden rounded-3xl border border-white/20 bg-gradient-to-br from-[#1e1338] via-[#2d1b54] to-[#f0764a]/30 p-5 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-widest uppercase text-white/60">
              Tarjeta de Crédito
            </span>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white/70">
              <span className="h-2 w-2 rounded-full bg-[#f0764a] animate-pulse" />
              <span>{activeLabel}</span>
            </div>
          </div>

          {/* Chip de la tarjeta */}
          <div className="my-4 flex items-center justify-between">
            <div className="h-8 w-11 rounded-lg border border-amber-300/40 bg-gradient-to-br from-amber-200 to-amber-500 shadow-inner" />
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/40">
              <path d="M5 12.55a11 11 0 0 1 14.08 0" />
              <path d="M1.42 9a16 16 0 0 1 21.16 0" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <circle cx="12" cy="20" r="1" />
            </svg>
          </div>

          {/* Saldo Final */}
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
              Saldo Final del Periodo
            </span>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span
                className={`text-3xl font-extrabold tracking-tight ${
                  saldoFinal > 0
                    ? "text-emerald-400"
                    : saldoFinal === 0
                    ? "text-white"
                    : "text-[#f0764a]"
                }`}
              >
                {cop(saldoFinal)}
              </span>
            </div>
          </div>

          {/* Footer de la tarjeta con estado */}
          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs">
            <span className="font-mono tracking-wider text-white/70">•••• •••• •••• 2026</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                saldoFinal >= 0
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "bg-[#f0764a]/20 text-[#f0764a] border border-[#f0764a]/30"
              }`}
            >
              {saldoFinal >= 0 ? "Al día ✓" : `Por pagar: ${cop(saldoPendiente)}`}
            </span>
          </div>
        </div>
      </header>

      <div className="space-y-6 px-4 md:px-0">
        {/* Métricas Principales (2 cajas) */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {/* Caja Consumos */}
          <section className="rounded-3xl border border-white/10 bg-[#16162a] p-4 shadow-xl">
            <div className="flex items-center justify-between text-xs text-white/60">
              <span className="font-semibold uppercase tracking-wider">Consumos</span>
              <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-400">
                Gastos
              </span>
            </div>
            <p className="mt-2 text-xl font-bold text-white">{cop(totalExpenses)}</p>
            <p className="mt-0.5 text-[11px] text-white/40">
              {filtered.filter((m) => m.type === "expense").length} transacciones
            </p>
          </section>

          {/* Caja Pagos Realizados */}
          <section className="rounded-3xl border border-white/10 bg-[#16162a] p-4 shadow-xl">
            <div className="flex items-center justify-between text-xs text-white/60">
              <span className="font-semibold uppercase tracking-wider">Pagos Tarjeta</span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                Abonos (+)
              </span>
            </div>
            <p className="mt-2 text-xl font-bold text-emerald-400">+{cop(totalPayments)}</p>
            <p className="mt-0.5 text-[11px] text-white/40">
              {filtered.filter((m) => m.type === "payment").length} abonos
            </p>
          </section>
        </div>

        {/* Acciones directas de la tarjeta */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <button
            type="button"
            onClick={onAddPayment}
            className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 py-3.5 text-xs font-bold text-emerald-300 shadow-lg hover:bg-emerald-500/20 active:scale-95 transition-all"
          >
            <span>+</span> Registrar Abono
          </button>
          <button
            type="button"
            onClick={onAddExpense}
            className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-[#1f1f38] py-3.5 text-xs font-bold text-white shadow-lg hover:bg-[#272746] active:scale-95 transition-all"
          >
            <span>+</span> Nueva Compra
          </button>
        </div>

        {/* Columnas responsivas en Desktop (Desglose + Movimientos) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Desglose de Gastos por Categoría */}
          {bySubcategory.length > 0 && (
            <section className="lg:col-span-5 rounded-3xl border border-white/10 bg-[#16162a] p-5 shadow-xl h-fit">
              <h3 className="text-sm font-semibold text-white">Consumos por categoría</h3>
              <p className="mb-3 text-xs text-white/50">Distribución de compras con la tarjeta</p>

              <div className="space-y-3">
                {bySubcategory.slice(0, 7).map(([cat, amt]) => {
                  const pct = totalExpenses > 0 ? (amt / totalExpenses) * 100 : 0;
                  return (
                    <div key={cat} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-white/80">{cat}</span>
                        <span className="font-bold text-white">{short(amt)} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#7c4dbc] to-[#f0764a]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Lista Detallada de Movimientos */}
          <section className={`${bySubcategory.length > 0 ? "lg:col-span-7" : "lg:col-span-12"} rounded-3xl border border-white/10 bg-[#16162a] p-5 shadow-xl`}>
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">Movimientos de la Tarjeta</h3>
            <span className="text-xs text-white/40">{filtered.length} registros</span>
          </div>
          <p className="mb-4 text-xs text-white/50">Toca cualquier registro para editarlo</p>

          <div className="space-y-2.5">
            {filtered.map((m) => {
              const isPayment = m.type === "payment";
              const title = m.detail || m.desc;
              return (
                <button
                  key={m.row}
                  type="button"
                  onClick={() => onEditRow(m.rawRow)}
                  className="flex w-full items-center gap-3.5 rounded-2xl border border-white/10 bg-[#1f1f38] p-3.5 text-left transition-all hover:bg-[#252544] active:scale-[0.99]"
                >
                  {/* Avatar con icono según tipo */}
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-base font-bold shadow-inner ${
                      isPayment
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : "bg-[#252544] text-white"
                    }`}
                  >
                    {isPayment ? "↓" : title.charAt(0).toUpperCase()}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">
                      {title}
                    </span>
                    <span className="block truncate text-xs text-white/50">
                      {isPayment ? "Abono / Pago de Tarjeta" : `${m.sub} · ${m.monthLabel}`}
                    </span>
                  </span>

                  {/* Valor con signo */}
                  <span
                    className={`text-sm font-bold shrink-0 ${
                      isPayment ? "text-emerald-400" : "text-white"
                    }`}
                  >
                    {isPayment ? `+ ${cop(m.amount)}` : `- ${cop(m.amount)}`}
                  </span>
                </button>
              );
            })}

            {filtered.length === 0 && (
              <div className="py-8 text-center text-white/40">
                <p className="text-sm font-medium">Sin movimientos de tarjeta en este periodo</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  </div>
);
}
