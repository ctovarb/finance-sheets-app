"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CONCEPTS, DONE, MONTHS, PAYMENT_METHODS, monthSerial, serialDate } from "@/lib/categories";
import Summary, { type PendingReminder, type Tx } from "@/components/Summary";
import CreditCardView from "@/components/CreditCard";

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

const emptyForm = (defaultMonth?: string, defaultYear?: string): Form => ({
  year: defaultYear || "2026",
  month: defaultMonth || "octubre",
  concept: "Gastos", desc: "", detail: "", amount: "",
  done: true, method: PAYMENT_METHODS[0],
});

const money = (v: Cell) =>
  typeof v === "number"
    ? v.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })
    : String(v);

const cop = (n: number) =>
  n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const short = (n: number) =>
  Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n));

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
  c[STATUS] = DONE;
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

function getDueDateInfo(fechaSerial: number, paid: boolean) {
  if (!fechaSerial) return { dateStr: "—", className: "text-white/40", tag: "" };
  const d = serialDate(fechaSerial);
  if (isNaN(d.getTime())) return { dateStr: "—", className: "text-white/40", tag: "" };
  const dateStr = d.toISOString().slice(0, 10);

  if (paid) {
    return {
      dateStr,
      className: "line-through text-white/40 decoration-white/40",
      tag: "",
    };
  }

  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const due = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) {
    return {
      dateStr,
      className: "font-semibold text-rose-400",
      tag: `${Math.abs(diffDays)}d`,
    };
  }
  if (diffDays <= 5) {
    return {
      dateStr,
      className: "font-semibold text-amber-300",
      tag: `${diffDays}d`,
    };
  }
  return {
    dateStr,
    className: "text-white/60",
    tag: "",
  };
}

type Tab = "home" | "card" | "add" | "list" | "rem";

const ICONS: Record<Tab, string> = {
  home: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  card: "M3 5h18a2 2 0 012 2v10a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2zm-1 5h22",
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
    <header style={heroStyle} className="rounded-b-[2.5rem] md:rounded-3xl md:mt-4 px-6 md:px-8 pb-8 pt-10 md:pt-8 shadow-2xl">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white">{title}</h1>
      {sub && <p className="mt-1 md:mt-1.5 text-sm md:text-base text-white/70">{sub}</p>}
    </header>
  );
}

