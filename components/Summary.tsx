"use client";

import { useMemo, useState } from "react";

export type Tx = {
  monthKey: number; // año*12 + mes
  monthLabel: string; // "octubre 2026"
  concept: string;
  sub: string;
  desc: string;
  detail: string;
  value: number;
  method: string;
};

export type PendingReminder = { monthKey: number; estimado: number; desc: string };

const PALETTE = ["#9b6ad8", "#f0764a", "#d9558f", "#6a8cff", "#f5b84a", "#4fd1c5", "#a3e635", "#94a3b8"];
const isCardPayment = (t: Tx) => t.desc === "Pago Tarjeta de Crédito";

const cop = (n: number) =>
  n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const short = (n: number) =>
  Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n));

function computeStops(byCat: [string, number][], totalG: number): string {
  let acc = 0;
  const parts: string[] = [];
  for (let i = 0; i < byCat.length; i++) {
    const v = byCat[i][1];
    const from = (acc / (totalG || 1)) * 100;
    acc += v;
    const to = (acc / (totalG || 1)) * 100;
    parts.push(`${PALETTE[i % PALETTE.length]} ${from}% ${to}%`);
  }
  return parts.join(", ");
}

const heroStyle = {
  background:
    "radial-gradient(120% 90% at 100% 20%, rgba(240, 118, 74, 0.85) 0%, rgba(217, 85, 143, 0.45) 35%, transparent 70%), radial-gradient(120% 100% at 0% 0%, #6a3fc0 0%, rgba(80, 52, 160, 0.7) 45%, transparent 80%), linear-gradient(180deg, #2a1d6b 0%, #0b0b1f 100%)",
};

