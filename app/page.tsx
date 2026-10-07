"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CONCEPTS, DONE, MONTHS, PAYMENT_METHODS, monthSerial, serialDate } from "@/lib/categories";
import Summary, { type PendingReminder, type Tx } from "@/components/Summary";

type Cell = string | number;
type Row = { row: number; values: Cell[] };
type Data = { headers: string[]; rows: Row[] };
type Param = { desc: string; sub: string };
type Reminder = {
  row: number; id: number; fecha: number; mes: number; concepto: string; sub: string;
  desc: string; detalle: string; estimado: number; pagado: number | ""; estado: string;
};

// Índices dentro de B:K de la hoja 2026
const [YEAR, MONTH, CONCEPT, SUB, DESC, DETAIL, VALUE, STATUS, , METHOD] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

type Form = {
  year: string; month: string; concept: string; desc: string;
  detail: string; amount: string; done: boolean; method: string;
};

const emptyForm = (): Form => ({
  year: "2026",
  month: "octubre",
  concept: "Gastos", desc: "", detail: "", amount: "",
  done: true, method: PAYMENT_METHODS[0],
});

const money = (v: Cell) =>
  typeof v === "number"
    ? v.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })
    : String(v);

function toValue(f: Form) {
  const n = Math.abs(Number(f.amount.replace(/[^\d.]/g, "")));
  return f.concept === "Gastos" ? -n : n;
}

// El Subconcepto (índice 3) lo calcula la hoja con una fórmula: se envía vacío y el servidor lo ignora.
function toCells(f: Form): Cell[] {
  const c: Cell[] = new Array(10).fill("");
  c[YEAR] = Number(f.year);
  c[MONTH] = monthSerial(Number(f.year), MONTHS.indexOf(f.month));
  c[CONCEPT] = f.concept; c[DESC] = f.desc; c[DETAIL] = f.detail;
  c[VALUE] = toValue(f);
  c[STATUS] = f.done ? DONE : "";
  c[METHOD] = f.method;
  return c;
}

const monthName = (v: Cell) =>
  typeof v === "number" ? MONTHS[serialDate(v).getUTCMonth()] : String(v).trim();
const monthLabel = (serial: number) => `${monthName(serial)} ${serialDate(serial).getUTCFullYear()}`;
const monthKey = (serial: number) => { const d = serialDate(serial); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };

function fromRow(v: Cell[]): Form {
  const val = typeof v[VALUE] === "number" ? Math.abs(v[VALUE] as number) : 0;
  const year = v[YEAR] || (typeof v[MONTH] === "number" ? serialDate(v[MONTH]).getUTCFullYear() : 2026);
  return {
    year: String(year), month: monthName(v[MONTH]), concept: String(v[CONCEPT]),
    desc: String(v[DESC]), detail: String(v[DETAIL]).trim(), amount: String(val),
    done: String(v[STATUS]).includes(DONE), method: String(v[METHOD]) || PAYMENT_METHODS[0],
  };
}

type Tab = "home" | "add" | "list" | "rem";

const ICONS: Record<Tab, string> = {
  home: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  add: "M12 5v14M5 12h14",
  list: "M4 6h16M4 12h16M4 18h10",
  rem: "M12 3a6 6 0 00-6 6v4l-2 3h16l-2-3V9a6 6 0 00-6-6zM10 20a2 2 0 004 0",
};

function Icon({ tab, active }: { tab: Tab; active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "#fff" : "rgba(255,255,255,0.4)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[tab]} />
    </svg>
  );
}

const heroStyle = {
  background:
    "radial-gradient(120% 90% at 100% 20%, rgba(240, 118, 74, 0.85) 0%, rgba(217, 85, 143, 0.45) 35%, transparent 70%), radial-gradient(120% 100% at 0% 0%, #6a3fc0 0%, rgba(80, 52, 160, 0.7) 45%, transparent 80%), linear-gradient(180deg, #2a1d6b 0%, #0b0b1f 100%)",
};

