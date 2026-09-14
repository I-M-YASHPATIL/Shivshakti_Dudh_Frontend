import { useState, useEffect } from 'react';
import { fatRateAPI } from '../services/api';
import { useBranch } from '../pages/Branchcontext';
import type { FatRate, AnimalType } from '../types/dairyTypes';
import toast from 'react-hot-toast';
import { Save, Trash2, Info, RefreshCw, Pencil, X, Check } from 'lucide-react';

const ANIMAL_CONFIG = {
  COW: {
    label: 'गाय (Cow)',
    emoji: '🐄',
    minFat: 2.8,
    maxFat: 5.0,
    snfOptions: [ 8.3, 8.4, 8.5, 8.6],
    placeholder: '3.5',
    ratePlaceholder: '22.00',
    tabActive:   'border-yellow-500 bg-yellow-50 text-yellow-800',
    tabInactive: 'border-gray-200 bg-gray-50 text-gray-500 hover:border-yellow-300 hover:bg-yellow-50/50',
    headerBg:    'bg-yellow-700',
    rowHover:    'hover:bg-yellow-50',
    badgeBg:     'bg-yellow-100 text-yellow-800',
    rangeBg:     'bg-yellow-50 border-yellow-200 text-yellow-800',
    saveBtn:     'bg-yellow-600 hover:bg-yellow-700',
    fatColor:    'text-yellow-700',
    editRowBg:   'bg-yellow-50/60',
  },
  BUFFALO: {
    label: 'म्हैस (Buffalo)',
    emoji: '🐃',
    minFat: 4.8,
    maxFat: 12.0,
    snfOptions: [ 8.8, 8.9, 9.0, 9.1,9.2,9.3],
    placeholder: '7.0',
    ratePlaceholder: '32.00',
    tabActive:   'border-indigo-500 bg-indigo-50 text-indigo-800',
    tabInactive: 'border-gray-200 bg-gray-50 text-gray-500 hover:border-indigo-300 hover:bg-indigo-50/50',
    headerBg:    'bg-indigo-700',
    rowHover:    'hover:bg-indigo-50',
    badgeBg:     'bg-indigo-100 text-indigo-800',
    rangeBg:     'bg-indigo-50 border-indigo-200 text-indigo-800',
    saveBtn:     'bg-indigo-600 hover:bg-indigo-700',
    fatColor:    'text-indigo-700',
    editRowBg:   'bg-indigo-50/60',
  },
};

type EntryMode = 'single' | 'multiSnf' | 'bulk';

