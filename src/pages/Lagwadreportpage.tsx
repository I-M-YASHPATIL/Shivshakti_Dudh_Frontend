import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import api, { ledgerAPI } from "../services/api";
import { useBranch } from "./Branchcontext";
import type { Farmer } from "../types/dairyTypes";
import toast from "react-hot-toast";
import {
  Search,
  Download,
  Users,
  IndianRupee,
  ClipboardList,
  RefreshCw,
  ChevronDown,
} from "lucide-react";

// ─── helpers ────────────────────────────────────────────────────────────────

const pad = (x: number) => String(x).padStart(2, "0");
const toISO = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const fmtDate = (d?: string | null): string => {
  if (!d) return "-";
  const [y, m, day] = d.slice(0, 10).split("-");
  return y && m && day ? `${day}/${m}/${y}` : d;
};

const fmtQty = (q: number) => String(Number(q.toFixed(2)));
const fmtMoney = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;

const OTHER_KEY = "__other__";
const OTHER_LABEL = "इतर (प्रकार नोंद नाही)";


function parseLagwadNote(
  note?: string | null,
): { name: string; qty: number; unit: string } | null {
  if (!note) return null;
  const m = note.match(/^(.+?)\s×\s([\d.]+)(?:\s([^\s(]+))?\s*\(₹[\d.]+\/([^)]*)\)/);
  if (!m) return null;
  const qty = parseFloat(m[2]);
  if (!qty || qty <= 0) return null;
  return { name: m[1].trim(), qty, unit: (m[3] || m[4] || "नग").trim() };
}

interface LagwadLine {
  farmerNumber: number;
  farmerName: string;
  entryDate: string;
  amount: number;
  typeKey: string; 
  typeName: string;
  unit: string;
  qty: number; 
  note: string;
}

interface ProducerRow {
  farmerNumber: number;
  farmerName: string;
  total: number;
  items: Map<string, { name: string; unit: string; qty: number; amount: number }>;
  lines: LagwadLine[];
}

async function runPool<T>(
  items: T[],
  size: number,
  worker: (item: T) => Promise<void>,
) {
  let i = 0;
  const runners = Array.from(
    { length: Math.min(size, items.length) },
    async () => {
      while (i < items.length) {
        const idx = i++;
        await worker(items[idx]);
      }
    },
  );
  await Promise.all(runners);
}


