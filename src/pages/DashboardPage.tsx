import { useState, useEffect } from 'react';
import { milkEntryAPI, farmerAPI } from '../services/api';
import { useBranch } from '../pages/Branchcontext';
import type { MilkEntryResponse, Farmer } from '../types/dairyTypes';
import { format } from 'date-fns';
import { Milk, Users, TrendingUp, Sun, Moon, Calendar, Building2, Layers } from 'lucide-react';

type ViewMode = 'branch' | 'combined';

export default function DashboardPage() {
  const { activeBranchCode, branches } = useBranch();
  const today = format(new Date(), 'yyyy-MM-dd');

  const [viewMode,     setViewMode]     = useState<ViewMode>('branch');
  const [selectedDate, setSelectedDate] = useState(today);
  const [loading,      setLoading]      = useState(true);

  // Per-branch data (active branch)
  const [entries,  setEntries]  = useState<MilkEntryResponse[]>([]);
  const [farmers,  setFarmers]  = useState<Farmer[]>([]);

  // Combined data (all branches)
  const [allBranchData, setAllBranchData] = useState<
    { branch: typeof branches[0]; entries: MilkEntryResponse[]; farmers: Farmer[] }[]
  >([]);

  const isToday = selectedDate === today;

  // ── Load data ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeBranchCode) return;
    if (viewMode === 'branch') loadBranchData();
    else loadCombinedData();
  }, [selectedDate, activeBranchCode, viewMode]);

  const loadBranchData = async () => {
    setLoading(true);
    try {
      const [e, f] = await Promise.all([
        milkEntryAPI.getByDate(activeBranchCode, selectedDate),
        farmerAPI.getAll(activeBranchCode),
      ]);
      setEntries(e);
      setFarmers(f);
    } finally { setLoading(false); }
  };

  const loadCombinedData = async () => {
    setLoading(true);
    try {
      const results = await Promise.all(
        branches.map(async b => {
          const [e, f] = await Promise.all([
            milkEntryAPI.getByDate(b.code, selectedDate),
            farmerAPI.getAll(b.code),
          ]);
          return { branch: b, entries: e, farmers: f };
        })
      );
      setAllBranchData(results);
    } finally { setLoading(false); }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const sum = (arr: MilkEntryResponse[], key: 'liters' | 'amount') =>
    arr.reduce((s, e) => s + e[key], 0);

  const calcStats = (ents: MilkEntryResponse[], fmrs: Farmer[]) => {
    const morning = ents.filter(e => e.session === 'MORNING');
    const evening = ents.filter(e => e.session === 'EVENING');
    const cow = ents.filter(e => e.animalType === 'COW');
    const buf = ents.filter(e => e.animalType === 'BUFFALO');
    return {
      morning, evening, cow, buf,
      totalL:     sum(ents, 'liters'),
      totalAmt:   sum(ents, 'amount'),
      cowL:       sum(cow,  'liters'),
      cowAmt:     sum(cow,  'amount'),
      bufL:       sum(buf,  'liters'),
      bufAmt:     sum(buf,  'amount'),
      morningL:   sum(morning, 'liters'),
      morningAmt: sum(morning, 'amount'),
      eveningL:   sum(evening, 'liters'),
      eveningAmt: sum(evening, 'amount'),
      farmerCount: fmrs.length,
    };
  };

  // ── Session Table ─────────────────────────────────────────────────────────────
  const SessionTable = ({ entries: ents, title, headerBg, headerText, subtotalBg }: {
    entries: MilkEntryResponse[]; title: string;
    headerBg: string; headerText: string; subtotalBg: string;
  }) => {
    const cows = ents.filter(e => e.animalType === 'COW');
    const bufs = ents.filter(e => e.animalType === 'BUFFALO');
    return (
      <div className="bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
        <div className={`${headerBg} px-4 py-3 flex items-center gap-2`}>
          {headerBg.includes('amber')
            ? <Sun size={18} className="text-amber-800" />
            : <Moon size={18} className="text-white" />}
          <span className={`font-bold ${headerText}`}>{title} ({ents.length})</span>
          <span className="ml-auto text-xs opacity-75 font-semibold">🐄 {cows.length} &nbsp; 🐃 {bufs.length}</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500">
              <th className="px-3 py-2 text-left">क्र.</th>
              <th className="px-3 py-2 text-left">नाव</th>
              <th className="px-3 py-2 text-center">प्राणी</th>
              <th className="px-3 py-2 text-right">दूध</th>
              <th className="px-3 py-2 text-right">रक्कम</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {ents.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-400 text-xs">
                  कोणत्याही नोंदी नाहीत
                </td>
              </tr>
            ) : ents.map(e => (
              <tr key={e.id} className={e.animalType === 'BUFFALO' ? 'hover:bg-indigo-50 bg-indigo-50/30' : 'hover:bg-yellow-50'}>
                <td className="px-3 py-2 font-bold text-green-800">{e.farmerNumber}</td>
                <td className="px-3 py-2">{e.farmerName}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                    e.animalType === 'COW' ? 'bg-yellow-100 text-yellow-800' : 'bg-indigo-100 text-indigo-800'}`}>
                    {e.animalType === 'COW' ? '🐄 गाय' : '🐃 म्हैस'}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">{e.liters} ली.</td>
                <td className="px-3 py-2 text-right font-semibold">₹{e.amount.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
          {ents.length > 0 && (
            <tfoot>
              {cows.length > 0 && (
                <tr className="bg-yellow-50 text-xs font-semibold">
                  <td colSpan={2} className="px-3 py-1.5 text-yellow-800">🐄 गाय एकूण</td>
                  <td></td>
                  <td className="px-3 py-1.5 text-right text-yellow-800">{sum(cows, 'liters').toFixed(1)} ली.</td>
                  <td className="px-3 py-1.5 text-right text-yellow-800">₹{sum(cows, 'amount').toFixed(0)}</td>
                </tr>
              )}
              {bufs.length > 0 && (
                <tr className="bg-indigo-50 text-xs font-semibold">
                  <td colSpan={2} className="px-3 py-1.5 text-indigo-800">🐃 म्हैस एकूण</td>
                  <td></td>
                  <td className="px-3 py-1.5 text-right text-indigo-800">{sum(bufs, 'liters').toFixed(1)} ली.</td>
                  <td className="px-3 py-1.5 text-right text-indigo-800">₹{sum(bufs, 'amount').toFixed(0)}</td>
                </tr>
              )}
              <tr className={`${subtotalBg} font-bold text-xs border-t-2`}>
                <td colSpan={2} className="px-3 py-2">एकूण</td>
                <td></td>
                <td className="px-3 py-2 text-right">{sum(ents, 'liters').toFixed(1)} ली.</td>
                <td className="px-3 py-2 text-right">₹{sum(ents, 'amount').toFixed(0)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    );
  };

  // ── Stats Row ─────────────────────────────────────────────────────────────────
  const StatsRow = ({ s, label }: { s: ReturnType<typeof calcStats>; label?: string }) => (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {[
        { lbl: 'एकूण शेतकरी',  val: String(s.farmerCount),         color: 'bg-blue-50 text-blue-700 border-blue-100',         icon: <Users size={20}/> },
        { lbl: 'एकूण दूध',      val: `${s.totalL.toFixed(1)} ली.`, color: 'bg-green-50 text-green-700 border-green-100',       icon: <Milk size={20}/> },
        { lbl: '🐄 गाय दूध',    val: `${s.cowL.toFixed(1)} ली.`,   color: 'bg-yellow-50 text-yellow-700 border-yellow-100',    icon: <Milk size={20}/> },
        { lbl: '🐃 म्हैस दूध',  val: `${s.bufL.toFixed(1)} ली.`,   color: 'bg-indigo-50 text-indigo-700 border-indigo-100',    icon: <Milk size={20}/> },
        { lbl: 'एकूण रक्कम',    val: `₹${s.totalAmt.toFixed(0)}`,  color: 'bg-emerald-50 text-emerald-700 border-emerald-100', icon: <TrendingUp size={20}/> },
      ].map(st => (
        <div key={st.lbl} className={`rounded-2xl border p-4 ${st.color}`}>
          <div className="mb-1">{st.icon}</div>
          <p className="text-xs font-semibold opacity-70">{st.lbl}</p>
          {label && <p className="text-xs opacity-50">{label}</p>}
          <p className="text-xl font-bold mt-1">{loading ? '...' : st.val}</p>
        </div>
      ))}
    </div>
  );

  // ── Single branch view ────────────────────────────────────────────────────────
  const branchStats = calcStats(entries, farmers);

  // ── Combined view: summary rows per branch + grand total ─────────────────────
  const combinedStats = allBranchData.map(d => ({
    ...d,
    s: calcStats(d.entries, d.farmers),
  }));

  const grandTotal = {
    totalL:      combinedStats.reduce((a, d) => a + d.s.totalL,      0),
    totalAmt:    combinedStats.reduce((a, d) => a + d.s.totalAmt,    0),
    cowL:        combinedStats.reduce((a, d) => a + d.s.cowL,        0),
    cowAmt:      combinedStats.reduce((a, d) => a + d.s.cowAmt,      0),
    bufL:        combinedStats.reduce((a, d) => a + d.s.bufL,        0),
    bufAmt:      combinedStats.reduce((a, d) => a + d.s.bufAmt,      0),
    morningL:    combinedStats.reduce((a, d) => a + d.s.morningL,    0),
    morningAmt:  combinedStats.reduce((a, d) => a + d.s.morningAmt,  0),
    eveningL:    combinedStats.reduce((a, d) => a + d.s.eveningL,    0),
    eveningAmt:  combinedStats.reduce((a, d) => a + d.s.eveningAmt,  0),
    farmerCount: combinedStats.reduce((a, d) => a + d.s.farmerCount, 0),
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-green-800 to-green-700 rounded-2xl p-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">नमस्कार! 🌾</h2>
            <h4 className="text-lg font-bold">शिवशक्ती महिला सह. दूध संस्था, सावर्डे नं. 2</h4>
            <p className="text-green-200 mt-1">
              {isToday
                ? `आज: ${format(new Date(), 'dd MMMM yyyy')}`
                : `तारीख: ${format(new Date(selectedDate + 'T00:00:00'), 'dd MMMM yyyy')}`}
            </p>
            <p className="text-green-300 text-sm mt-1">दूध संकलन केंद्र</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <label className="text-green-300 text-xs font-semibold flex items-center gap-1">
              <Calendar size={13} /> तारीख बदला
            </label>
            <input
              type="date"
              value={selectedDate}
              max={today}
              onChange={e => setSelectedDate(e.target.value)}
              className="bg-green-900 border border-green-600 text-white rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-green-400 outline-none"
            />
            {!isToday && (
              <button
                onClick={() => setSelectedDate(today)}
                className="text-xs text-green-300 hover:text-white underline">
                आजची तारीख
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── View Mode Toggle ── */}
      {branches.length > 1 && (
        <div className="flex gap-2 bg-white rounded-xl border border-amber-100 p-1.5 shadow-sm w-fit">
          <button
            onClick={() => setViewMode('branch')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              viewMode === 'branch'
                ? 'bg-green-700 text-white shadow-md'
                : 'text-gray-600 hover:bg-gray-50'}`}>
            <Building2 size={15} /> शाखा दृश्य
          </button>
          <button
            onClick={() => setViewMode('combined')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              viewMode === 'combined'
                ? 'bg-green-700 text-white shadow-md'
                : 'text-gray-600 hover:bg-gray-50'}`}>
            <Layers size={15} /> एकत्रित दृश्य
          </button>
        </div>
      )}

      {/* ══════════════════════ BRANCH VIEW ══════════════════════ */}
      {viewMode === 'branch' && (
        <>
          <StatsRow s={branchStats} />

          {!loading && (branchStats.cowAmt > 0 || branchStats.bufAmt > 0) && (
            <div className="grid grid-cols-2 gap-3">
              {branchStats.cowAmt > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 flex items-center gap-4">
                  <span className="text-4xl">🐄</span>
                  <div>
                    <p className="text-xs font-semibold text-yellow-700">गाय एकूण रक्कम</p>
                    <p className="text-2xl font-bold text-yellow-800">₹{branchStats.cowAmt.toFixed(0)}</p>
                    <p className="text-xs text-yellow-600">{branchStats.cowL.toFixed(1)} ली.</p>
                  </div>
                </div>
              )}
              {branchStats.bufAmt > 0 && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex items-center gap-4">
                  <span className="text-4xl">🐃</span>
                  <div>
                    <p className="text-xs font-semibold text-indigo-700">म्हैस एकूण रक्कम</p>
                    <p className="text-2xl font-bold text-indigo-800">₹{branchStats.bufAmt.toFixed(0)}</p>
                    <p className="text-xs text-indigo-600">{branchStats.bufL.toFixed(1)} ली.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <SessionTable
              entries={branchStats.morning}
              title="सकाळ"
              headerBg="bg-amber-400"
              headerText="text-amber-900"
              subtotalBg="bg-amber-50 border-amber-200"
            />
            <SessionTable
              entries={branchStats.evening}
              title="संध्याकाळ"
              headerBg="bg-indigo-500"
              headerText="text-white"
              subtotalBg="bg-indigo-50 border-indigo-200"
            />
          </div>
        </>
      )}

      {/* ══════════════════════ COMBINED VIEW ══════════════════════ */}
      {viewMode === 'combined' && (
        <>
          {/* ── Grand Total Summary ── */}
          <div className="bg-green-800 rounded-2xl p-5 text-white space-y-3">
            <p className="text-xs font-semibold text-green-300">
              🔶 सर्व शाखा एकत्रित — {format(new Date(selectedDate + 'T00:00:00'), 'dd/MM/yyyy')}
            </p>

            {/* Row 1: overall totals */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { lbl: 'एकूण शेतकरी',      val: grandTotal.farmerCount },
                { lbl: 'एकूण दूध (ली.)',    val: grandTotal.totalL.toFixed(1) },
                { lbl: 'एकूण रक्कम',        val: `₹${grandTotal.totalAmt.toFixed(0)}` },
                { lbl: 'सकाळ / संध्याकाळ', val: `${grandTotal.morningL.toFixed(1)} / ${grandTotal.eveningL.toFixed(1)}` },
              ].map(s => (
                <div key={s.lbl} className="bg-green-700/50 rounded-xl p-3">
                  <p className="text-xs text-green-300 font-semibold">{s.lbl}</p>
                  <p className="text-xl font-bold mt-0.5">{loading ? '...' : s.val}</p>
                </div>
              ))}
            </div>

            {/* Row 2: cow + buffalo combined across all branches */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-yellow-500/20 border border-yellow-400/30 rounded-xl p-4 flex items-center gap-4">
                <span className="text-4xl">🐄</span>
                <div>
                  <p className="text-xs font-semibold text-yellow-300">सर्व शाखा — गाय एकूण</p>
                  <p className="text-2xl font-bold text-yellow-100">
                    {loading ? '...' : `${grandTotal.cowL.toFixed(1)} ली.`}
                  </p>
                  <p className="text-sm font-semibold text-yellow-300">
                    {loading ? '' : `₹${grandTotal.cowAmt.toFixed(0)}`}
                  </p>
                </div>
              </div>
              <div className="bg-indigo-500/20 border border-indigo-400/30 rounded-xl p-4 flex items-center gap-4">
                <span className="text-4xl">🐃</span>
                <div>
                  <p className="text-xs font-semibold text-indigo-300">सर्व शाखा — म्हैस एकूण</p>
                  <p className="text-2xl font-bold text-indigo-100">
                    {loading ? '...' : `${grandTotal.bufL.toFixed(1)} ली.`}
                  </p>
                  <p className="text-sm font-semibold text-indigo-300">
                    {loading ? '' : `₹${grandTotal.bufAmt.toFixed(0)}`}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Per-branch breakdown cards ── */}
          {loading ? (
            <div className="text-center py-12 text-gray-400">लोड होत आहे...</div>
          ) : (
            <div className="space-y-4">
              {combinedStats.map(({ branch, entries: bEntries, s }) => (
                <div key={branch.code} className="bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
                  {/* Branch header */}
                  <div className="bg-green-700 px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Building2 size={16} className="text-green-200" />
                      <span className="font-bold text-white">{branch.name}</span>
                      <span className="text-xs text-green-300 font-mono">{branch.code}</span>
                    </div>
                    <div className="flex gap-4 text-xs text-green-200 font-semibold">
                      <span>👨‍🌾 {s.farmerCount}</span>
                      <span>🥛 {s.totalL.toFixed(1)} ली.</span>
                      <span>₹{s.totalAmt.toFixed(0)}</span>
                    </div>
                  </div>

                  {/* Mini stats */}
                  <div className="grid grid-cols-4 divide-x divide-gray-100 border-b border-gray-100">
                    {[
                      { lbl: '🌅 सकाळ',      val: `${s.morningL.toFixed(1)} ली.`, sub: `₹${s.morningAmt.toFixed(0)}` },
                      { lbl: '🌙 संध्याकाळ',  val: `${s.eveningL.toFixed(1)} ली.`, sub: `₹${s.eveningAmt.toFixed(0)}` },
                      { lbl: '🐄 गाय',        val: `${s.cowL.toFixed(1)} ली.`,     sub: `₹${s.cowAmt.toFixed(0)}` },
                      { lbl: '🐃 म्हैस',      val: `${s.bufL.toFixed(1)} ली.`,     sub: `₹${s.bufAmt.toFixed(0)}` },
                    ].map(st => (
                      <div key={st.lbl} className="px-4 py-3 text-center">
                        <p className="text-xs text-gray-400 font-semibold">{st.lbl}</p>
                        <p className="font-bold text-gray-800 text-sm mt-0.5">{st.val}</p>
                        <p className="text-xs text-green-700 font-semibold">{st.sub}</p>
                      </div>
                    ))}
                  </div>

                  {/* Entry rows — morning then evening inline */}
                  {bEntries.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-gray-400 text-center">
                      या तारखेला कोणत्याही नोंदी नाहीत
                    </p>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-0 divide-x divide-gray-100">
                      <SessionTable
                        entries={s.morning}
                        title="सकाळ"
                        headerBg="bg-amber-400"
                        headerText="text-amber-900"
                        subtotalBg="bg-amber-50 border-amber-200"
                      />
                      <SessionTable
                        entries={s.evening}
                        title="संध्याकाळ"
                        headerBg="bg-indigo-500"
                        headerText="text-white"
                        subtotalBg="bg-indigo-50 border-indigo-200"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}