export default function FatRatesPage() {
  const { activeBranchCode } = useBranch();

  const [activeTab, setActiveTab] = useState<AnimalType>('COW');
  const [cowRates,  setCowRates]  = useState<FatRate[]>([]);
  const [bufRates,  setBufRates]  = useState<FatRate[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [entryMode, setEntryMode] = useState<EntryMode>('single');

  // ── Single-entry form ───────────────────────────────────────────────────────
  const [form,   setForm]   = useState({ fat: '', snf: '', rate: '' });
  const [saving, setSaving] = useState(false);

  // ── Multi-SNF form (one fat, many SNF+rate rows) ───────────────────────────
  const [multiFat,    setMultiFat]    = useState('');
  const [multiRates,  setMultiRates]  = useState<Record<number, string>>({}); // snf -> rate string
  const [multiSaving, setMultiSaving] = useState(false);

  // ── Inline edit state ──────────────────────────────────────────────────────
  const [editingId,  setEditingId]  = useState<number | null>(null);
  const [editForm,   setEditForm]   = useState({ fat: '', snf: '', rate: '' });
  const [editSaving, setEditSaving] = useState(false);

  // ── Bulk (fat range) state ──────────────────────────────────────────────────
  const [bulkFrom,  setBulkFrom]  = useState('');
  const [bulkTo,    setBulkTo]    = useState('');
  const [bulkStep,  setBulkStep]  = useState('0.1');
  const [bulkSnf,   setBulkSnf]   = useState(''); // optional — applied to every row in the batch
  const [bulkRate1, setBulkRate1] = useState('');
  const [bulkRate2, setBulkRate2] = useState('');
  const [bulking,   setBulking]   = useState(false);

  const cfg = ANIMAL_CONFIG[activeTab];

  // Sort by fat% then SNF so same-fat rows sit next to each other in the table
  const rates = [...(activeTab === 'COW' ? cowRates : bufRates)].sort((a, b) => {
    if (a.fatPercentage !== b.fatPercentage) return a.fatPercentage - b.fatPercentage;
    const aSnf = a.snf ?? -1;
    const bSnf = b.snf ?? -1;
    return aSnf - bSnf;
  });

  useEffect(() => { if (activeBranchCode) loadAll(); }, [activeBranchCode]);

  // ── No branch guard ────────────────────────────────────────────────────────
  if (!activeBranchCode) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center text-gray-400">
        <p className="text-lg font-semibold">शाखा निवडा</p>
        <p className="text-sm mt-1">Please select a branch to manage fat rates.</p>
      </div>
    );
  }

  // ── Load ───────────────────────────────────────────────────────────────────
  const loadAll = async () => {
    setLoading(true);
    try {
      const [cowList, bufList] = await Promise.all([
        fatRateAPI.getByAnimalType(activeBranchCode, 'COW'),
        fatRateAPI.getByAnimalType(activeBranchCode, 'BUFFALO'),
      ]);

      const filterByType = (list: FatRate[], type: AnimalType): FatRate[] =>
        list.filter(r => {
          const mt = (r.milkType ?? r.animalType as string | undefined)?.toUpperCase();
          return mt === type;
        });

      setCowRates(filterByType(cowList, 'COW'));
      setBufRates(filterByType(bufList, 'BUFFALO'));
    } catch (err) {
      console.error('Failed to load fat rates:', err);
      toast.error('दर लोड करण्यात अडचण आली');
    } finally {
      setLoading(false);
    }
  };

  const resetForms = () => {
    setForm({ fat: '', snf: '', rate: '' });
    setMultiFat('');
    setMultiRates({});
    setBulkFrom(''); setBulkTo(''); setBulkSnf(''); setBulkRate1(''); setBulkRate2('');
  };

  // ── Single-entry validation ──────────────────────────────────────────────────
  const fatInvalid = form.fat !== '' && (() => {
    const f = parseFloat(form.fat);
    return isNaN(f) || f < cfg.minFat || f > cfg.maxFat;
  })();

  // ── Multi-SNF validation ─────────────────────────────────────────────────────
  const multiFatInvalid = multiFat !== '' && (() => {
    const f = parseFloat(multiFat);
    return isNaN(f) || f < cfg.minFat || f > cfg.maxFat;
  })();

  // ── Edit form validation ───────────────────────────────────────────────────
  const editFatInvalid = editForm.fat !== '' && (() => {
    const f = parseFloat(editForm.fat);
    return isNaN(f) || f < cfg.minFat || f > cfg.maxFat;
  })();

  // ── Single-entry save ────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!activeBranchCode) { toast.error('कृपया प्रथम शाखा निवडा'); return; }
    if (!form.fat || !form.rate) { toast.error('दोन्ही फील्ड आवश्यक आहेत'); return; }
    if (fatInvalid) { toast.error(`फॅट ${cfg.minFat}% – ${cfg.maxFat}% च्या आत असावा`); return; }
    setSaving(true);
    try {
      await fatRateAPI.save(activeBranchCode, {
        animalType:    activeTab,
        fatPercentage: parseFloat(form.fat),
        snf:           form.snf ? parseFloat(form.snf) : undefined,
        ratePerLiter:  parseFloat(form.rate),
      });
      toast.success('दर जतन झाला');
      setForm({ fat: '', snf: '', rate: '' });
      await loadAll();
    } catch (err: any) {
      console.error('Save error:', err);
      toast.error(err?.response?.data?.message || 'Error saving rate');
    } finally {
      setSaving(false);
    }
  };

  // ── Multi-SNF save: one fat value, several SNF+rate rows in one go ──────────
  const handleMultiSnfSave = async () => {
    if (!activeBranchCode) { toast.error('कृपया प्रथम शाखा निवडा'); return; }
    if (!multiFat || multiFatInvalid) { toast.error(`फॅट ${cfg.minFat}% – ${cfg.maxFat}% च्या आत असावा`); return; }

    const fat = parseFloat(multiFat);
    const entries = cfg.snfOptions
      .map(snf => ({ snf, rate: multiRates[snf] }))
      .filter(e => e.rate !== undefined && e.rate !== '');

    if (entries.length === 0) { toast.error('किमान एका SNF साठी दर भरा'); return; }

    setMultiSaving(true);
    try {
      let saved = 0;
      for (const e of entries) {
        const rateNum = parseFloat(e.rate!);
        if (isNaN(rateNum)) continue;
        await fatRateAPI.save(activeBranchCode, {
          animalType:    activeTab,
          fatPercentage: fat,
          snf:           e.snf,
          ratePerLiter:  rateNum,
        });
        saved++;
      }
      toast.success(`फॅट ${fat}% साठी ${saved} SNF दर जतन झाले`);
      setMultiFat('');
      setMultiRates({});
      await loadAll();
    } catch (err: any) {
      console.error('Multi-SNF save error:', err);
      toast.error(err?.response?.data?.message || 'Error saving rates');
    } finally {
      setMultiSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!activeBranchCode) { toast.error('कृपया प्रथम शाखा निवडा'); return; }
    if (!window.confirm('हा दर काढायचा?')) return;
    try {
      await fatRateAPI.delete(activeBranchCode, id);
      toast.success('दर काढला');
      await loadAll();
    } catch {
      toast.error('Delete failed');
    }
  };

  // ── Inline edit handlers ───────────────────────────────────────────────────
  const startEdit = (r: FatRate) => {
    setEditingId(r.id!);
    setEditForm({
      fat:  String(r.fatPercentage),
      snf:  r.snf !== undefined && r.snf !== null ? String(r.snf) : '',
      rate: String(r.ratePerLiter),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ fat: '', snf: '', rate: '' });
  };

  const handleEditSave = async (id: number) => {
    if (!activeBranchCode) { toast.error('कृपया प्रथम शाखा निवडा'); return; }
    if (!editForm.fat || !editForm.rate) { toast.error('दोन्ही फील्ड आवश्यक आहेत'); return; }
    if (editFatInvalid) { toast.error(`फॅट ${cfg.minFat}% – ${cfg.maxFat}% च्या आत असावा`); return; }

    setEditSaving(true);
    try {
      await fatRateAPI.update(activeBranchCode, id, {
        animalType:    activeTab,
        fatPercentage: parseFloat(editForm.fat),
        snf:           editForm.snf ? parseFloat(editForm.snf) : undefined,
        ratePerLiter:  parseFloat(editForm.rate),
      });
      toast.success('दर अपडेट झाला ✓');
      cancelEdit();
      await loadAll();
    } catch (err: any) {
      console.error('Update error:', err);
      toast.error(err?.response?.data?.message || 'Update failed');
    } finally {
      setEditSaving(false);
    }
  };

  // ── Bulk save (fat range, single/no SNF applied to every row) ──────────────
  const handleBulkSave = async () => {
    if (!activeBranchCode) { toast.error('कृपया प्रथम शाखा निवडा'); return; }

    const from  = parseFloat(bulkFrom);
    const to    = parseFloat(bulkTo);
    const step  = parseFloat(bulkStep);
    const rate1 = parseFloat(bulkRate1);
    const rate2 = parseFloat(bulkRate2);

    if ([from, to, step, rate1, rate2].some(isNaN) || from >= to || step <= 0) {
      toast.error('सर्व मूल्ये बरोबर भरा'); return;
    }
    if (from < cfg.minFat || to > cfg.maxFat) {
      toast.error(`${cfg.emoji} फॅट ${cfg.minFat}% – ${cfg.maxFat}% च्या आत असावा`); return;
    }

    setBulking(true);
    const points: number[] = [];
    for (let f = from; f <= to + 0.001; f = Math.round((f + step) * 10) / 10) {
      points.push(Math.round(f * 10) / 10);
    }

    const snfValue = bulkSnf ? parseFloat(bulkSnf) : undefined;

    try {
      let saved = 0;
      for (let i = 0; i < points.length; i++) {
        const interpolatedRate = points.length > 1
          ? rate1 + ((rate2 - rate1) * i) / (points.length - 1)
          : rate1;
        await fatRateAPI.save(activeBranchCode, {
          animalType:    activeTab,
          fatPercentage: points[i],
          snf:           snfValue,
          ratePerLiter:  Math.round(interpolatedRate * 100) / 100,
        });
        saved++;
      }
      toast.success(`${saved} दर जतन झाले`);
      setBulkFrom(''); setBulkTo(''); setBulkSnf(''); setBulkRate1(''); setBulkRate2('');
      await loadAll();
    } catch (err) {
      console.error('Bulk save error:', err);
      toast.error('Bulk save failed — काही दर जतन झाले असतील, refresh करा');
      await loadAll();
    } finally {
      setBulking(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* ── Animal Tabs ── */}
      <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-4">
        <div className="flex gap-3">
          {(['COW', 'BUFFALO'] as AnimalType[]).map(type => {
            const c     = ANIMAL_CONFIG[type];
            const count = type === 'COW' ? cowRates.length : bufRates.length;
            return (
              <button key={type}
                onClick={() => {
                  setActiveTab(type);
                  resetForms();
                  setEntryMode('single');
                  cancelEdit();
                }}
                className={`flex-1 flex flex-col items-center gap-1 py-4 rounded-xl border-2 font-semibold transition-all ${
                  activeTab === type ? c.tabActive : c.tabInactive}`}>
                <span className="text-3xl">{c.emoji}</span>
                <span className="text-sm">{c.label}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                  activeTab === type ? c.badgeBg : 'bg-gray-100 text-gray-500'}`}>
                  {loading ? '...' : `${count} दर`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Fat Range Info Banner ── */}
      <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${cfg.rangeBg}`}>
        <Info size={16} className="shrink-0" />
        <div>
          <p className="font-semibold text-sm">{cfg.emoji} {cfg.label} — मान्य फॅट श्रेणी</p>
          <p className="text-xs mt-0.5">फॅट <b>{cfg.minFat}%</b> ते <b>{cfg.maxFat}%</b> च्या दरम्यान दर सेट करा</p>
          <p className="text-xs mt-0.5">SNF (ऐच्छिक): <b>{cfg.snfOptions.join('%, ')}%</b></p>
          {activeTab === 'COW' && (
            <p className="text-xs mt-0.5 opacity-70">
              ⚠️ 4.8–5.0% फॅट गाय आणि म्हैस दोन्हींसाठी वेगळ्या दराने नोंदवता येतो
            </p>
          )}
        </div>
      </div>

      {/* ── Add Rate Form ── */}
      <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-bold text-green-900">{cfg.emoji} नवीन दर जोडा / बदला</h3>
          <div className="flex gap-4 text-xs font-semibold">
            <button onClick={() => setEntryMode('single')}
              className={entryMode === 'single' ? 'text-green-700 underline' : 'text-gray-400 hover:text-gray-600'}>
              एकच दर
            </button>
            <button onClick={() => setEntryMode('multiSnf')}
              className={entryMode === 'multiSnf' ? 'text-green-700 underline' : 'text-gray-400 hover:text-gray-600'}>
              एका फॅटसाठी अनेक SNF
            </button>
            <button onClick={() => setEntryMode('bulk')}
              className={entryMode === 'bulk' ? 'text-blue-600 underline' : 'text-gray-400 hover:text-gray-600'}>
              📋 Bulk फॅट श्रेणी
            </button>
          </div>
        </div>

        {/* ── Mode 1: Single fat + optional single SNF + rate ── */}
        {entryMode === 'single' && (
          <div className="flex gap-3 items-end flex-wrap md:flex-nowrap">
            <div className="flex-1 min-w-[120px]">
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                फॅट % <span className="ml-1 font-normal text-gray-400">({cfg.minFat}–{cfg.maxFat})</span>
              </label>
              <input type="number" step="0.1" value={form.fat}
                onChange={e => setForm({ ...form, fat: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                placeholder={cfg.placeholder}
                className={`w-full border-2 rounded-xl px-4 py-2.5 text-lg font-bold focus:ring-2 outline-none transition-all ${
                  fatInvalid ? 'border-red-400 bg-red-50 focus:ring-red-300' : 'border-gray-200 focus:ring-green-400'}`} />
              {fatInvalid && (
                <p className="mt-1 text-red-500 text-xs font-semibold">⚠️ {cfg.minFat}–{cfg.maxFat}% च्या आत असावा</p>
              )}
            </div>

            <div className="flex-1 min-w-[110px]">
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                SNF % <span className="ml-1 font-normal text-gray-400">(ऐच्छिक)</span>
              </label>
              <select value={form.snf}
                onChange={e => setForm({ ...form, snf: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-lg font-bold focus:ring-2 focus:ring-green-400 outline-none bg-white">
                <option value="">—</option>
                {cfg.snfOptions.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            <div className="flex-1 min-w-[120px]">
              <label className="block text-xs font-semibold text-gray-500 mb-1">दर (₹/Liter)</label>
              <input type="number" step="0.5" value={form.rate}
                onChange={e => setForm({ ...form, rate: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                placeholder={cfg.ratePlaceholder}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-lg font-bold focus:ring-2 focus:ring-green-400 outline-none" />
            </div>
            <button onClick={handleSave}
              disabled={saving || !activeBranchCode || !!fatInvalid || !form.fat || !form.rate}
              className={`flex items-center gap-2 ${cfg.saveBtn} disabled:bg-gray-300 text-white px-6 py-2.5 rounded-xl font-semibold whitespace-nowrap`}>
              <Save size={16} />
              {saving ? 'जतन होत आहे...' : 'जतन करा'}
            </button>
          </div>
        )}

        {/* ── Mode 2: One fat, many SNF + rate pairs at once ── */}
        {entryMode === 'multiSnf' && (
          <div className="space-y-4">
            <div className={`rounded-lg px-3 py-2 text-xs ${cfg.rangeBg}`}>
              एक फॅट % द्या, मग प्रत्येक SNF साठी वेगळा दर भरा. उदा. फॅट 2.8% + SNF 8.2% = ₹28.10, फॅट 2.8% + SNF 8.3% = ₹28.30.
              रिकामे सोडलेले SNF जतन होणार नाहीत.
            </div>

            <div className="max-w-[200px]">
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                फॅट % <span className="ml-1 font-normal text-gray-400">({cfg.minFat}–{cfg.maxFat})</span>
              </label>
              <input type="number" step="0.1" value={multiFat}
                onChange={e => setMultiFat(e.target.value)}
                placeholder={cfg.placeholder}
                className={`w-full border-2 rounded-xl px-4 py-2.5 text-lg font-bold focus:ring-2 outline-none transition-all ${
                  multiFatInvalid ? 'border-red-400 bg-red-50 focus:ring-red-300' : 'border-gray-200 focus:ring-green-400'}`} />
              {multiFatInvalid && (
                <p className="mt-1 text-red-500 text-xs font-semibold">⚠️ {cfg.minFat}–{cfg.maxFat}% च्या आत असावा</p>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {cfg.snfOptions.map(snf => (
                <div key={snf}>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">SNF {snf}% चा दर ₹</label>
                  <input type="number" step="0.1"
                    value={multiRates[snf] ?? ''}
                    onChange={e => setMultiRates({ ...multiRates, [snf]: e.target.value })}
                    placeholder={cfg.ratePlaceholder}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-green-400 outline-none" />
                </div>
              ))}
            </div>

            <button onClick={handleMultiSnfSave}
              disabled={multiSaving || !activeBranchCode || !multiFat || !!multiFatInvalid}
              className={`flex items-center gap-2 ${cfg.saveBtn} disabled:bg-gray-300 text-white px-6 py-2.5 rounded-xl font-semibold text-sm`}>
              <Save size={14} />
              {multiSaving ? 'जतन होत आहे...' : 'सर्व SNF दर जतन करा'}
            </button>
          </div>
        )}

        {/* ── Mode 3: Bulk fat range, interpolated rates ── */}
        {entryMode === 'bulk' && (
          <div className="space-y-4">
            <div className={`rounded-lg px-3 py-2 text-xs ${cfg.rangeBg}`}>
              फॅट श्रेणी द्या आणि पहिला व शेवटचा दर द्या — मधले दर आपोआप interpolate होतील.
              SNF दिल्यास तेच सर्व दरांना लागू होईल.
              &nbsp;<b>{cfg.emoji} {cfg.label}: {cfg.minFat}% – {cfg.maxFat}%</b>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">फॅट पासून</label>
                <input type="number" step="0.1" value={bulkFrom}
                  onChange={e => setBulkFrom(e.target.value)} placeholder={String(cfg.minFat)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-green-400 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">फॅट पर्यंत</label>
                <input type="number" step="0.1" value={bulkTo}
                  onChange={e => setBulkTo(e.target.value)} placeholder={String(cfg.maxFat)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-green-400 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Step</label>
                <input type="number" step="0.1" value={bulkStep}
                  onChange={e => setBulkStep(e.target.value)} placeholder="0.1"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-green-400 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">SNF (ऐच्छिक)</label>
                <select value={bulkSnf}
                  onChange={e => setBulkSnf(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-green-400 outline-none bg-white">
                  <option value="">—</option>
                  {cfg.snfOptions.map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">पहिला दर ₹</label>
                <input type="number" step="0.1" value={bulkRate1}
                  onChange={e => setBulkRate1(e.target.value)} placeholder={cfg.ratePlaceholder}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-green-400 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">शेवटचा दर ₹</label>
                <input type="number" step="0.1" value={bulkRate2}
                  onChange={e => setBulkRate2(e.target.value)} placeholder="50.00"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-green-400 outline-none" />
              </div>
            </div>
            {bulkFrom && bulkTo && bulkStep && (
              <p className="text-xs text-gray-500">
                अंदाजे <b>{Math.ceil((parseFloat(bulkTo) - parseFloat(bulkFrom)) / parseFloat(bulkStep)) + 1}</b> दर तयार होतील
              </p>
            )}
            <div className="flex gap-3">
              <button onClick={handleBulkSave} disabled={bulking || !activeBranchCode}
                className={`flex items-center gap-2 ${cfg.saveBtn} disabled:bg-gray-300 text-white px-5 py-2.5 rounded-xl font-semibold text-sm`}>
                <Save size={14} />
                {bulking ? 'जतन होत आहे...' : 'सर्व दर जतन करा'}
              </button>
              <button onClick={() => setEntryMode('single')}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50">
                रद्द
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Rates Table ── */}
      <div className="bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
        <div className={`${cfg.headerBg} px-5 py-3 flex items-center justify-between`}>
          <h3 className="font-bold text-white">{cfg.emoji} {cfg.label} — फॅट दर सारणी</h3>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-white/20 text-white px-3 py-1 rounded-full font-semibold">{rates.length} दर</span>
            <button onClick={loadAll} title="Refresh" className="text-white/70 hover:text-white p-1 rounded">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Edit mode hint */}
        {editingId === null && rates.length > 0 && !loading && (
          <div className="px-5 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-600 flex items-center gap-1.5">
            <Pencil size={11} />
            <span>कोणत्याही ओळीवर ✏️ दाबा दर बदलण्यासाठी</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                <th className="px-5 py-3 text-left">फॅट %</th>
                <th className="px-5 py-3 text-center">SNF %</th>
                <th className="px-5 py-3 text-center">दर (₹/L)</th>
                <th className="px-5 py-3 text-center w-24">क्रिया</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-gray-400">
                    <RefreshCw size={20} className="animate-spin mx-auto mb-2" />
                    लोड होत आहे...
                  </td>
                </tr>
              ) : rates.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-gray-400">
                    <p className="text-4xl mb-3">{cfg.emoji}</p>
                    <p className="font-semibold">{cfg.label} साठी कोणतेही दर नाहीत</p>
                    <p className="text-xs mt-1 text-gray-300">वरील फॉर्ममधून दर जोडा</p>
                  </td>
                </tr>
              ) : rates.map((r, idx) => {
                const isEditing = editingId === r.id;
                // Same fat% as the row above → visually de-emphasize the repeated fat value
                const prevFat = idx > 0 ? rates[idx - 1].fatPercentage : null;
                const sameFatAsPrev = prevFat !== null && prevFat === r.fatPercentage;

                // ── Editing row ─────────────────────────────────────────────
                if (isEditing) {
                  return (
                    <tr key={r.id ?? `rate-${idx}`} className={`${cfg.editRowBg} border-l-4 border-blue-400`}>
                      {/* Fat % editable */}
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.1"
                          value={editForm.fat}
                          onChange={e => setEditForm({ ...editForm, fat: e.target.value })}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleEditSave(r.id!);
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          className={`w-24 border-2 rounded-lg px-2 py-1.5 text-sm font-bold focus:ring-2 outline-none transition-all ${
                            editFatInvalid
                              ? 'border-red-400 bg-red-50 focus:ring-red-300'
                              : 'border-blue-300 focus:ring-blue-400 bg-white'
                          }`}
                          autoFocus
                        />
                        {editFatInvalid && (
                          <p className="text-red-500 text-xs mt-0.5">⚠️ {cfg.minFat}–{cfg.maxFat}%</p>
                        )}
                      </td>

                      {/* SNF editable */}
                      <td className="px-3 py-2 text-center">
                        <select
                          value={editForm.snf}
                          onChange={e => setEditForm({ ...editForm, snf: e.target.value })}
                          className="w-20 border-2 border-blue-300 rounded-lg px-1.5 py-1.5 text-sm font-bold focus:ring-2 focus:ring-blue-400 outline-none bg-white text-center">
                          <option value="">—</option>
                          {cfg.snfOptions.map(v => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      </td>

                      {/* Rate editable */}
                      <td className="px-3 py-2 text-center">
                        <input
                          type="number"
                          step="0.5"
                          value={editForm.rate}
                          onChange={e => setEditForm({ ...editForm, rate: e.target.value })}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleEditSave(r.id!);
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          className="w-28 border-2 border-blue-300 rounded-lg px-2 py-1.5 text-sm font-bold focus:ring-2 focus:ring-blue-400 outline-none bg-white text-center"
                        />
                      </td>

                      {/* Save / Cancel */}
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleEditSave(r.id!)}
                            disabled={editSaving || !!editFatInvalid || !editForm.fat || !editForm.rate}
                            title="जतन करा"
                            className="text-green-600 hover:text-green-800 hover:bg-green-100 disabled:opacity-40 p-1.5 rounded-lg transition-colors">
                            {editSaving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                          </button>
                          <button
                            onClick={cancelEdit}
                            title="रद्द"
                            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1.5 rounded-lg transition-colors">
                            <X size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                // ── Normal row ──────────────────────────────────────────────
                return (
                  <tr key={r.id ?? `rate-${idx}`} className={`${cfg.rowHover} transition-colors`}>
                    <td className="px-5 py-3">
                      <span className={`font-bold text-base ${cfg.fatColor} ${sameFatAsPrev ? 'opacity-40' : ''}`}>
                        {r.fatPercentage}%
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center text-gray-600">
                      {r.snf !== undefined && r.snf !== null ? `${r.snf}%` : '—'}
                    </td>
                    <td className="px-5 py-3 text-center font-bold text-gray-800 text-base">
                      ₹{r.ratePerLiter}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => r.id !== undefined && startEdit(r)}
                          title="बदला"
                          className="text-blue-400 hover:text-blue-600 hover:bg-blue-50 p-1.5 rounded-lg transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => r.id !== undefined && handleDelete(r.id)}
                          title="काढा"
                          className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {rates.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t border-gray-200 text-xs text-gray-500 font-semibold">
                  <td className="px-5 py-2">
                    श्रेणी: <span className={cfg.fatColor}>{rates[0]?.fatPercentage}% – {rates[rates.length - 1]?.fatPercentage}%</span>
                  </td>
                  <td></td>
                  <td className="px-5 py-2 text-center">
                    ₹{Math.min(...rates.map(r => r.ratePerLiter))} – ₹{Math.max(...rates.map(r => r.ratePerLiter))}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}