export default function Summary({
  txs,
  pending,
  onNavigateToList,
  onNavigateToReminders,
}: {
  txs: Tx[];
  pending: PendingReminder[];
  onNavigateToList: (filters: { monthKey?: number; concept?: "Ingresos" | "Gastos"; method?: string }) => void;
  onNavigateToReminders: (monthKey?: number) => void;
}) {
  const months = useMemo(
    () => [...new Map(txs.map((t) => [t.monthKey, t.monthLabel])).entries()].sort(([a], [b]) => a - b),
    [txs]
  );
  const [picked, setPicked] = useState<number | null>(null);
  const active = picked ?? (months[months.length - 1]?.[0] ?? null);

  const perMonth = useMemo(
    () =>
      months.map(([k, label]) => {
        const m = txs.filter((t) => t.monthKey === k);
        const gastos = -m.filter((t) => t.concept === "Gastos" && !isCardPayment(t)).reduce((s, t) => s + t.value, 0);
        const ingresos = m.filter((t) => t.concept === "Ingresos").reduce((s, t) => s + t.value, 0);
        return { key: k, label, gastos, ingresos };
      }),
    [months, txs]
  );

  const cur = perMonth.find((m) => m.key === active);
  const monthTx = txs.filter((t) => t.monthKey === active);
  const expenses = monthTx.filter((t) => t.concept === "Gastos" && !isCardPayment(t));

  const byCat = useMemo(() => {
    const map = new Map<string, number>();
    expenses.forEach((t) => map.set(t.sub || "Sin categoría", (map.get(t.sub || "Sin categoría") ?? 0) + -t.value));
    const sorted = [...map.entries()].sort(([, a], [, b]) => b - a);
    const top = sorted.slice(0, 7);
    const rest = sorted.slice(7).reduce((s, [, v]) => s + v, 0);
    return rest > 0 ? [...top, ["Otras", rest] as [string, number]] : top;
  }, [expenses]);

  const totalG = cur?.gastos ?? 0;
  const net = (cur?.ingresos ?? 0) - totalG;
  const topTx = [...expenses].sort((a, b) => a.value - b.value).slice(0, 5);
  const card = expenses.filter((t) => t.method === "Tarjeta de Crédito").reduce((s, t) => s + -t.value, 0);
  const account = totalG - card;
  const pend = pending.filter((p) => p.monthKey === active);
  const pendTotal = pend.reduce((s, p) => s + Math.abs(p.estimado), 0);
  const maxBar = Math.max(1, ...perMonth.map((m) => m.gastos));

  const stops = computeStops(byCat, totalG);

  if (months.length === 0) return <p className="px-5 text-white/50">Aún no hay registros para resumir.</p>;

  return (
    <div className="space-y-6">
      {/* Hero Header con gradiente violeta/naranja */}
      <section style={heroStyle} className="rounded-b-[2.5rem] px-6 pb-9 pt-12 shadow-2xl">
        <div className="flex items-center justify-between">
          <select
            value={active ?? ""}
            onChange={(e) => setPicked(Number(e.target.value))}
            className="rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-medium capitalize text-white backdrop-blur-md outline-none"
          >
            {months.map(([k, l]) => (
              <option key={k} value={k} className="bg-[#1a1a2e] text-white capitalize">{l}</option>
            ))}
          </select>
          <span className="text-xs text-white/60">Finanzas Personales</span>
        </div>

        <p className="mt-4 text-xs font-medium uppercase tracking-wider text-white/70">Balance del mes</p>
        <p className="mt-1 text-4xl font-bold tracking-tight text-white">{cop(net)}</p>

        {/* Tarjetas clickeables de Ingresos y Gastos translúcidas */}
        <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
          <button
            type="button"
            onClick={() => active !== null && onNavigateToList({ monthKey: active, concept: "Ingresos" })}
            className="group rounded-2xl border border-white/15 bg-white/10 p-3.5 text-left backdrop-blur-md transition-all hover:bg-white/15 active:scale-[0.98]"
          >
            <div className="flex items-center justify-between text-xs text-white/70">
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                Ingresos
              </div>
              <span className="text-[10px] text-white/40 group-hover:text-white/90">Ver ↗</span>
            </div>
            <p className="mt-1 text-base font-bold text-emerald-400">{cop(cur?.ingresos ?? 0)}</p>
          </button>

          <button
            type="button"
            onClick={() => active !== null && onNavigateToList({ monthKey: active, concept: "Gastos" })}
            className="group rounded-2xl border border-white/15 bg-white/10 p-3.5 text-left backdrop-blur-md transition-all hover:bg-white/15 active:scale-[0.98]"
          >
            <div className="flex items-center justify-between text-xs text-white/70">
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-rose-400" />
                Gastos
              </div>
              <span className="text-[10px] text-white/40 group-hover:text-white/90">Ver ↗</span>
            </div>
            <p className="mt-1 text-base font-bold text-rose-400">{cop(totalG)}</p>
          </button>
        </div>
      </section>

      <div className="space-y-5 px-4">
        {/* Gastos por mes (Barras verticales estilizadas) */}
        <section className="relative rounded-3xl border border-white/10 bg-[#16162a] p-5 shadow-xl">
          <div className="mx-auto -mt-2 mb-3 h-1 w-12 rounded-full bg-white/20" />
          <h3 className="text-base font-semibold text-white">Gastos por mes</h3>
          <p className="mb-4 text-xs text-white/50">Excluye pago de tarjeta para no duplicar</p>
          <div className="flex h-36 items-end justify-center gap-4">
            {perMonth.map((m) => {
              const sel = m.key === active;
              return (
                <button
                  key={m.key}
                  onClick={() => setPicked(m.key)}
                  className="flex h-full max-w-[50px] flex-1 flex-col items-center justify-end gap-1.5 focus:outline-none"
                >
                  {sel && (
                    <span className="rounded-md bg-[#252542] px-1.5 py-0.5 text-[10px] font-semibold text-white shadow">
                      {short(m.gastos)}
                    </span>
                  )}
                  <div
                    className="w-7 rounded-full transition-all"
                    style={{
                      height: `${Math.max(10, (m.gastos / maxBar) * 100)}%`,
                      background: sel
                        ? "linear-gradient(180deg, #f0764a 0%, #9b6ad8 100%)"
                        : "rgba(255, 255, 255, 0.12)",
                    }}
                  />
                  <span className={`text-[11px] capitalize font-medium ${sel ? "text-white" : "text-white/40"}`}>
                    {m.label.split(" ")[0].slice(0, 3)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Medio de pago y Recordatorios (Reordenado aquí, justo después de Gastos por mes) */}
        <div className="grid grid-cols-2 gap-3">
          <section className="relative rounded-3xl border border-white/10 bg-[#16162a] p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/70">Medio de pago</h3>
              <span className="text-[10px] text-white/40">Filtro ↗</span>
            </div>

            <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-white/10">
              <div style={{ width: `${totalG ? (account / totalG) * 100 : 0}%`, background: "#9b6ad8" }} />
              <div style={{ width: `${totalG ? (card / totalG) * 100 : 0}%`, background: "#f0764a" }} />
            </div>

            <div className="mt-3 space-y-1">
              <button
                type="button"
                onClick={() => active !== null && onNavigateToList({ monthKey: active, method: "Cuenta Corriente/Ahorros" })}
                className="flex w-full items-center justify-between rounded-xl p-1.5 text-xs text-white/80 transition-all hover:bg-white/5 active:scale-95"
              >
                <span className="flex items-center gap-1.5 truncate">
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#9b6ad8]" />
                  Cuenta
                </span>
                <span className="font-semibold text-white">{short(account)}</span>
              </button>

              <button
                type="button"
                onClick={() => active !== null && onNavigateToList({ monthKey: active, method: "Tarjeta de Crédito" })}
                className="flex w-full items-center justify-between rounded-xl p-1.5 text-xs text-white/80 transition-all hover:bg-white/5 active:scale-95"
              >
                <span className="flex items-center gap-1.5 truncate">
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#f0764a]" />
                  Tarjeta
                </span>
                <span className="font-semibold text-white">{short(card)}</span>
              </button>
            </div>
          </section>

          <button
            type="button"
            onClick={() => onNavigateToReminders(active ?? undefined)}
            className="group relative rounded-3xl border border-white/10 bg-[#16162a] p-4 text-left shadow-xl transition-all hover:border-[#f0764a]/40 hover:bg-[#1c1c34] active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/70">Por pagar</h3>
              <span className="text-[10px] text-white/40 group-hover:text-[#f0764a]">Ir ↗</span>
            </div>
            <p className="mt-2 text-3xl font-bold text-[#f0764a]">{pend.length}</p>
            <p className="text-xs text-white/50">{short(pendTotal)} estimados</p>
            <span className="mt-3 inline-block text-[11px] font-medium text-[#f0764a]/90 group-hover:text-[#f0764a]">
              Ver Recordatorios →
            </span>
          </button>
        </div>

        {/* Por categoría (Gráfico circular dona + lista) */}
        <section className="relative rounded-3xl border border-white/10 bg-[#16162a] p-5 shadow-xl">
          <div className="mx-auto -mt-2 mb-3 h-1 w-12 rounded-full bg-white/20" />
          <h3 className="text-base font-semibold text-white">Gastos por categoría</h3>
          {totalG > 0 ? (
            <div className="mt-4 flex items-center gap-5">
              <div
                className="relative h-32 w-32 shrink-0 rounded-full shadow-lg"
                style={{ background: `conic-gradient(${stops})` }}
              >
                <div className="absolute inset-[18px] flex flex-col items-center justify-center rounded-full bg-[#16162a] text-center shadow-inner">
                  <span className="text-[10px] uppercase tracking-wider text-white/50">Total</span>
                  <span className="text-sm font-bold text-white">{short(totalG)}</span>
                </div>
              </div>
              <ul className="min-w-0 flex-1 space-y-2 text-sm">
                {byCat.map(([name, v], i) => (
                  <li key={name} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                    <span className="flex-1 truncate text-xs text-white/90">{name}</span>
                    <span className="text-xs font-medium text-white/50">{Math.round((v / totalG) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-sm text-white/50">Sin gastos este mes.</p>
          )}

          {byCat.length > 0 && (
            <div className="mt-5 space-y-3 border-t border-white/5 pt-4">
              {byCat.map(([name, v], i) => (
                <div key={name}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-white/80 font-medium">{name}</span>
                    <span className="text-white/50">{cop(v)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${(v / (byCat[0][1] || 1)) * 100}%`, background: PALETTE[i % PALETTE.length] }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Mayores gastos */}
        <section className="relative rounded-3xl border border-white/10 bg-[#16162a] p-5 shadow-xl">
          <div className="mx-auto -mt-2 mb-3 h-1 w-12 rounded-full bg-white/20" />
          <h3 className="text-base font-semibold text-white">Mayores gastos</h3>
          <ul className="mt-3 divide-y divide-white/5">
            {topTx.map((t, i) => (
              <li key={i} className="flex items-center gap-3 py-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#20203a] text-sm font-bold text-white shadow-inner">
                  {t.desc.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{t.desc}</p>
                  <p className="truncate text-xs text-white/50">{t.sub}{t.detail ? ` · ${t.detail}` : ""}</p>
                </div>
                <span className="text-sm font-semibold text-rose-400">{cop(t.value)}</span>
              </li>
            ))}
            {topTx.length === 0 && <li className="py-2 text-sm text-white/50">Sin gastos este mes.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
