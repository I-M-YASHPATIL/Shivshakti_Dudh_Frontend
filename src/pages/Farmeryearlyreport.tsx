import React, { useState, useEffect, useCallback } from 'react';
import { milkEntryAPI, farmerAPI, billAPI, ledgerAPI } from '../services/api';
import { useBranch } from '../pages/Branchcontext';
import type { MilkEntryResponse, Farmer, BillResponse } from '../types/dairyTypes';
import { format, getDaysInMonth } from 'date-fns';
import {
  User, Calendar, Download, Milk,
  TrendingUp, FileText, RefreshCw, PiggyBank,
} from 'lucide-react';


interface Period {
  label:     string;
  startDate: string;
  endDate:   string;
}

interface PeriodStats {
  period:          Period;
  entries:         MilkEntryResponse[];
  totalLiters:     number;
  cowLiters:       number;
  bufLiters:       number;
  morningLiters:   number;
  eveningLiters:   number;
  totalAmount:     number;
  cowAmount:       number;
  bufAmount:       number;
  entryCount:      number;
  cowCount:        number;
  bufCount:        number;
  savingPercent:   number;
  savingDeduction: number;
  netAmount:       number;
  billFound:       boolean;
  lagwadAmount:    number;   
  lagwadItems:     string[];  
}

const MARATHI_MONTHS = [
  'जाने', 'फेब्रु', 'मार्च', 'एप्रि', 'मे', 'जून',
  'जुलै', 'ऑगस्ट', 'सप्टें', 'ऑक्टो', 'नोव्हें', 'डिसें',
];

function generatePeriods(year: number): Period[] {
  const periods: Period[] = [];
  const monthSequence = [
    { y: year,     m: 3  }, { y: year,     m: 4  }, { y: year,     m: 5  },
    { y: year,     m: 6  }, { y: year,     m: 7  }, { y: year,     m: 8  },
    { y: year,     m: 9  }, { y: year,     m: 10 }, { y: year,     m: 11 },
    { y: year + 1, m: 0  }, { y: year + 1, m: 1  }, { y: year + 1, m: 2  },
  ];
  for (const { y, m } of monthSequence) {
    const days = getDaysInMonth(new Date(y, m, 1));
    const mon  = MARATHI_MONTHS[m];
    periods.push({ label: `01 ${mon} – 10 ${mon}`, startDate: format(new Date(y, m, 1),    'yyyy-MM-dd'), endDate: format(new Date(y, m, 10),   'yyyy-MM-dd') });
    periods.push({ label: `11 ${mon} – 20 ${mon}`, startDate: format(new Date(y, m, 11),   'yyyy-MM-dd'), endDate: format(new Date(y, m, 20),   'yyyy-MM-dd') });
    periods.push({ label: `21 ${mon} – ${days} ${mon}`, startDate: format(new Date(y, m, 21), 'yyyy-MM-dd'), endDate: format(new Date(y, m, days), 'yyyy-MM-dd') });
  }
  return periods;
}