export default function Home() {
  const [pass, setPass] = useState("");
  const [authed, setAuthed] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [tab, setTab] = useState<Tab>("home");
  const [data, setData] = useState<Data>({ headers: [], rows: [] });
  const [params, setParams] = useState<Param[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [form, setForm] = useState<Form>(emptyForm());
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [search, setSearch] = useState("");
  const [filterMonth, setFilterMonth] = useState<number | "all">(() => {
    const now = new Date();
    return now.getFullYear() * 12 + now.getMonth();
  });
  const [filterConcept, setFilterConcept] = useState<"all" | "Ingresos" | "Gastos">("all");
  const [filterSub, setFilterSub] = useState<"all" | string>("all");
  const [filterMethod, setFilterMethod] = useState<"all" | string>("all");
  const [remMonth, setRemMonth] = useState<number | null>(null);
  const [cardMonth, setCardMonth] = useState<number | "all">(() => {
    const now = new Date();
    return now.getFullYear() * 12 + now.getMonth();
  });
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [paying, setPaying] = useState<{ row: number; amount: string; method: string } | null>(null);
  const [descSearch, setDescSearch] = useState("");
  const [descOpen, setDescOpen] = useState(false);
  const [successModal, setSuccessModal] = useState<{
    isOpen: boolean;
    title: string;
    desc: string;
    amount: string;
  } | null>(null);

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
    const now = new Date();
    const curMonth = MONTHS[now.getMonth()];
    const curYear = String(now.getFullYear());
    if (curMonth) {
      setForm((f) => ({
        ...f,
        month: f.desc ? f.month : curMonth,
        year: f.desc ? f.year : curYear,
      }));
    }

    const saved = localStorage.getItem("pw");
    if (saved) {
      boot(saved)
        .then(() => {
          setPass(saved);
          setAuthed(true);
        })
        .catch(() => {
          localStorage.removeItem("pw");
          setAuthed(false);
        })
        .finally(() => {
          setCheckingAuth(false);
        });
    } else {
      setCheckingAuth(false);
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

  const filteredDescs = useMemo(() => {
    if (!descSearch.trim()) return params;
    const q = descSearch.toLowerCase().trim();
    return params.filter((p) => p.desc.toLowerCase().includes(q) || p.sub.toLowerCase().includes(q));
  }, [params, descSearch]);

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
      const savedAmount = money(toValue(form));
      const savedDetail = String(form.detail).trim();
      const savedLabel = savedDetail ? `${form.desc} · ${savedDetail}` : form.desc;
      setEditing(null);
      setForm({ ...emptyForm(), month: form.month, method: form.method });
      setDescSearch("");
      setDescOpen(false);
      setIsAddOpen(false);
      setSuccessModal({
        isOpen: true,
        title: wasEditing ? "¡Registro actualizado!" : "¡Registro guardado con éxito!",
        desc: `${savedLabel} (${form.month} ${form.year})`,
        amount: savedAmount,
      });
      await load();
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

  // Meses disponibles en recordatorios (mes actual o más reciente por defecto)
  const remMonths = useMemo(() => [...new Map(reminders.map((r) => [monthKey(r.mes), r.mes])).values()].sort((a, b) => a - b), [reminders]);
  const defaultRemMonth = useMemo(() => {
    if (remMonths.length === 0) return null;
    const now = new Date();
    const curKey = now.getFullYear() * 12 + now.getMonth();
    const currentMatch = remMonths.find((m) => monthKey(m) === curKey);
    if (currentMatch !== undefined) return currentMatch;
    return remMonths[remMonths.length - 1] ?? remMonths[0];
  }, [remMonths]);
  const activeMonth = remMonth ?? defaultRemMonth;
  const monthReminders = useMemo(() => {
    const list = reminders.filter((r) => activeMonth !== null && monthKey(r.mes) === monthKey(activeMonth));
    return list.slice().sort((a, b) => {
      const aPaid = isPaid(a) ? 1 : 0;
      const bPaid = isPaid(b) ? 1 : 0;
      if (aPaid !== bPaid) return aPaid - bPaid;
      return a.fecha - b.fecha;
    });
  }, [reminders, activeMonth]);

  const handleNavigateToList = useCallback(
    (filters: { monthKey?: number; concept?: "Ingresos" | "Gastos"; method?: string }) => {
      if (filters.monthKey !== undefined) setFilterMonth(filters.monthKey);
      else setFilterMonth("all");

      if (filters.concept !== undefined) setFilterConcept(filters.concept);
      else setFilterConcept("all");

      if (filters.method !== undefined) setFilterMethod(filters.method);
      else setFilterMethod("all");

      setSearch("");
      setTab("list");
    },
    []
  );

  const handleNavigateToReminders = useCallback(
    (targetMonthKey?: number) => {
      if (targetMonthKey !== undefined) {
        const match = remMonths.find((m) => monthKey(m) === targetMonthKey);
        if (match !== undefined) setRemMonth(match);
      }
      setTab("rem");
    },
    [remMonths]
  );

  const handleNavigateToCard = useCallback((targetMonthKey?: number) => {
    if (targetMonthKey !== undefined) setCardMonth(targetMonthKey);
    setTab("card");
  }, []);

  const availableMonths = useMemo(() => {
    const map = new Map<number, string>();
    const now = new Date();
    const curKey = now.getFullYear() * 12 + now.getMonth();
    const curLabel = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
    map.set(curKey, curLabel);
    txs.forEach((t) => map.set(t.monthKey, t.monthLabel));
    return [...map.entries()].sort(([a], [b]) => b - a);
  }, [txs]);

  const availableSubs = useMemo(() => {
    const set = new Set<string>();
    params.forEach((p) => {
      if (p.sub) set.add(p.sub.trim());
    });
    data.rows.forEach((r) => {
      const s = String(r.values[SUB] ?? "").trim() || (subOf.get(String(r.values[DESC])) ?? "");
      if (s) set.add(s.trim());
    });
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [params, data.rows, subOf]);

  const openAddModal = useCallback(() => {
    setEditing(null);
    const targetKey =
      cardMonth !== "all"
        ? cardMonth
        : filterMonth !== "all"
        ? filterMonth
        : null;
    const m = targetKey !== null ? MONTHS[targetKey % 12] : form.month;
    const y = targetKey !== null ? String(Math.floor(targetKey / 12)) : form.year;
    setForm({ ...emptyForm(m, y), month: m, year: y });
    setDescSearch("");
    setDescOpen(false);
    setMsg("");
    setIsAddOpen(true);
  }, [cardMonth, filterMonth, form.month, form.year]);

  const handleAddCardPayment = useCallback(() => {
    setEditing(null);
    const targetKey = cardMonth !== "all" ? cardMonth : (availableMonths[0]?.[0] ?? null);
    const m = targetKey !== null ? MONTHS[targetKey % 12] : form.month;
    const y = targetKey !== null ? String(Math.floor(targetKey / 12)) : form.year;
    setForm({
      ...emptyForm(m, y),
      month: m,
      year: y,
      concept: "Gastos",
      desc: "Pago Tarjeta de Crédito",
      method: PAYMENT_METHODS[0],
    });
    setDescSearch("Pago Tarjeta de Crédito");
    setDescOpen(false);
    setIsAddOpen(true);
  }, [cardMonth, availableMonths, form.month, form.year]);

  const handleAddCardExpense = useCallback(() => {
    setEditing(null);
    const targetKey = cardMonth !== "all" ? cardMonth : (availableMonths[0]?.[0] ?? null);
    const m = targetKey !== null ? MONTHS[targetKey % 12] : form.month;
    const y = targetKey !== null ? String(Math.floor(targetKey / 12)) : form.year;
    setForm({
      ...emptyForm(m, y),
      month: m,
      year: y,
      concept: "Gastos",
      method: "Tarjeta de Crédito",
    });
    setDescSearch("");
    setDescOpen(false);
    setIsAddOpen(true);
  }, [cardMonth, availableMonths, form.month, form.year]);

  const handleEditRowFromCard = useCallback((r: Row) => {
    setEditing(r.row);
    setForm(fromRow(r.values));
    setDescSearch("");
    setDescOpen(false);
    setIsAddOpen(true);
  }, []);

  const filtered = useMemo(() => {
    const list = data.rows.filter((r) => {
      if (filterMonth !== "all") {
        if (typeof r.values[MONTH] !== "number") return false;
        if (monthKey(r.values[MONTH] as number) !== filterMonth) return false;
      }
      if (filterConcept !== "all") {
        if (String(r.values[CONCEPT]) !== filterConcept) return false;
      }
      if (filterSub !== "all") {
        const s = String(r.values[SUB] ?? "").trim() || (subOf.get(String(r.values[DESC])) ?? "");
        if (s.toLowerCase() !== filterSub.toLowerCase()) return false;
      }
      if (filterMethod !== "all") {
        if (String(r.values[METHOD]) !== filterMethod) return false;
      }
      if (search.trim()) {
        const text = [
          ...r.values.slice(0, 1),
          monthName(r.values[MONTH]),
          ...r.values.slice(2),
          subOf.get(String(r.values[DESC])) || ""
        ]
          .join(" ")
          .toLowerCase();
        if (!text.includes(search.toLowerCase().trim())) return false;
      }
      return true;
    });

    // Ordenar siempre del registro más nuevo al más viejo
    return list.sort((a, b) => {
      const monthA = typeof a.values[MONTH] === "number" ? (a.values[MONTH] as number) : 0;
      const monthB = typeof b.values[MONTH] === "number" ? (b.values[MONTH] as number) : 0;
      if (monthA !== monthB) {
        return monthB - monthA;
      }
      return b.row - a.row;
    });
  }, [data.rows, filterMonth, filterConcept, filterSub, filterMethod, search, subOf]);

  const filteredTotals = useMemo(() => {
    let gastos = 0;
    let ingresos = 0;
    filtered.forEach((r) => {
      const v = typeof r.values[VALUE] === "number" ? (r.values[VALUE] as number) : 0;
      const concept = String(r.values[CONCEPT] ?? "");
      if (concept === "Ingresos" || v > 0) {
        ingresos += Math.abs(v);
      } else {
        gastos += Math.abs(v);
      }
    });
    const saldo = ingresos - gastos;
    return { gastos, ingresos, saldo, count: filtered.length };
  }, [filtered]);

  if (checkingAuth) {
    return (
      <main style={heroStyle} className="mx-auto flex min-h-screen w-full max-w-md md:max-w-lg flex-col items-center justify-center px-6 text-center text-white">
        <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-tr from-[#7c4dbc] via-[#9b6ad8] to-[#f0764a] p-1 shadow-2xl shadow-[#7c4dbc]/50 animate-pulse">
          <div className="flex h-full w-full items-center justify-center rounded-[22px] bg-[#16162a]/90 backdrop-blur-sm">
            <span className="text-4xl font-extrabold tracking-tight text-white">$</span>
          </div>
        </div>
        <h1 className="mt-6 text-3xl font-bold tracking-tight text-white">Finanzas</h1>
        <p className="mt-1.5 text-sm text-white/60">Verificando acceso y cargando datos...</p>
        <div className="mt-8 flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-[#f0764a] animate-bounce [animation-delay:-0.3s]" />
          <div className="h-2 w-2 rounded-full bg-[#9b6ad8] animate-bounce [animation-delay:-0.15s]" />
          <div className="h-2 w-2 rounded-full bg-[#4fd1c5] animate-bounce" />
        </div>
      </main>
    );
  }

  if (!authed) {
    return (
      <main style={heroStyle} className="mx-auto flex min-h-screen w-full max-w-md md:max-w-lg flex-col justify-center px-6 text-white">
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

  const go = (t: Tab) => {
    if (t === "add") {
      openAddModal();
      return;
    }
    setTab(t); setMsg(""); setPaying(null);
    if (t === "list" || t === "home" || t === "card") load();
    if (t === "rem" || t === "home") loadReminders();
  };

  const nav: [Tab, string][] = [
    ["home", "Resumen"],
    ["card", "Tarjeta"],
    ["add", "Agregar"],
    ["list", "Consultar"],
    ["rem", "Recordatorios"],
  ];

  return (
    <main className="mx-auto min-h-screen w-full max-w-md md:max-w-4xl lg:max-w-6xl xl:max-w-7xl bg-[#0b0b1f] pb-28 md:pb-16 text-white px-0 md:px-6">
      {/* Barra de navegación superior fija en pantallas de escritorio / web */}
      <header className="hidden md:flex sticky top-0 z-50 items-center justify-between border-b border-white/10 bg-[#0b0b1f]/90 px-6 py-3.5 backdrop-blur-xl mb-4 rounded-b-2xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#7c4dbc] via-[#9b6ad8] to-[#f0764a] text-lg font-bold text-white shadow-lg shadow-[#7c4dbc]/30">
            $
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-white">Finanzas</span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/70">2026</span>
            </div>
            <p className="text-[11px] text-white/50">Panel de Control Web</p>
          </div>
        </div>

        {/* Pestañas de escritorio */}
        <nav className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-[#16162a]/90 p-1.5 backdrop-blur-md shadow-xl">
          {nav.map(([t, name]) => (
            <button
              key={t}
              onClick={() => go(t)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
                tab === t
                  ? "bg-gradient-to-r from-[#7c4dbc] to-[#9b6ad8] text-white shadow-lg shadow-[#7c4dbc]/30"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon tab={t} active={tab === t} />
              <span>{name}</span>
            </button>
          ))}
        </nav>

        {/* Acciones rápidas (Sincronizar y Salir) */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => { load(); loadReminders(); }}
            title="Recargar datos de Google Sheets"
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#16162a] px-3.5 py-2 text-xs font-medium text-white/80 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19" />
            </svg>
            <span>Sincronizar</span>
          </button>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem("pw");
              setAuthed(false);
            }}
            title="Cerrar sesión"
            className="flex items-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-300 hover:bg-rose-500/20 active:scale-95 transition-all"
          >
            <span>Salir</span>
          </button>
        </div>
      </header>

      {tab === "home" && (
        <Summary
          txs={txs}
          pending={pending}
          onNavigateToList={handleNavigateToList}
          onNavigateToReminders={handleNavigateToReminders}
          onNavigateToCard={handleNavigateToCard}
        />
      )}

      {tab === "card" && (
        <CreditCardView
          rows={data.rows}
          txs={txs}
          activeMonth={cardMonth}
          onSelectMonth={setCardMonth}
          onAddPayment={handleAddCardPayment}
          onAddExpense={handleAddCardExpense}
          onEditRow={handleEditRowFromCard}
        />
      )}

      {/* Modal Popup para Agregar / Editar Registro */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-[#16162a] p-5 md:p-7 shadow-2xl my-auto animate-in zoom-in-95 duration-150">
            {/* Header del Modal */}
            <div className="flex items-start justify-between pb-3 border-b border-white/10">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-white">
                  {editing !== null ? "Editar registro" : "Nuevo registro"}
                </h2>
                <p className="text-xs text-white/60 mt-0.5">
                  {editing !== null ? `Fila ${editing} de la hoja` : "Se sincroniza de inmediato con la hoja 2026"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setIsAddOpen(false); setEditing(null); }}
                className="rounded-xl bg-white/10 p-2 text-white/60 hover:text-white hover:bg-white/20 transition-all"
                aria-label="Cerrar modal"
              >
                ✕
              </button>
            </div>

            <form onSubmit={submit} className="mt-4 space-y-4">
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

              {/* Buscador de descripción */}
              <div className="space-y-1">
                <span className={lbl}>Descripción</span>
                {form.desc && !descOpen ? (
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#1f1f38] px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold text-white">{form.desc}</span>
                      <span className="block truncate text-xs text-white/50">{subOf.get(form.desc) || "Categoría"}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDescOpen(true);
                        setDescSearch("");
                      }}
                      className="ml-3 shrink-0 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold text-[#9b6ad8] hover:bg-white/20 active:scale-95 transition-all"
                    >
                      Cambiar ✎
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="relative">
                      <input
                        type="text"
                        autoFocus={descOpen}
                        placeholder="Buscar descripción (ej. Mercado, Gasolina)..."
                        className={`${field} pl-10 pr-9`}
                        value={descSearch}
                        onChange={(e) => {
                          setDescSearch(e.target.value);
                          setDescOpen(true);
                        }}
                        onFocus={() => setDescOpen(true)}
                      />
                      <svg
                        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      {(descSearch || descOpen) && (
                        <button
                          type="button"
                          onClick={() => {
                            setDescSearch("");
                            if (form.desc) setDescOpen(false);
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-white/50 hover:text-white"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Lista desplegable filtrada */}
                    {descOpen && (
                      <div className="mt-1.5 max-h-48 overflow-y-auto rounded-2xl border border-white/10 bg-[#16162a] p-1.5 shadow-2xl space-y-1 z-30">
                        {filteredDescs.map((p) => (
                          <button
                            type="button"
                            key={p.desc}
                            onClick={() => {
                              set("desc", p.desc);
                              setDescOpen(false);
                              setDescSearch("");
                            }}
                            className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm transition-all flex items-center justify-between ${
                              form.desc === p.desc
                                ? "bg-[#7c4dbc] text-white font-semibold"
                                : "text-white/80 hover:bg-white/10"
                            }`}
                          >
                            <span className="truncate">{p.desc}</span>
                            <span className="text-[11px] text-white/40 truncate ml-2 shrink-0">{p.sub}</span>
                          </button>
                        ))}
                        {filteredDescs.length === 0 && (
                          <p className="py-4 text-center text-xs text-white/40">No hay descripciones coincidentes</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <label className="block">
                <span className={lbl}>Detalles</span>
                <input className={field} placeholder="Comentario o detalle opcional" value={form.detail} onChange={(e) => set("detail", e.target.value)} />
              </label>

              <div className="flex gap-3">
                <label className="block flex-1">
                  <span className={lbl}>Mes al que aplica</span>
                  <select className={field} value={form.month} onChange={(e) => set("month", e.target.value)}>
                    {MONTHS.map((m) => <option key={m} value={m} className="bg-[#1f1f38] capitalize">{m}</option>)}
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

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setIsAddOpen(false); setEditing(null); }}
                  className="w-1/3 rounded-2xl border border-white/10 bg-white/5 py-3.5 text-sm font-semibold text-white/70 hover:bg-white/10 hover:text-white transition-all"
                >
                  Cancelar
                </button>
                <button type="submit" className={`${primary} flex-1`} disabled={busy}>
                  {busy ? "Guardando..." : editing !== null ? "Actualizar" : "Guardar"}
                </button>
              </div>
              {msg && <p className="text-center text-sm font-medium pt-1 text-rose-400">{msg}</p>}
            </form>
          </div>
        </div>
      )}

      {tab === "list" && (
        <>
          <Header
            title="Movimientos"
            sub={`${filtered.length} de ${data.rows.length} registros`}
          />
          <div className="mt-6 space-y-4 px-4 md:px-0">
            {/* Buscador de texto */}
            <div className="relative">
              <input
                className={`${field} pl-10 pr-9`}
                placeholder="Buscar por detalle, descripción o medio..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <svg
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-white/50 hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Cuadrícula de 4 Filtros: Mes, Concepto, Tipo/Subconcepto, Medio de Pago */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              {/* Filtro Mes */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1">
                  Mes
                </label>
                <select
                  value={filterMonth === "all" ? "all" : String(filterMonth)}
                  onChange={(e) => setFilterMonth(e.target.value === "all" ? "all" : Number(e.target.value))}
                  className="w-full rounded-xl border border-white/10 bg-[#1f1f38] px-3 py-2 text-xs font-semibold capitalize text-white outline-none focus:border-[#9b6ad8]"
                >
                  <option value="all" className="bg-[#1f1f38]">Todos los meses</option>
                  {availableMonths.map(([k, label]) => (
                    <option key={k} value={k} className="bg-[#1f1f38] capitalize">
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro Concepto (Gasto o Ingreso) */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1">
                  Concepto
                </label>
                <select
                  value={filterConcept}
                  onChange={(e) => setFilterConcept(e.target.value as "all" | "Ingresos" | "Gastos")}
                  className="w-full rounded-xl border border-white/10 bg-[#1f1f38] px-3 py-2 text-xs font-semibold text-white outline-none focus:border-[#9b6ad8]"
                >
                  <option value="all" className="bg-[#1f1f38]">Gastos e Ingresos</option>
                  <option value="Gastos" className="bg-[#1f1f38]">Solo Gastos</option>
                  <option value="Ingresos" className="bg-[#1f1f38]">Solo Ingresos</option>
                </select>
              </div>

              {/* Filtro Tipo / Subconcepto */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1">
                  Tipo / Subconcepto
                </label>
                <select
                  value={filterSub}
                  onChange={(e) => setFilterSub(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#1f1f38] px-3 py-2 text-xs font-semibold text-white outline-none focus:border-[#9b6ad8]"
                >
                  <option value="all" className="bg-[#1f1f38]">Todos los tipos</option>
                  {availableSubs.map((s) => (
                    <option key={s} value={s} className="bg-[#1f1f38]">
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro Medio de Pago */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1">
                  Medio de Pago
                </label>
                <select
                  value={filterMethod}
                  onChange={(e) => setFilterMethod(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#1f1f38] px-3 py-2 text-xs font-semibold text-white outline-none focus:border-[#9b6ad8]"
                >
                  <option value="all" className="bg-[#1f1f38]">Todos los medios</option>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m} className="bg-[#1f1f38]">
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Chips de filtros activos */}
            {(filterMonth !== "all" || filterConcept !== "all" || filterSub !== "all" || filterMethod !== "all" || search.trim() !== "") && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[11px] font-medium text-white/40 mr-1">Filtros:</span>
                {filterMonth !== "all" && (
                  <button
                    type="button"
                    onClick={() => setFilterMonth("all")}
                    className="flex items-center gap-1 rounded-full border border-[#9b6ad8]/40 bg-[#7c4dbc]/30 px-2.5 py-1 text-xs font-medium capitalize text-white hover:bg-[#7c4dbc]/50"
                  >
                    <span>{availableMonths.find(([k]) => k === filterMonth)?.[1] ?? "Mes"}</span>
                    <span className="text-white/60">✕</span>
                  </button>
                )}
                {filterConcept !== "all" && (
                  <button
                    type="button"
                    onClick={() => setFilterConcept("all")}
                    className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${
                      filterConcept === "Gastos"
                        ? "border-rose-500/40 bg-rose-500/20 text-rose-300"
                        : "border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
                    }`}
                  >
                    <span>{filterConcept}</span>
                    <span className="opacity-70">✕</span>
                  </button>
                )}
                {filterSub !== "all" && (
                  <button
                    type="button"
                    onClick={() => setFilterSub("all")}
                    className="flex items-center gap-1 rounded-full border border-purple-500/40 bg-purple-500/20 px-2.5 py-1 text-xs font-medium text-purple-200"
                  >
                    <span>{filterSub}</span>
                    <span className="opacity-70">✕</span>
                  </button>
                )}
                {filterMethod !== "all" && (
                  <button
                    type="button"
                    onClick={() => setFilterMethod("all")}
                    className="flex items-center gap-1 rounded-full border border-[#f0764a]/40 bg-[#f0764a]/20 px-2.5 py-1 text-xs font-medium text-[#f0764a]"
                  >
                    <span>{filterMethod}</span>
                    <span className="opacity-70">✕</span>
                  </button>
                )}
                {search.trim() !== "" && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-medium text-white"
                  >
                    <span>&ldquo;{search}&rdquo;</span>
                    <span className="opacity-70">✕</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setFilterMonth("all");
                    setFilterConcept("all");
                    setFilterSub("all");
                    setFilterMethod("all");
                    setSearch("");
                  }}
                  className="ml-auto text-xs text-white/40 underline hover:text-white"
                >
                  Limpiar filtros
                </button>
              </div>
            )}

            {/* Resumen / Totales del filtro actual */}
            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#1c1c38] to-[#121226] p-4 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-[#9b6ad8] animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-wider text-white/70">
                    {filterSub !== "all" ? `Total ${filterSub}` : filterConcept !== "all" ? `Total ${filterConcept}` : "Saldo de la Búsqueda"}
                  </span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/60">
                    {filteredTotals.count} {filteredTotals.count === 1 ? "registro" : "registros"}
                  </span>
                </div>
                {filterMonth !== "all" && (
                  <span className="text-xs font-semibold text-purple-300 capitalize">
                    {availableMonths.find(([k]) => k === filterMonth)?.[1]}
                  </span>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div className="rounded-xl bg-[#16162a]/80 border border-white/5 p-3">
                  <span className="block text-[11px] font-medium text-white/50">Gastos</span>
                  <span className="text-base sm:text-lg font-bold text-rose-400">
                    {cop(filteredTotals.gastos)}
                  </span>
                </div>

                <div className="rounded-xl bg-[#16162a]/80 border border-white/5 p-3">
                  <span className="block text-[11px] font-medium text-white/50">Ingresos</span>
                  <span className="text-base sm:text-lg font-bold text-emerald-400">
                    {cop(filteredTotals.ingresos)}
                  </span>
                </div>

                <div className="col-span-2 sm:col-span-1 rounded-xl bg-[#16162a]/80 border border-white/5 p-3">
                  <span className="block text-[11px] font-medium text-white/50">
                    {filteredTotals.ingresos > 0 && filteredTotals.gastos > 0
                      ? "Saldo Neto"
                      : filteredTotals.ingresos > 0
                      ? "Total Ingresos"
                      : "Total Gastos"}
                  </span>
                  <span className={`text-base sm:text-lg font-bold ${filteredTotals.saldo >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {cop(filteredTotals.saldo)}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              {filtered.map((r) => {
                const v = r.values[VALUE];
                return (
                  <div key={r.row} className="flex items-stretch gap-2">
                    <button
                      onClick={() => { setEditing(r.row); setForm(fromRow(r.values)); setIsAddOpen(true); setMsg(""); }}
                      className="relative flex min-w-0 flex-1 items-center gap-3.5 rounded-2xl border border-white/10 bg-[#16162a] p-3.5 text-left shadow-lg active:scale-[0.99] transition-all"
                    >
                      {(() => {
                        const detailText = String(r.values[DETAIL]).trim() || String(r.values[DESC]);
                        return (
                          <>
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#22223f] text-sm font-bold uppercase text-white shadow-inner">
                              {detailText.charAt(0)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-white">
                                {detailText}
                              </span>
                              <span className="block truncate text-xs text-white/50">
                                {monthName(r.values[MONTH])} · {String(r.values[METHOD])}
                              </span>
                            </span>
                          </>
                        );
                      })()}
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
              {filtered.length === 0 && (
                <div className="py-12 text-center text-white/40">
                  <p className="text-base font-semibold">Sin resultados coincidentes</p>
                  <p className="mt-1 text-xs">Prueba cambiando el mes o quitando los filtros</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {tab === "rem" && (
        <>
          <Header title="Recordatorios" sub={`${monthReminders.filter(isPaid).length} de ${monthReminders.length} pagados`} />
          <div className="mt-6 space-y-4 px-4 md:px-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/60">Mes de recordatorios</span>
              <select className={`${field} sm:w-72`} value={activeMonth ?? ""} onChange={(e) => setRemMonth(Number(e.target.value))}>
                {remMonths.map((m) => <option key={m} value={m} className="bg-[#1f1f38]">{monthLabel(m)}</option>)}
              </select>
            </div>
            {msg && <p className="text-center text-sm font-medium">{msg}</p>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
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
                      {(() => {
                        const dueInfo = getDueDateInfo(r.fecha, isPaid(r));
                        const paid = isPaid(r);
                        return (
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/50">
                            <span className={dueInfo.className}>
                              Vence: {dueInfo.dateStr}{dueInfo.tag ? ` ${dueInfo.tag}` : ""}
                            </span>
                            <span>·</span>
                            {paid ? (
                              <span className="font-medium text-emerald-400">
                                Pagado: {r.pagado !== "" ? money(r.pagado) : r.estimado ? money(Math.abs(r.estimado)) : "—"}
                              </span>
                            ) : (
                              <span>Estimado: {r.estimado ? money(Math.abs(r.estimado)) : "—"}</span>
                            )}
                          </div>
                        );
                      })()}
                    </button>
                    {open && paying && (
                      <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                        <div className="rounded-xl border border-white/10 bg-[#1f1f38]/80 px-3.5 py-2 text-xs text-white/70">
                          Aplica para el mes de <strong className="text-white capitalize">{monthLabel(r.mes)}</strong>
                        </div>
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

      {/* Navegación inferior fija en móviles */}
      <nav className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-md justify-around border-t border-white/10 bg-[#0e0e24]/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur-2xl md:hidden">
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

      {/* Pop-up modal de confirmación al guardar registro */}
      {successModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-5 backdrop-blur-md">
          <div className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-[#16162a] p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/20 text-3xl text-emerald-400">
              ✓
            </div>
            <h3 className="mt-4 text-xl font-bold tracking-tight text-white">{successModal.title}</h3>
            <p className="mt-1.5 text-sm text-white/60">{successModal.desc}</p>
            <div className="my-4 rounded-2xl border border-white/5 bg-[#1f1f38] py-3 text-2xl font-bold text-white shadow-inner">
              {successModal.amount}
            </div>
            <button
              type="button"
              onClick={() => {
                setSuccessModal(null);
                setTab("home");
              }}
              className="w-full rounded-2xl bg-gradient-to-r from-[#7c4dbc] to-[#9b6ad8] py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#7c4dbc]/30 active:scale-[0.98] transition-all"
            >
              Aceptar y volver al Resumen
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