const field = "w-full rounded-2xl border border-white/10 bg-[#1f1f38] px-4 py-3.5 text-base text-white placeholder-white/30 outline-none focus:border-[#9b6ad8] focus:ring-1 focus:ring-[#9b6ad8] transition-all";
const primary = "w-full rounded-2xl bg-gradient-to-r from-[#7c4dbc] to-[#9b6ad8] py-4 font-semibold text-white shadow-lg shadow-[#7c4dbc]/30 active:scale-[0.98] transition-all disabled:opacity-50";
const lbl = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-white/60";

function Header({ title, sub }: { title: string; sub?: string }) {
  return (
    <header style={heroStyle} className="rounded-b-[2.5rem] px-6 pb-8 pt-12 shadow-2xl">
      <h1 className="text-3xl font-bold tracking-tight text-white">{title}</h1>
      {sub && <p className="mt-1 text-sm text-white/70">{sub}</p>}
    </header>
  );
}

export default function Home() {
  const [pass, setPass] = useState("");
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<Tab>("home");
  const [data, setData] = useState<Data>({ headers: [], rows: [] });
  const [params, setParams] = useState<Param[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [form, setForm] = useState<Form>(emptyForm());
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [search, setSearch] = useState("");
  const [remMonth, setRemMonth] = useState<number | null>(null);
  const [paying, setPaying] = useState<{ row: number; amount: string; method: string } | null>(null);

  const api = useCallback(
    async (url: string, init?: RequestInit, p = pass) => {
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", "x-app-password": p } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      return json;
    },
    [pass]
  );

  const load = useCallback(async (p = pass) => {
    const d: Data = await api("/api/rows", undefined, p);
    setData(d);
    return d;
  }, [api, pass]);

  const loadParams = useCallback(async (p = pass) => {
    const r = await api("/api/params", undefined, p);
    setParams(r.items);
  }, [api, pass]);

  const loadReminders = useCallback(async (p = pass) => {
    const r = await api("/api/reminders", undefined, p);
    setReminders(r.rows);
  }, [api, pass]);

  const boot = useCallback(async (p: string) => {
    await Promise.all([load(p), loadParams(p), loadReminders(p)]);
  }, [load, loadParams, loadReminders]);

  useEffect(() => {
    const saved = localStorage.getItem("pw");
    if (saved) {
      boot(saved)
        .then(() => {
          setPass(saved);
          setAuthed(true);
        })
        .catch(() => localStorage.removeItem("pw"));
    }
  }, [boot]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    try {
      await boot(pass);
      localStorage.setItem("pw", pass);
      setAuthed(true);
      setMsg("");
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  // Subconcepto derivado de la Descripción (hoja Parametros)
  const subOf = useMemo(() => new Map(params.map((p) => [p.desc, p.sub])), [params]);
  const groups = useMemo(() => {
    const g = new Map<string, string[]>();
    params.forEach((p) => g.set(p.sub, [...(g.get(p.sub) || []), p.desc]));
    return [...g.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [params]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.desc || !subOf.has(form.desc)) return setMsg("❌ Elige una descripción de la lista");
    if (!form.amount || Number(form.amount.replace(/[^\d.]/g, "")) === 0) return setMsg("❌ Ingresa un valor");
    setBusy(true);
    setMsg("");
    try {
      const body = JSON.stringify({ values: toCells(form) });
      if (editing !== null) await api(`/api/rows/${editing}`, { method: "PUT", body });
      else await api("/api/rows", { method: "POST", body });
      const wasEditing = editing !== null;
      setMsg(wasEditing ? "✅ Registro actualizado" : "✅ Registro guardado");
      setEditing(null);
      setForm({ ...emptyForm(), month: form.month, method: form.method });
      await load();
      if (wasEditing) setTab("list");
    } catch (err) {
      setMsg("❌ " + (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(r: Row) {
    const name = `${String(r.values[DESC])} (${money(r.values[VALUE])})`;
    if (!window.confirm(`¿Borrar "${name}" de la hoja?`)) return;
    setBusy(true);
    setMsg("");
    try {
      await api(`/api/rows/${r.row}`, { method: "DELETE" });
      await load();
    } catch (err) {
      window.alert("❌ " + (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    if (!paying) return;
    const amount = Number(paying.amount.replace(/[^\d.]/g, ""));
    if (!(amount > 0)) return setMsg("❌ Ingresa el valor pagado");
    setBusy(true);
    setMsg("");
    try {
      await api(`/api/reminders/${paying.row}`, { method: "POST", body: JSON.stringify({ paid: amount, method: paying.method }) });
      setPaying(null);
      setMsg("✅ Pago registrado en la hoja 2026");
      await Promise.all([loadReminders(), load()]);
    } catch (err) {
      setMsg("❌ " + (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const isPaid = (r: Reminder) => r.estado.trim().toLowerCase() === "pagado";

  // Datos para el resumen
  const txs: Tx[] = useMemo(
    () =>
      data.rows
        .filter((r) => typeof r.values[MONTH] === "number" && typeof r.values[VALUE] === "number")
        .map((r) => ({
          monthKey: monthKey(r.values[MONTH] as number),
          monthLabel: monthLabel(r.values[MONTH] as number),
          concept: String(r.values[CONCEPT]),
          sub: String(r.values[SUB]),
          desc: String(r.values[DESC]),
          detail: String(r.values[DETAIL]).trim(),
          value: r.values[VALUE] as number,
          method: String(r.values[METHOD]),
        })),
    [data.rows]
  );
  const pending: PendingReminder[] = useMemo(
    () => reminders.filter((r) => !isPaid(r)).map((r) => ({ monthKey: monthKey(r.mes), estimado: r.estimado, desc: r.desc })),
    [reminders]
  );

  // Meses disponibles en recordatorios (primer mes disponible por defecto)
  const remMonths = useMemo(() => [...new Map(reminders.map((r) => [monthKey(r.mes), r.mes])).values()].sort((a, b) => a - b), [reminders]);
  const activeMonth = remMonth ?? (remMonths[0] ?? null);
  const monthReminders = reminders.filter((r) => activeMonth !== null && monthKey(r.mes) === monthKey(activeMonth));

  if (!authed) {
    return (
      <main style={heroStyle} className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 text-white">
        <h1 className="text-4xl font-bold tracking-tight text-white">Finanzas</h1>
        <p className="mt-1 text-sm text-white/70">Tu hoja de 2026, desde el celular</p>
        <form onSubmit={login} className="mt-8 space-y-4 rounded-3xl border border-white/10 bg-[#16162a] p-6 shadow-2xl">
          <label className="block">
            <span className={lbl}>Contraseña de acceso</span>
            <input type="password" placeholder="••••••••" className={field} value={pass} onChange={(e) => setPass(e.target.value)} />
          </label>
          <button className={primary}>Entrar a la App</button>
          {msg && <p className="text-sm font-medium text-rose-400">{msg}</p>}
        </form>
      </main>
    );
  }

  const filtered = data.rows
    .filter((r) => [...r.values.slice(0, 1), monthName(r.values[MONTH]), ...r.values.slice(2)].join(" ").toLowerCase().includes(search.toLowerCase()))
    .reverse();

  const go = (t: Tab) => {
    setTab(t); setMsg(""); setPaying(null);
    if (t === "list" || t === "home") load();
    if (t === "rem" || t === "home") loadReminders();
    if (t === "add") { setEditing(null); setForm(emptyForm()); }
  };

  const nav: [Tab, string][] = [["home", "Resumen"], ["add", "Agregar"], ["list", "Consultar"], ["rem", "Recordatorios"]];

  return (
    <main className="mx-auto min-h-screen w-full max-w-md bg-[#0b0b1f] pb-32 text-white">
      {tab === "home" && <Summary txs={txs} pending={pending} />}

      {tab === "add" && (
        <>
          <Header title={editing !== null ? "Editar registro" : "Nuevo registro"} sub={editing !== null ? `Fila ${editing} de la hoja` : "Se sincroniza de inmediato con la hoja 2026"} />
          <form onSubmit={submit} className="relative mx-4 mt-6 space-y-4 rounded-3xl border border-white/10 bg-[#16162a] p-5 shadow-2xl">
            <div className="mx-auto -mt-2 mb-3 h-1 w-12 rounded-full bg-white/20" />
            
            {/* Concepto Selector: Gastos / Ingresos */}
            <div className="flex gap-2 rounded-2xl bg-[#1f1f38] p-1.5 border border-white/5">
              {CONCEPTS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => set("concept", c)}
                  className={`flex-1 rounded-xl py-2.5 text-xs font-bold uppercase tracking-wider transition-all ${
                    form.concept === c
                      ? (c === "Gastos" ? "bg-rose-600 text-white shadow-lg" : "bg-emerald-600 text-white shadow-lg")
                      : "text-white/40 hover:text-white"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            <label className="block">
              <span className={lbl}>Valor</span>
              <input inputMode="numeric" className={`${field} text-2xl font-bold`} placeholder="0" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
            </label>

            <label className="block">
              <span className={lbl}>Descripción</span>
              <select className={field} value={form.desc} onChange={(e) => set("desc", e.target.value)}>
                <option value="" className="bg-[#1a1a2e]">Selecciona una descripción...</option>
                {groups.map(([sub, descs]) => (
                  <optgroup key={sub} label={sub} className="bg-[#1a1a2e] text-white">
                    {descs.map((d) => <option key={d} value={d} className="bg-[#1f1f38]">{d}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>

            <label className="block">
              <span className={lbl}>Subconcepto (automático)</span>
              <input readOnly disabled className={`${field} text-white/50 bg-[#17172b] cursor-not-allowed`} value={subOf.get(form.desc) ?? ""} />
            </label>

            <label className="block">
              <span className={lbl}>Detalles</span>
              <input className={field} placeholder="Comentario o detalle opcional" value={form.detail} onChange={(e) => set("detail", e.target.value)} />
            </label>

            <div className="flex gap-3">
              <label className="block flex-1">
                <span className={lbl}>Mes</span>
                <select className={field} value={form.month} onChange={(e) => set("month", e.target.value)}>
                  {MONTHS.map((m) => <option key={m} value={m} className="bg-[#1f1f38]">{m}</option>)}
                </select>
              </label>
              <label className="block w-28">
                <span className={lbl}>Año</span>
                <input inputMode="numeric" className={field} value={form.year} onChange={(e) => set("year", e.target.value)} />
              </label>
            </div>

            <label className="block">
              <span className={lbl}>Medio de pago</span>
              <select className={field} value={form.method} onChange={(e) => set("method", e.target.value)}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m} className="bg-[#1f1f38]">{m}</option>)}
              </select>
            </label>

            <label className="flex items-center gap-3 pt-2 text-sm text-white/80 cursor-pointer">
              <input
                type="checkbox"
                className="h-5 w-5 rounded-md accent-[#7c4dbc] bg-[#1f1f38] border-white/20"
                checked={form.done}
                onChange={(e) => set("done", e.target.checked)}
              />
              <span className="font-medium">Estado {DONE} (Completado)</span>
            </label>

            <button className={primary} disabled={busy}>
              {busy ? "Guardando..." : editing !== null ? "Actualizar Registro" : "Guardar Registro"}
            </button>
            {msg && <p className="text-center text-sm font-medium pt-1">{msg}</p>}
          </form>
        </>
      )}

      {tab === "list" && (
        <>
          <Header title="Movimientos" sub={`${data.rows.length} registros en la hoja 2026`} />
          <div className="mt-6 space-y-3 px-4">
            <input className={field} placeholder="Buscar por nombre, mes o categoría..." value={search} onChange={(e) => setSearch(e.target.value)} />
            
            <div className="space-y-2.5 pt-2">
              {filtered.map((r) => {
                const v = r.values[VALUE];
                return (
                  <div key={r.row} className="flex items-stretch gap-2">
                    <button
                      onClick={() => { setEditing(r.row); setForm(fromRow(r.values)); setTab("add"); setMsg(""); }}
                      className="relative flex min-w-0 flex-1 items-center gap-3.5 rounded-2xl border border-white/10 bg-[#16162a] p-3.5 text-left shadow-lg active:scale-[0.99] transition-all"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#22223f] text-sm font-bold text-white shadow-inner">
                        {String(r.values[DESC]).charAt(0)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-white">
                          {String(r.values[DESC])}{String(r.values[DETAIL]).trim() && ` · ${String(r.values[DETAIL]).trim()}`}
                        </span>
                        <span className="block truncate text-xs text-white/50">
                          {monthName(r.values[MONTH])} · {String(r.values[SUB])} · {String(r.values[METHOD])}
                        </span>
                      </span>
                      <span className={`text-sm font-bold ${Number(v) < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                        {money(v)}
                      </span>
                    </button>
                    <button
                      aria-label="Borrar registro"
                      disabled={busy}
                      onClick={() => remove(r)}
                      className="flex items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3.5 text-rose-400 hover:bg-rose-500/20 active:scale-95 transition-all disabled:opacity-50"
                    >
                      🗑️
                    </button>
                  </div>
                );
              })}
              {filtered.length === 0 && <p className="text-center py-8 text-white/40">Sin resultados coincidentes</p>}
            </div>
          </div>
        </>
      )}

      {tab === "rem" && (
        <>
          <Header title="Recordatorios" sub={`${monthReminders.filter(isPaid).length} de ${monthReminders.length} pagados`} />
          <div className="mt-6 space-y-4 px-4">
            <select className={field} value={activeMonth ?? ""} onChange={(e) => setRemMonth(Number(e.target.value))}>
              {remMonths.map((m) => <option key={m} value={m} className="bg-[#1f1f38]">{monthLabel(m)}</option>)}
            </select>
            {msg && <p className="text-center text-sm font-medium">{msg}</p>}

            <div className="space-y-3">
              {monthReminders.map((r) => {
                const open = paying?.row === r.row;
                return (
                  <div key={r.row} className={`relative rounded-2xl border border-white/10 bg-[#16162a] p-4 shadow-xl transition-all ${isPaid(r) ? "opacity-60" : ""}`}>
                    <button
                      disabled={isPaid(r)}
                      className="block w-full text-left"
                      onClick={() => setPaying(open ? null : { row: r.row, amount: r.estimado ? String(Math.abs(r.estimado)) : "", method: PAYMENT_METHODS[0] })}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white">
                          {r.desc}{r.detalle.trim() && r.detalle !== r.desc ? ` · ${r.detalle}` : ""}
                        </span>
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${isPaid(r) ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>
                          {isPaid(r) ? "Pagado" : "Pendiente"}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-white/50">
                        Vence: {serialDate(r.fecha).toISOString().slice(0, 10)} · Estimado: {r.estimado ? money(Math.abs(r.estimado)) : "—"}
                        {isPaid(r) && r.pagado !== "" && ` · Pagado: ${money(r.pagado)}`}
                      </div>
                    </button>
                    {open && paying && (
                      <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                        <label className="block">
                          <span className={lbl}>Valor pagado real</span>
                          <input inputMode="numeric" autoFocus className={field} value={paying.amount} onChange={(e) => setPaying({ ...paying, amount: e.target.value })} />
                        </label>
                        <label className="block">
                          <span className={lbl}>Medio de pago</span>
                          <select className={field} value={paying.method} onChange={(e) => setPaying({ ...paying, method: e.target.value })}>
                            {PAYMENT_METHODS.map((m) => <option key={m} value={m} className="bg-[#1f1f38]">{m}</option>)}
                          </select>
                        </label>
                        <button className={primary} disabled={busy} onClick={pay}>
                          {busy ? "Guardando..." : "Confirmar Pago en Hoja"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {monthReminders.length === 0 && <p className="text-center py-8 text-white/40">Sin recordatorios para este mes</p>}
            </div>
          </div>
        </>
      )}

      {/* Navegación inferior fija */}
      <nav className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-md justify-around border-t border-white/10 bg-[#0e0e24]/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur-2xl">
        {nav.map(([t, name]) => (
          <button key={t} onClick={() => go(t)} className="flex flex-1 flex-col items-center gap-1 py-1 focus:outline-none">
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all ${tab === t ? "bg-[#7c4dbc]/30 text-white" : "text-white/40 hover:text-white"}`}>
              <Icon tab={t} active={tab === t} />
            </div>
            <span className={`text-[10px] font-medium tracking-wide ${tab === t ? "text-white font-semibold" : "text-white/40"}`}>
              {name}
            </span>
          </button>
        ))}
      </nav>
    </main>
  );
}