function currentDairyYear(): number {
  const now = new Date();
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

function matchBill(bill: BillResponse, period: Period): boolean {
  const bf = String(bill.fromDate ?? '');
  const bt = String(bill.toDate   ?? '');
  return bf <= period.endDate && bt >= period.startDate;
}

function lagwadLabel(note?: string | null): string {
  if (!note) return '';
  const m = note.match(/^(.+?)\s×\s([\d.]+)(?:\s([^\s(]+))?\s*\(₹[\d.]+\/([^)]*)\)/);
  if (!m) return '';
  return `${m[1].trim()} × ${m[2]} ${(m[3] || m[4] || '').trim()}`.trim();
}

const rs = (v: number) => `₹${Math.floor(v)}`;

const SADILVAR = 6;

export default function FarmerYearlyReport() {
  const { activeBranchCode } = useBranch();

  const [farmers,        setFarmers]        = useState<Farmer[]>([]);
  const [selectedFarmer, setSelectedFarmer] = useState<Farmer | null>(null);
  const [dairyYear,      setDairyYear]      = useState(currentDairyYear());
  const [loading,        setLoading]        = useState(false);
  const [farmerSearch,   setFarmerSearch]   = useState('');
  const [showDropdown,   setShowDropdown]   = useState(false);
  const [periodStats,    setPeriodStats]    = useState<PeriodStats[]>([]);
  const [fetched,        setFetched]        = useState(false);

  const periods   = generatePeriods(dairyYear);
  const yearLabel = `${dairyYear}-${String(dairyYear + 1).slice(2)}`;
  const startDate = periods[0].startDate;
  const endDate   = periods[periods.length - 1].endDate;

  // ── Load farmers ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeBranchCode) return;
    farmerAPI.getAll(activeBranchCode).then(setFarmers).catch(console.error);
  }, [activeBranchCode]);

  const filteredFarmers = farmers.filter(f =>
    f.name.toLowerCase().includes(farmerSearch.toLowerCase()) ||
    String(f.number ?? f.farmerNumber ?? '').includes(farmerSearch)
  );

  // ── Fetch entries + bills in parallel ─────────────────────────────────────────
  const fetchReport = useCallback(async () => {
    if (!selectedFarmer || !activeBranchCode) return;
    setLoading(true);
    setFetched(false);
    try {
    
      const farmerNum = Number(selectedFarmer.number ?? selectedFarmer.farmerNumber);

      const [entries, bills, ledger] = await Promise.all([
        selectedFarmer.id
          ? milkEntryAPI.getYearlyByFarmerId(activeBranchCode, selectedFarmer.id, startDate, endDate)
          : milkEntryAPI.getYearlyByFarmerNumber(activeBranchCode, farmerNum, startDate, endDate),
        billAPI.getForFarmer(activeBranchCode, farmerNum),
        ledgerAPI.get(activeBranchCode, farmerNum).catch(() => null),
      ]);

      const lagwadEntries = (ledger?.entries ?? []).filter(e => e.type === 'LAGAVAD');

      const yearBills = bills.filter(b => {
        const bf = String(b.fromDate ?? '');
        return bf >= startDate && bf <= endDate;
      });

      const stats: PeriodStats[] = periods.map(period => {
        const pe  = entries.filter(e => {
          const d = String(e.entryDate ?? '');
          return d >= period.startDate && d <= period.endDate;
        });
        const cow = pe.filter(e => e.milkType === 'COW');
        const buf = pe.filter(e => e.milkType === 'BUFFALO');
        const mor = pe.filter(e => e.session  === 'MORNING');
        const eve = pe.filter(e => e.session  === 'EVENING');
        const sumL = (a: MilkEntryResponse[]) => a.reduce((s, x) => s + Number(x.liters  ?? 0), 0);
        const sumA = (a: MilkEntryResponse[]) => a.reduce((s, x) => s + Number(x.amount  ?? 0), 0);

        const bill      = yearBills.find(b => matchBill(b, period));
        const billFound = !!bill;

        const pl = lagwadEntries.filter(e => {
          const d = String(e.entryDate ?? '').slice(0, 10);
          return d >= period.startDate && d <= period.endDate;
        });

        return {
          period,
          entries:         pe,
          totalLiters:     sumL(pe),
          cowLiters:       sumL(cow),
          bufLiters:       sumL(buf),
          morningLiters:   sumL(mor),
          eveningLiters:   sumL(eve),
          totalAmount:     sumA(pe),
          cowAmount:       sumA(cow),
          bufAmount:       sumA(buf),
          entryCount:      pe.length,
          cowCount:        cow.length,
          bufCount:        buf.length,
          savingPercent:   Number(bill?.savingPercent   ?? 0),
          savingDeduction: Number(bill?.savingDeduction ?? 0),
          netAmount:       Number(bill?.netAmount       ?? sumA(pe)),
          billFound,
          lagwadAmount:    pl.reduce((a, e) => a + Number(e.amount ?? 0), 0),
          lagwadItems:     pl.map(e => lagwadLabel(e.note)).filter(Boolean),
        };
      });

      setPeriodStats(stats);
      setFetched(true);
    } catch (err) {
      console.error('Failed to fetch yearly report:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedFarmer, activeBranchCode, dairyYear]);

  // ── Grand totals ──────────────────────────────────────────────────────────────
  const grand = {
    liters:  periodStats.reduce((a, s) => a + s.totalLiters,     0),
    amount:  periodStats.reduce((a, s) => a + s.totalAmount,     0),
    cowL:    periodStats.reduce((a, s) => a + s.cowLiters,       0),
    bufL:    periodStats.reduce((a, s) => a + s.bufLiters,       0),
    cowAmt:  periodStats.reduce((a, s) => a + s.cowAmount,       0),
    bufAmt:  periodStats.reduce((a, s) => a + s.bufAmount,       0),
    saving:  periodStats.reduce((a, s) => a + s.savingDeduction, 0),
    net:     periodStats.reduce((a, s) => a + s.netAmount,       0),
    lagwad:  periodStats.reduce((a, s) => a + s.lagwadAmount,    0),
entries: periodStats.reduce((a, s) => a + s.entryCount,      0),
    active:  periodStats.filter(s      => s.entryCount > 0).length,
  };

  // ── CSV Export ────────────────────────────────────────────────────────────────
  const exportCSV = () => {
    if (!periodStats.length) return;
    const hdr = 'कालावधी,नोंदी,एकूण दूध (ली.),गाय (ली.),म्हैस (ली.),एकूण रक्कम (₹),गाय रक्कम (₹),म्हैस रक्कम (₹),बचत वजावट (₹),निव्वळ देय (₹),लागवड (₹)';
    const rows = periodStats.map(s =>
      [
        s.period.label,
        s.entryCount,
        s.totalLiters.toFixed(2),
        s.cowLiters.toFixed(2),
        s.bufLiters.toFixed(2),
        Math.floor(s.totalAmount),
        Math.floor(s.cowAmount),
        Math.floor(s.bufAmount),
        Math.floor(s.savingDeduction),
        Math.floor(s.netAmount),
        Math.floor(s.lagwadAmount),
      ].join(',')
    );
    rows.push(`वार्षिक एकूण,${grand.entries},${grand.liters.toFixed(2)},${grand.cowL.toFixed(2)},${grand.bufL.toFixed(2)},${Math.floor(grand.amount)},${Math.floor(grand.cowAmt)},${Math.floor(grand.bufAmt)},${Math.floor(grand.saving)},${Math.floor(grand.net)},${Math.floor(grand.lagwad)}`);
    const blob = new Blob([hdr + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: `${selectedFarmer?.name}_${yearLabel}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderTypeTable = (type: 'COW' | 'BUFFALO', showLagwad: boolean) => {
    const colCount = showLagwad ? 8 : 7;
    const isCow      = type === 'COW';
    const getLiters  = (s: PeriodStats) => (isCow ? s.cowLiters : s.bufLiters);
    const getAmount  = (s: PeriodStats) => (isCow ? s.cowAmount : s.bufAmount);
    const getCount   = (s: PeriodStats) => (isCow ? s.cowCount  : s.bufCount);
    const getSaving  = (s: PeriodStats) => (s.totalAmount > 0 ? s.savingDeduction * (getAmount(s) / s.totalAmount) : 0);
    const getSadilvar = (s: PeriodStats) => (getCount(s) > 0 ? SADILVAR : 0);
    const getNet     = (s: PeriodStats) => getAmount(s) - getSaving(s) - getSadilvar(s);

    const typeLiters = periodStats.reduce((a, s) => a + getLiters(s), 0);
    const typeAmount = periodStats.reduce((a, s) => a + getAmount(s), 0);
    const typeCount  = periodStats.reduce((a, s) => a + getCount(s),  0);
    const typeActive = periodStats.filter(s => getCount(s) > 0).length;
    const typeSaving = periodStats.reduce((a, s) => a + getSaving(s), 0);
    const typeSadilvar = periodStats.reduce((a, s) => a + getSadilvar(s), 0);
    const typeNet    = periodStats.reduce((a, s) => a + getNet(s),    0);

    if (typeCount === 0) return null; 

    const headerBg  = isCow ? 'bg-yellow-600' : 'bg-indigo-700';
    const footBg    = isCow ? 'bg-yellow-700' : 'bg-indigo-800';
    const footBorder = isCow ? 'border-yellow-500' : 'border-indigo-600';
    const badgeBg   = isCow ? 'bg-yellow-100 text-yellow-800' : 'bg-indigo-100 text-indigo-800';
    const monthText = isCow ? 'text-yellow-700' : 'text-indigo-700';

    return (
      <div key={type} className="bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
        <div className={`${headerBg} px-5 py-3 flex items-center justify-between`}>
          <div className="flex items-center gap-2 text-white font-bold">
            <span className="text-lg">{isCow ? '🐄' : '🐃'}</span>
            <span>{isCow ? 'गाय अहवाल' : 'म्हैस अहवाल'} — {selectedFarmer?.name} ({yearLabel})</span>
          </div>
          <span className="text-white/80 text-xs font-semibold">{typeActive} / 36 सक्रिय कालावधी</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                <th className="px-4 py-3 text-left font-bold">कालावधी</th>
                <th className="px-3 py-3 text-center">नोंदी</th>
                <th className="px-3 py-3 text-right">
                  एकूण दूध<br/><span className="font-normal text-gray-400">(ली.)</span>
                </th>
                <th className="px-3 py-3 text-right">
                  एकूण रक्कम<br/><span className="font-normal text-gray-400">(₹)</span>
                </th>
                <th className="px-3 py-3 text-right">
                  कापत<br/><span className="font-normal text-gray-400">(₹)</span>
                </th>
                <th className="px-3 py-3 text-right">
                  सादिलवार<br/><span className="font-normal text-gray-400">(₹)</span>
                </th>
                <th className="px-3 py-3 text-right">
                  निव्वळ देणे<br/><span className="font-normal text-gray-400">(₹)</span>
                </th>
                {showLagwad && (
                  <th className="px-3 py-3 text-right">
                    लागवड<br/><span className="font-normal text-gray-400">(₹)</span>
                  </th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50">
              {periodStats.map((s, idx) => {
                const isNewMonth = idx % 3 === 0;
                const count      = getCount(s);
                const isEmpty    = count === 0;

                return (
                  <React.Fragment key={s.period.startDate}>
                    {isNewMonth && (
                      <tr className="bg-gray-50 border-t-2 border-gray-100">
                        <td colSpan={colCount} className={`px-4 py-1.5 text-xs font-bold tracking-wider ${monthText}`}>
                          {s.period.label.split('–')[0].trim().replace(/^\d+\s/, '')} महिना
                        </td>
                      </tr>
                    )}
                    <tr className={`transition-colors ${isEmpty ? 'bg-gray-50/50 text-gray-300' : 'hover:bg-gray-50'}`}>
                      <td className="px-4 py-2.5 font-semibold text-gray-700 whitespace-nowrap text-xs">
                        {s.period.label}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {isEmpty ? '—' : (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badgeBg}`}>{count}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-gray-800">
                        {isEmpty ? '—' : getLiters(s).toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-emerald-700">
                        {isEmpty ? '—' : rs(getAmount(s))}
                      </td>
                      <td className="px-3 py-2.5 text-right text-rose-600">
                        {!s.billFound || getSaving(s) === 0
                          ? <span className="text-gray-300">—</span>
                          : rs(getSaving(s))
                        }
                        {s.billFound && s.savingPercent > 0 && (
                          <span className="ml-1 text-xs text-gray-400">({s.savingPercent}%)</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right text-orange-600">
                        {isEmpty ? '—' : rs(getSadilvar(s))}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-blue-700">
                        {isEmpty
                          ? '—'
                          : s.billFound
                            ? rs(getNet(s))
                            : <span className="text-gray-400 font-normal text-xs">बिल नाही</span>
                        }
                      </td>
                      {showLagwad && (
                        <td className="px-3 py-2.5 text-right text-purple-700">
                          {s.lagwadAmount > 0 ? (
                            <>
                              <div className="font-semibold">{rs(s.lagwadAmount)}</div>
                              {s.lagwadItems.map((t, i) => (
                                <div key={i} className="text-[11px] text-gray-500 whitespace-nowrap">{t}</div>
                              ))}
                            </>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>

            <tfoot>
              <tr className={`${footBg} text-white font-bold text-sm border-t-2 ${footBorder}`}>
                <td className="px-4 py-3">वार्षिक एकूण</td>
                <td className="px-3 py-3 text-center">{typeCount}</td>
                <td className="px-3 py-3 text-right">{typeLiters.toFixed(2)}</td>
                <td className="px-3 py-3 text-right">{rs(typeAmount)}</td>
                <td className="px-3 py-3 text-right">{rs(typeSaving)}</td>
                <td className="px-3 py-3 text-right">{rs(typeSadilvar)}</td>
                <td className="px-3 py-3 text-right">{rs(typeNet)}</td>
                {showLagwad && <td className="px-3 py-3 text-right">{rs(grand.lagwad)}</td>}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="bg-gradient-to-r from-green-800 to-teal-700 rounded-2xl p-6 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 p-3 rounded-xl"><FileText size={24} /></div>
            <div>
              <h2 className="text-xl font-bold">वार्षिक दुग्ध उत्पादक अहवाल</h2>
              <p className="text-green-200 text-sm mt-0.5">दहा-दिवसीय तपशील — दुग्ध वर्ष {yearLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-green-300 text-xs font-semibold">दुग्ध वर्ष</label>
            <select
              value={dairyYear}
              onChange={e => { setDairyYear(Number(e.target.value)); setFetched(false); }}
              className="bg-green-900 border border-green-600 text-white rounded-xl px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-green-400 outline-none"
            >
              {[2024, 2025, 2026, 2027].map(y => (
                <option key={y} value={y}>{y}-{String(y + 1).slice(2)}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Farmer Selector */}
      <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-600 mb-3 flex items-center gap-2">
          <User size={15} /> दुग्ध उत्पादक निवडा
        </h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="relative flex-1 min-w-[220px]">
            <input
              type="text"
              placeholder="नाव किंवा क्रमांक शोधा..."
              value={farmerSearch}
              onChange={e => { setFarmerSearch(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              className="w-full border-2 border-green-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:border-green-500 outline-none"
            />
            {showDropdown && filteredFarmers.length > 0 && (
              <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-green-100 rounded-xl shadow-xl max-h-52 overflow-y-auto">
                {filteredFarmers.slice(0, 30).map(f => {
                  const num = f.number ?? f.farmerNumber;
                  return (
                    <button
                      key={f.id}
                      onMouseDown={() => {
                        setSelectedFarmer(f);
                        setFarmerSearch(`${num} — ${f.name}`);
                        setShowDropdown(false);
                        setFetched(false);
                      }}
                      className="w-full text-left px-4 py-2.5 hover:bg-green-50 text-sm flex items-center gap-3 border-b border-gray-50 last:border-0"
                    >
                      <span className="bg-green-100 text-green-800 font-bold text-xs px-2 py-0.5 rounded-lg min-w-[36px] text-center">{num}</span>
                      <span className="font-medium text-gray-800">{f.name}</span>
                      {f.animalType && <span className="ml-auto text-xs text-gray-400">{f.animalType === 'COW' ? '🐄' : '🐃'}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            onClick={fetchReport}
            disabled={!selectedFarmer || loading}
            className="flex items-center gap-2 bg-green-700 hover:bg-green-800 disabled:bg-gray-300 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-md disabled:shadow-none"
          >
            {loading
              ? <><RefreshCw size={15} className="animate-spin" /> लोड होत आहे...</>
              : <><FileText size={15} /> अहवाल तयार करा</>}
          </button>

          {fetched && (
            <button onClick={exportCSV} className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-md">
              <Download size={15} /> CSV डाउनलोड
            </button>
          )}
        </div>

        {selectedFarmer && (
          <div className="mt-3 inline-flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2">
            <User size={14} className="text-green-600" />
            <span className="text-sm font-bold text-green-800">{selectedFarmer.name}</span>
            <span className="text-xs text-green-500 font-mono">#{selectedFarmer.number ?? selectedFarmer.farmerNumber}</span>
            {selectedFarmer.animalType && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-lg font-semibold">
                {selectedFarmer.animalType === 'COW' ? '🐄 गाय' : selectedFarmer.animalType === 'BUFFALO' ? '🐃 म्हैस' : '🐄🐃 दोन्ही'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Report */}
      {fetched && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { icon: <Milk size={20}/>,      lbl: 'एकूण दूध',       val: `${grand.liters.toFixed(2)} ली.`,                              color: 'bg-green-50 border-green-200 text-green-800' },
              { icon: <TrendingUp size={20}/>, lbl: 'एकूण रक्कम',     val: rs(grand.amount),                                              color: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
              { icon: <PiggyBank size={20}/>,  lbl: 'एकूण बचत वजावट', val: rs(grand.saving),                                              color: 'bg-rose-50 border-rose-200 text-rose-800' },
              { icon: <span className="text-xl font-bold text-blue-700">₹</span>, lbl: 'निव्वळ देय रक्कम', val: rs(grand.net),           color: 'bg-blue-50 border-blue-200 text-blue-800' },
              { icon: <span className="text-xl">🐄</span>, lbl: 'गाय दूध / रक्कम',  val: `${grand.cowL.toFixed(2)} ली. · ${rs(grand.cowAmt)}`, color: 'bg-yellow-50 border-yellow-200 text-yellow-800' },
              { icon: <span className="text-xl">🐃</span>, lbl: 'म्हैस दूध / रक्कम', val: `${grand.bufL.toFixed(2)} ली. · ${rs(grand.bufAmt)}`, color: 'bg-indigo-50 border-indigo-200 text-indigo-800' },
            ].map(c => (
              <div key={c.lbl} className={`rounded-2xl border p-4 ${c.color}`}>
                <div className="mb-2">{c.icon}</div>
                <p className="text-xs font-semibold opacity-60">{c.lbl}</p>
                <p className="text-lg font-bold mt-0.5 leading-tight">{c.val}</p>
              </div>
            ))}
          </div>

          {/* Active period / entries sub-row */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
              <p className="text-xs font-semibold text-blue-500">एकूण नोंदी</p>
              <p className="text-2xl font-bold text-blue-800 mt-1">{grand.entries}</p>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
              <p className="text-xs font-semibold text-amber-500">सक्रिय कालावधी</p>
              <p className="text-2xl font-bold text-amber-800 mt-1">{grand.active} / 36</p>
            </div>
            <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4">
              <p className="text-xs font-semibold text-purple-500">एकूण लागवड</p>
              <p className="text-2xl font-bold text-purple-800 mt-1">{rs(grand.lagwad)}</p>
            </div>
          </div>

          {/* Bill summary note */}
          <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-4 flex items-center gap-2 text-xs text-gray-500">
            <Calendar size={14} className="text-gray-400" />
            <span>कापत व निव्वळ देणे बिलात गाय/म्हैस वेगळे नोंदलेले नसतात — त्या कालावधीतील रकमेच्या प्रमाणात (share) वाटून खालील दोन्ही अहवालांत दाखवले आहे.</span>
          </div>

          {/* Separate cow / buffalo reports */}
          {renderTypeTable('COW', grand.cowL > 0)}
          {renderTypeTable('BUFFALO', grand.cowL === 0)}
        </>
      )}

      {/* Empty state */}
      {!fetched && !loading && (
        <div className="bg-white rounded-2xl border border-dashed border-green-200 p-12 text-center">
          <div className="text-5xl mb-3">📋</div>
          <p className="text-gray-500 font-semibold">दुग्ध उत्पादक निवडा आणि अहवाल तयार करा</p>
          <p className="text-gray-400 text-sm mt-1">दुग्ध वर्ष {yearLabel} साठी दहा-दिवसीय तपशील दिसेल</p>
        </div>
      )}
    </div>
  );
}