export default function LagwadReportPage() {
  const { activeBranchCode } = useBranch();

  const today = new Date();
  const [from, setFrom] = useState(
    toISO(new Date(today.getFullYear(), today.getMonth(), 1)),
  );
  const [to, setTo] = useState(toISO(today));
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [query, setQuery] = useState("");

  const [allLines, setAllLines] = useState<LagwadLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [expanded, setExpanded] = useState<number | null>(null);
  const loadId = useRef(0);

  const load = async () => {
    if (!activeBranchCode) {
      setAllLines([]);
      return;
    }
    const myId = ++loadId.current;
    setLoading(true);
    setProgress({ done: 0, total: 0 });
    try {
      const res = await api.get<Farmer[]>(`/${activeBranchCode}/farmers`, {
        params: { all: true },
      });
      const farmers = res.data;
      setProgress({ done: 0, total: farmers.length });

      const lines: LagwadLine[] = [];
      let done = 0;

      await runPool(farmers, 8, async (f) => {
        try {
          const ledger = await ledgerAPI.get(activeBranchCode, f.farmerNumber);
          for (const e of ledger.entries ?? []) {
            if (e.type !== "LAGAVAD") continue;
            const p = parseLagwadNote(e.note);
            lines.push({
              farmerNumber: f.farmerNumber,
              farmerName: f.name,
              entryDate: e.entryDate,
              amount: e.amount ?? 0,
              typeKey: p ? p.name : OTHER_KEY,
              typeName: p ? p.name : OTHER_LABEL,
              unit: p ? p.unit : "",
              qty: p ? p.qty : 0,
              note: e.note ?? "",
            });
          }
        } catch {
        } finally {
          done++;
          if (myId === loadId.current) setProgress({ done, total: farmers.length });
        }
      });

      if (myId === loadId.current) setAllLines(lines);
    } catch {
      if (myId === loadId.current) {
        setAllLines([]);
        toast.error("लागवड माहिती लोड करता आली नाही");
      }
    } finally {
      if (myId === loadId.current) setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [activeBranchCode]);

  // ── quick ranges ──
  const setRange = (a: Date, b: Date) => {
    setFrom(toISO(a));
    setTo(toISO(b));
  };
  const thisMonth = () =>
    setRange(new Date(today.getFullYear(), today.getMonth(), 1), today);
  const lastMonth = () =>
    setRange(
      new Date(today.getFullYear(), today.getMonth() - 1, 1),
      new Date(today.getFullYear(), today.getMonth(), 0),
    );
  const thisYear = () => setRange(new Date(today.getFullYear(), 0, 1), today);
  const todayOnly = () => setRange(today, today);

  // ── type dropdown options ──
  const typeOptions = useMemo(() => {
    const m = new Map<string, string>();
    allLines.forEach((l) => m.set(l.typeKey, l.typeName));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "mr"));
  }, [allLines]);

  // ── filtered by date / type / search ──
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allLines.filter((l) => {
      const d = l.entryDate.slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (typeFilter !== "ALL" && l.typeKey !== typeFilter) return false;
      if (
        q &&
        !(
          String(l.farmerNumber).includes(q) ||
          l.farmerName?.toLowerCase().includes(q)
        )
      )
        return false;
      return true;
    });
  }, [allLines, from, to, typeFilter, query]);

  // ── per-producer rows ──
  const producers = useMemo(() => {
    const map = new Map<number, ProducerRow>();
    for (const l of filtered) {
      let row = map.get(l.farmerNumber);
      if (!row) {
        row = {
          farmerNumber: l.farmerNumber,
          farmerName: l.farmerName,
          total: 0,
          items: new Map(),
          lines: [],
        };
        map.set(l.farmerNumber, row);
      }
      row.total += l.amount;
      row.lines.push(l);
      const key = l.typeKey + "|" + l.unit;
      const it = row.items.get(key) ?? {
        name: l.typeName,
        unit: l.unit,
        qty: 0,
        amount: 0,
      };
      it.qty += l.qty;
      it.amount += l.amount;
      row.items.set(key, it);
    }
    return [...map.values()]
      .map((r) => ({
        ...r,
        lines: [...r.lines].sort((a, b) => a.entryDate.localeCompare(b.entryDate)),
      }))
      .sort((a, b) => a.farmerNumber - b.farmerNumber);
  }, [filtered]);

  // ── per-type summary ──
  const typeSummary = useMemo(() => {
    const map = new Map<
      string,
      { name: string; unit: string; qty: number; amount: number; farmers: Set<number> }
    >();
    for (const l of filtered) {
      const key = l.typeKey + "|" + l.unit;
      const s = map.get(key) ?? {
        name: l.typeName,
        unit: l.unit,
        qty: 0,
        amount: 0,
        farmers: new Set<number>(),
      };
      s.qty += l.qty;
      s.amount += l.amount;
      s.farmers.add(l.farmerNumber);
      map.set(key, s);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "mr"));
  }, [filtered]);

  const totalAmount = filtered.reduce((s, l) => s + l.amount, 0);

  // ── CSV export ──
  const exportCsv = () => {
    if (!producers.length) return toast.error("निर्यात करण्यासाठी माहिती नाही");
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows: (string | number)[][] = [
      ["उत्पादक क्र.", "नाव", "लागवड प्रकार", "संख्या", "युनिट", "रक्कम (₹)"],
    ];
    producers.forEach((p) =>
      p.items.forEach((it) =>
        rows.push([
          p.farmerNumber,
          p.farmerName,
          it.name,
          it.qty ? fmtQty(it.qty) : "",
          it.unit,
          Math.round(it.amount),
        ]),
      ),
    );
    const csv = "\uFEFF" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `lagwad-report_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!activeBranchCode) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center text-gray-400">
        <p className="text-lg font-semibold">शाखा निवडा</p>
        <p className="text-sm mt-1">Please select a branch to see the report.</p>
      </div>
    );
  }

  const inputCls =
    "border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-orange-400 outline-none";
  const chipBtn =
    "px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-50 text-orange-800 border border-orange-200 hover:bg-orange-100";

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* ── Filters ── */}
      <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-bold text-green-900 flex items-center gap-2">
            <ClipboardList size={18} /> लागवड अहवाल — कालावधीनुसार
          </h3>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-semibold text-green-700 hover:bg-green-50 px-3 py-1.5 rounded-lg disabled:text-gray-400"
            title="माहिती पुन्हा लोड करा"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            रिफ्रेश
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              पासून
            </label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              पर्यंत
            </label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={todayOnly} className={chipBtn}>आज</button>
            <button onClick={thisMonth} className={chipBtn}>या महिन्यात</button>
            <button onClick={lastMonth} className={chipBtn}>मागील महिना</button>
            <button onClick={thisYear} className={chipBtn}>या वर्षात</button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="relative">
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              लागवड प्रकार
            </label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className={`${inputCls} pr-8 min-w-[180px] appearance-none`}
            >
              <option value="ALL">सर्व प्रकार</option>
              {typeOptions.map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-3 bottom-3 text-gray-400 pointer-events-none"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              उत्पादक शोधा
            </label>
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="क्रमांक किंवा नाव"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className={`${inputCls} w-full pl-9`}
              />
            </div>
          </div>
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded-xl text-sm font-semibold"
          >
            <Download size={15} /> CSV
          </button>
        </div>
      </div>

      {loading && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          माहिती लोड होत आहे... {progress.done}/{progress.total}
        </div>
      )}

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <Users size={13} /> लागवड घेतलेले उत्पादक
          </p>
          <p className="text-2xl font-bold text-green-900 mt-1">
            {producers.length}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <ClipboardList size={13} /> एकूण नोंदी
          </p>
          <p className="text-2xl font-bold text-green-900 mt-1">
            {filtered.length}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <IndianRupee size={13} /> एकूण रक्कम
          </p>
          <p className="text-2xl font-bold text-orange-700 mt-1">
            {fmtMoney(totalAmount)}
          </p>
        </div>
      </div>

      {/* ── Type-wise summary ── */}
      <div className="bg-white rounded-2xl border border-orange-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-orange-50 font-bold text-green-900 text-sm">
          प्रकारानुसार एकूण
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-orange-100 text-orange-900 text-xs">
                <th className="px-4 py-2 text-left">लागवड प्रकार</th>
                <th className="px-4 py-2 text-right">उत्पादक</th>
                <th className="px-4 py-2 text-right">एकूण संख्या</th>
                <th className="px-4 py-2 text-right">एकूण रक्कम</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {typeSummary.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                    या कालावधीत कोणतीही लागवड नोंद नाही
                  </td>
                </tr>
              ) : (
                typeSummary.map((s) => (
                  <tr key={s.name + s.unit}>
                    <td className="px-4 py-2 font-semibold text-green-900">
                      {s.name}
                    </td>
                    <td className="px-4 py-2 text-right">{s.farmers.size}</td>
                    <td className="px-4 py-2 text-right font-semibold">
                      {s.qty ? `${fmtQty(s.qty)} ${s.unit}` : "-"}
                    </td>
                    <td className="px-4 py-2 text-right">{fmtMoney(s.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Producer-wise list ── */}
      <div className="bg-white rounded-2xl border border-orange-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-orange-50 font-bold text-green-900 text-sm">
          उत्पादकानुसार लागवड
          <span className="ml-2 text-xs font-normal text-gray-400">
            (तपशीलासाठी ओळीवर क्लिक करा)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-green-800 text-green-100 text-xs">
                <th className="px-4 py-3 text-left">क्र.</th>
                <th className="px-4 py-3 text-left">उत्पादक</th>
                <th className="px-4 py-3 text-left">लागवड (प्रकार × संख्या)</th>
                <th className="px-4 py-3 text-right">एकूण रक्कम</th>
              </tr>
            </thead>
            <tbody>
              {producers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                    {loading ? "लोड होत आहे..." : "कोणताही उत्पादक सापडला नाही"}
                  </td>
                </tr>
              ) : (
                producers.map((p) => (
                  <Fragment key={p.farmerNumber}>
                    <tr
                      onClick={() =>
                        setExpanded(expanded === p.farmerNumber ? null : p.farmerNumber)
                      }
                      className="border-t border-gray-50 hover:bg-amber-50 cursor-pointer"
                    >
                      <td className="px-4 py-3 font-semibold text-green-900">
                        #{p.farmerNumber}
                      </td>
                      <td className="px-4 py-3">{p.farmerName}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {[...p.items.values()].map((it) => (
                            <span
                              key={it.name + it.unit}
                              className="inline-block bg-orange-100 text-orange-900 text-xs font-semibold px-2 py-0.5 rounded-full"
                            >
                              {it.name}
                              {it.qty ? `: ${fmtQty(it.qty)} ${it.unit}` : ` (${fmtMoney(it.amount)})`}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-bold">
                        {fmtMoney(p.total)}
                      </td>
                    </tr>

                    {expanded === p.farmerNumber && (
                      <tr className="bg-orange-50/60">
                        <td colSpan={4} className="px-6 py-3">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-500">
                                <th className="text-left py-1">दिनांक</th>
                                <th className="text-left py-1">प्रकार</th>
                                <th className="text-right py-1">संख्या</th>
                                <th className="text-right py-1">रक्कम</th>
                              </tr>
                            </thead>
                            <tbody>
                              {p.lines.map((l, i) => (
                                <tr key={i} className="border-t border-orange-100">
                                  <td className="py-1">{fmtDate(l.entryDate)}</td>
                                  <td className="py-1">{l.typeName}</td>
                                  <td className="py-1 text-right">
                                    {l.qty ? `${fmtQty(l.qty)} ${l.unit}` : "-"}
                                  </td>
                                  <td className="py-1 text-right">
                                    {fmtMoney(l.amount)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
            {producers.length > 0 && (
              <tfoot>
                <tr className="bg-green-50 font-bold text-green-900 border-t-2 border-green-200">
                  <td className="px-4 py-3" colSpan={3}>
                    एकूण ({producers.length} उत्पादक)
                  </td>
                  <td className="px-4 py-3 text-right">{fmtMoney(totalAmount)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        कालावधी: {fmtDate(from)} ते {fmtDate(to)}. लेजर पानावर “लागवड प्रकार”
        निवडून केलेल्या नोंदींचीच संख्या दिसते; प्रकार न निवडता स्वतः रक्कम टाकलेल्या
        नोंदी “इतर” मध्ये फक्त रकमेसह दिसतात.
      </p>
    </div>
  );
}