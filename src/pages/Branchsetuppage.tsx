import  { useState } from 'react';
import { branchAPI } from '../services/api';
import { useBranch } from '../pages/Branchcontext';
import type { Branch } from '../types/dairyTypes';
import toast from 'react-hot-toast';
import { Building2, Plus, Edit2, Save, X, CheckCircle, Lock } from 'lucide-react';

const empty: Branch = { code: '', name: '', isActive: true };

export default function BranchSetupPage() {
  const { branches, loading } = useBranch();
  const [showForm, setShowForm] = useState(branches.length === 0);
  const [editId,   setEditId]   = useState<number | null>(null);
  const [editCode, setEditCode] = useState('');   // display-only when editing
  const [form,     setForm]     = useState<Branch>(empty);
  const [saving,   setSaving]   = useState(false);

  const reload = () => window.location.reload();

  const openCreate = () => {
    setForm(empty);
    setEditId(null);
    setEditCode('');
    setShowForm(true);
  };

  const openEdit = (b: Branch) => {
    setForm({ ...b });
    setEditId(b.id ?? null);
    setEditCode(b.code);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('नाव आवश्यक आहे'); return; }
    if (!editId && !form.code.trim()) { toast.error('कोड आवश्यक आहे'); return; }

    setSaving(true);
    try {
      if (editId) {
        // Only send name (and isActive) — code never changes
        await branchAPI.update(editId, { ...form, code: editCode });
        toast.success('शाखा नाव अपडेट झाले');
      } else {
        const saved = await branchAPI.create(form);
        toast.success(`शाखा "${saved.name}" तयार झाली!`);
      }
      setShowForm(false);
      setEditId(null);
      setForm(empty);
      setTimeout(reload, 500);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error saving branch');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-5">

      {/* Header card */}
      <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <Building2 size={20} className="text-green-700" />
            </div>
            <div>
              <h2 className="font-bold text-green-900 text-lg">शाखा व्यवस्थापन</h2>
              <p className="text-xs text-gray-500">Branch Management</p>
            </div>
          </div>
          <button onClick={openCreate}
            className="flex items-center gap-2 bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded-xl text-sm font-semibold">
            <Plus size={16} /> नवीन शाखा
          </button>
        </div>

        {branches.length === 0 && !loading && (
          <div className="mt-4 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-sm text-orange-800 font-medium">
            ⚠️ अजून कोणतीही शाखा नाही. खाली नवीन शाखा तयार करा.
          </div>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-green-200 shadow-sm p-6">
          <h3 className="font-bold text-green-900 mb-4">
            {editId ? `✏️ शाखा नाव बदला — ${editCode}` : '➕ नवीन शाखा तयार करा'}
          </h3>

          <div className="space-y-4">
            {/* Code field */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
                शाखा कोड *
                {editId && <span className="ml-1 flex items-center gap-1 text-gray-400 font-normal"><Lock size={11} /> बदलता येत नाही</span>}
                {!editId && <span className="font-normal text-gray-400">(e.g. MAIN, BR1 — एकदा सेट केल्यावर बदलता येत नाही)</span>}
              </label>
              {editId ? (
                // Show code as read-only badge when editing
                <div className="w-full border border-gray-100 bg-gray-50 rounded-xl px-4 py-3 text-lg font-bold tracking-widest text-gray-400 flex items-center gap-2">
                  <Lock size={14} className="text-gray-300" />
                  {editCode}
                </div>
              ) : (
                <input
                  type="text"
                  placeholder="MAIN"
                  value={form.code}
                  onChange={e => setForm({ ...form, code: e.target.value.toUpperCase().replace(/\s/g, '') })}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg font-bold tracking-widest focus:ring-2 focus:ring-green-400 outline-none uppercase"
                />
              )}
            </div>

            {/* Name field — always editable */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">शाखा नाव *</label>
              <input
                type="text"
                placeholder="मुख्य शाखा"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                autoFocus={!!editId}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:ring-2 focus:ring-green-400 outline-none"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-5">
            <button onClick={handleSubmit}
              disabled={saving || !form.name.trim() || (!editId && !form.code.trim())}
              className="flex items-center gap-2 bg-green-700 hover:bg-green-800 disabled:bg-gray-300 text-white px-6 py-2.5 rounded-xl font-semibold">
              <Save size={16} />
              {saving ? 'जतन होत आहे...' : editId ? 'नाव जतन करा' : 'शाखा तयार करा'}
            </button>
            <button onClick={() => { setShowForm(false); setForm(empty); setEditId(null); }}
              className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2.5 rounded-xl font-semibold">
              <X size={16} /> रद्द करा
            </button>
          </div>
        </div>
      )}

      {/* Branches list */}
      {branches.length > 0 && (
        <div className="bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
          <div className="bg-green-800 px-5 py-3">
            <h3 className="font-bold text-white text-sm">सध्याच्या शाखा ({branches.length})</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {branches.map(b => (
              <div key={b.code} className="flex items-center justify-between px-5 py-4 hover:bg-amber-50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center">
                    <Building2 size={16} className="text-green-700" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">{b.name}</p>
                    <p className="text-xs text-gray-400 font-mono tracking-widest">{b.code}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded-full">
                    <CheckCircle size={12} /> Active
                  </span>
                  <button onClick={() => openEdit(b)}
                    className="text-blue-500 hover:text-blue-700 p-1.5 rounded-lg hover:bg-blue-50"
                    title="नाव बदला">
                    <Edit2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}