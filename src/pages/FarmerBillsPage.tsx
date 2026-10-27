import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
import { Download, Search, FileText } from 'lucide-react';
import { billAPI, milkEntryAPI, ledgerAPI } from '../services/api';
import { useBranch } from './Branchcontext';
import { generateBillsPDF } from './Billpdfgenerator';
import type { BillResponse, LedgerResponse } from '../types/dairyTypes';

const n = (v: number | undefined | null, d = 2) => (v ?? 0).toFixed(d);

export default function FarmerBillsPage() {
  const { activeBranchCode } = useBranch();

  const [farmerNo,   setFarmerNo]   = useState('');
  const [bills,      setBills]      = useState<BillResponse[]>([]);
  const [searched,   setSearched]   = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  /** Load every saved bill of this producer (oldest → newest, skipping empty ones). */
  const loadBills = async (num: number): Promise<BillResponse[]> => {
    const all = await billAPI.getForFarmer(activeBranchCode, num);
    return all
      .filter(b => (b.totalLiters ?? 0) > 0)
      .sort((a, b) => a.fromDate.localeCompare(b.fromDate));
  };

  /** Build ONE pdf containing all the bills (same layout as the Bills page). */
  const buildPdf = async (num: number, list: BillResponse[]) => {
    // bills of one producer share farmerNumber, so fetch the whole span once
    const from = list[0].fromDate;
    const to   = list[list.length - 1].toDate;
    const allEntries = await milkEntryAPI.getByFarmerAndRange(activeBranchCode, num, from, to);

    let ledger: LedgerResponse | undefined;
    try { ledger = await ledgerAPI.get(activeBranchCode, num); } catch { /* no ledger */ }

    // All bills share one farmerNumber, so hand each bill its own entries via bill.entries.
    const withEntries = list.map(b => ({
      ...b,
      entries: allEntries.filter(e => e.entryDate >= b.fromDate && e.entryDate <= b.toDate),
    }));
    await generateBillsPDF(
      withEntries,
      {},
      `उत्पादक_${num}_${list[0].farmerName}`,
      ledger ? { [num]: ledger } : {},
    );
  };

  const search = async () => {
    const num = parseInt(farmerNo, 10);
    if (!num) { toast.error('उत्पादक क्रमांक टाका'); return; }
    setLoading(true);
    setSearched(false);
    try {
      const list = await loadBills(num);
      setBills(list);
      setSearched(true);
      if (!list.length) toast.error('या उत्पादकाचे कोणतेही बिल सापडले नाही');
    } catch (err) {
      console.error(err);
      setBills([]);
      toast.error('उत्पादक सापडला नाही / error आली');
    } finally {
      setLoading(false);
    }
  };

  const download = async () => {
    const num = parseInt(farmerNo, 10);
    if (!num) { toast.error('उत्पादक क्रमांक टाका'); return; }
    setPdfLoading(true);
    try {
      const list = bills.length && searched ? bills : await loadBills(num);
      setBills(list);
      setSearched(true);
      if (!list.length) { toast.error('या उत्पादकाचे कोणतेही बिल सापडले नाही'); return; }
      await buildPdf(num, list);
      toast.success(`${list.length} बिले — PDF डाउनलोड झाले!`);
    } catch (err) {
      console.error(err);
      toast.error('PDF तयार करताना error आली');
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-5">
        <h3 className="font-bold text-green-900 mb-4 flex items-center gap-2">
          <FileText size={18} /> उत्पादकाची सर्व बिले (एकाच PDF मध्ये)
        </h3>

        <div className="flex flex-wrap gap-3">
          <input
            type="number"
            min={1}
            value={farmerNo}
            onChange={e => { setFarmerNo(e.target.value); setBills([]); setSearched(false); }}
            onKeyDown={e => { if (e.key === 'Enter') download(); }}
            placeholder="उत्पादक क्रमांक"
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold w-48 focus:ring-2 focus:ring-green-400 outline-none"
          />
          <button onClick={search} disabled={loading || !activeBranchCode}
            className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:bg-gray-300 text-white px-5 py-2.5 rounded-xl font-semibold">
            <Search size={16} /> {loading ? 'शोधत आहे...' : 'बिले शोधा'}
          </button>
          <button onClick={download} disabled={pdfLoading || !activeBranchCode}
            className="flex items-center gap-2 bg-rose-700 hover:bg-rose-800 disabled:bg-gray-300 text-white px-5 py-2.5 rounded-xl font-semibold">
            <Download size={16} /> {pdfLoading ? 'PDF होत आहे...' : 'सर्व बिले PDF डाउनलोड'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          क्रमांक टाकून Enter दाबा — डेटाबेसमधील त्या उत्पादकाची सर्व बिले एकाच PDF मध्ये डाउनलोड होतील.
        </p>
      </div>

      {searched && bills.length > 0 && (
        <div className="bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-green-50 border-b border-green-100 font-bold text-green-900">
            {bills[0].farmerNumber} — {bills[0].farmerName} &nbsp;·&nbsp; {bills.length} बिले
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="px-4 py-2 text-left">कालावधी</th>
                <th className="px-4 py-2 text-right">दूध (लि)</th>
                <th className="px-4 py-2 text-right">रक्कम</th>
                <th className="px-4 py-2 text-right">निव्वळ</th>
              </tr>
            </thead>
            <tbody>
              {bills.map(b => (
                <tr key={b.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">
                    {format(parseISO(b.fromDate), 'dd/MM/yy')} ते {format(parseISO(b.toDate), 'dd/MM/yy')}
                  </td>
                  <td className="px-4 py-2 text-right">{n(b.totalLiters, 1)}</td>
                  <td className="px-4 py-2 text-right">₹{n(b.totalAmount)}</td>
                  <td className="px-4 py-2 text-right font-bold text-green-700">₹{n(b.netAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {searched && bills.length === 0 && (
        <div className="bg-white rounded-2xl border border-amber-100 p-10 text-center text-gray-400">
          या उत्पादकाचे बिल सापडले नाही. आधी "बिले" पेजवरून बिले तयार करा.
        </div>
      )}
    </div>
  );
}