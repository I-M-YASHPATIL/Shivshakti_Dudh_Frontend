import { useState, useEffect } from 'react';
import { farmerAPI } from '../services/api';
import { useBranch } from '../pages/Branchcontext';
import type { Farmer, FarmerAnimalType } from '../types/dairyTypes';
import toast from 'react-hot-toast';
import { Plus, Edit2, Save, X, Trash2, AlertTriangle } from 'lucide-react';

const empty: Farmer = {
  farmerNumber: 0, name: '', phone: '', animalType: 'COW', isActive: true,
  number: ''
};

export default function FarmersPage() {
  const { activeBranchCode } = useBranch();
  const [farmers,       setFarmers]       = useState<Farmer[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [showForm,      setShowForm]      = useState(false);
  const [editId,        setEditId]        = useState<number | null>(null);
  const [form,          setForm]          = useState<Farmer>(empty);
  const [saving,        setSaving]        = useState(false);
  const [deleteTarget,  setDeleteTarget]  = useState<Farmer | null>(null);
  const [deleting,      setDeleting]      = useState(false);

  useEffect(() => {
    if (activeBranchCode) load();
  }, [activeBranchCode]);

  const load = async () => {
    setLoading(true);
    try { setFarmers(await farmerAPI.getAll(activeBranchCode)); }
    catch { toast.error('Failed to load farmers'); }
    finally { setLoading(false); }
  };

  const handleSubmit = async () => {
    if (!activeBranchCode) {
      toast.error('कृपया प्रथम शाखा निवडा');
      return;
    }
    if (!form.farmerNumber || !form.name || !form.animalType) {
      toast.error('क्रमांक, नाव आणि प्राणी प्रकार आवश्यक आहे');
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await farmerAPI.update(activeBranchCode, editId, form);
        toast.success('Updated');
      } else {
        await farmerAPI.create(activeBranchCode, form);
        toast.success('Farmer added');
      }
      setShowForm(false);
      setEditId(null);
      setForm(empty);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !activeBranchCode) return;
    setDeleting(true);
    try {
      await farmerAPI.delete(activeBranchCode, deleteTarget.farmerNumber);
      toast.success(`${deleteTarget.name} निष्क्रिय केला`);
      setDeleteTarget(null);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  if (!activeBranchCode) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center text-gray-400">
        <p className="text-lg font-semibold">शाखा निवडा</p>
        <p className="text-sm mt-1">Please select a branch to manage farmers.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* ── Delete Confirmation Modal ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4 border border-red-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="bg-red-100 p-2 rounded-full">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <h3 className="font-bold text-gray-800 text-lg">उत्पादक निष्क्रिय करा</h3>
            </div>
            <p className="text-gray-600 text-sm mb-1">
              खालील उत्पादकाला निष्क्रिय करायचे आहे का?
            </p>
            <p className="font-semibold text-gray-800 mb-4">
              #{deleteTarget.farmerNumber} — {deleteTarget.name}
            </p>
            <p className="text-xs text-gray-400 mb-5">
              उत्पादक यादीतून हटवला जाईल, परंतु नोंदी व बिले सुरक्षित राहतील.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white py-2.5 rounded-xl font-semibold text-sm"
              >
                <Trash2 size={15} />
                {deleting ? 'Deleting...' : 'निष्क्रिय करा'}
              </button>
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-xl font-semibold text-sm"
              >
                रद्द करा
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex justify-between items-center">
        <p className="text-gray-500 text-sm">{farmers.length} उत्पादक नोंदणीकृत</p>
        <button
          onClick={() => { setForm(empty); setEditId(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-green-700 hover:bg-green-800 text-white px-4 py-2.5 rounded-xl font-semibold"
        >
          <Plus size={18} /> नवीन उत्पादक
        </button>
      </div>

      {/* ── Add / Edit Form ── */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-green-200 shadow-sm p-6">
          <h3 className="font-bold text-green-900 mb-4">{editId ? 'बदल करा' : 'नवीन शेतकरी'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">क्रमांक *</label>
              <input
                type="number"
                placeholder="1"
                value={form.farmerNumber || ''}
                onChange={e => setForm({ ...form, farmerNumber: parseInt(e.target.value) || 0 })}
                disabled={!!editId}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-green-400 outline-none disabled:bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">नाव *</label>
              <input
                type="text"
                placeholder="Farmer Name"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-green-400 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">फोन</label>
              <input
                type="tel"
                placeholder="9876543210"
                value={form.phone || ''}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-green-400 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">प्राणी प्रकार *</label>
              <div className="flex gap-2 mt-1">
                {(['COW', 'BUFFALO', 'BOTH'] as FarmerAnimalType[]).map(type => (
                  <button
                    key={type}
                    onClick={() => setForm({ ...form, animalType: type })}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-semibold text-sm border-2 transition-all ${
                      form.animalType === type
                        ? type === 'COW'
                          ? 'border-yellow-500 bg-yellow-50 text-yellow-800 shadow-sm'
                          : type === 'BUFFALO'
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-800 shadow-sm'
                            : 'border-green-500 bg-green-50 text-green-800 shadow-sm'
                        : 'border-gray-200 bg-gray-50 text-gray-500'
                    }`}
                  >
                    {type === 'COW' ? '🐄 गाय' : type === 'BUFFALO' ? '🐃 म्हैस' : '🐄🐃 दोन्ही'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <button
              onClick={handleSubmit}
              disabled={saving || !activeBranchCode}
              className="flex items-center gap-2 bg-green-700 hover:bg-green-800 disabled:bg-gray-300 text-white px-5 py-2.5 rounded-xl font-semibold"
            >
              <Save size={16} /> {saving ? 'Saving...' : 'जतन करा'}
            </button>
            <button
              onClick={() => { setShowForm(false); setForm(empty); }}
              className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2.5 rounded-xl font-semibold"
            >
              <X size={16} /> रद्द करा
            </button>
          </div>
        </div>
      )}

      {/* ── Farmers Table ── */}
      <div className="bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-green-800 text-green-100 text-xs uppercase">
              <th className="px-4 py-3 text-left">क्र.</th>
              <th className="px-4 py-3 text-left">नाव</th>
              <th className="px-4 py-3 text-left">फोन</th>
              <th className="px-4 py-3 text-center">प्राणी</th>
              <th className="px-4 py-3 text-center">क्रिया</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading...</td>
              </tr>
            ) : farmers.map(f => (
              <tr
                key={f.id}
                className={
                  f.animalType === 'BUFFALO'
                    ? 'hover:bg-indigo-50 bg-indigo-50/20'
                    : f.animalType === 'BOTH'
                      ? 'hover:bg-green-50 bg-green-50/20'
                      : 'hover:bg-amber-50'
                }
              >
                <td className="px-4 py-3 font-bold text-green-800 text-lg">{f.farmerNumber}</td>
                <td className="px-4 py-3 font-semibold">{f.name}</td>
                <td className="px-4 py-3 text-gray-600">{f.phone || '-'}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                    f.animalType === 'COW'
                      ? 'bg-yellow-100 text-yellow-800'
                      : f.animalType === 'BUFFALO'
                        ? 'bg-indigo-100 text-indigo-800'
                        : 'bg-green-100 text-green-800'
                  }`}>
                    {f.animalType === 'COW' ? '🐄 गाय' : f.animalType === 'BUFFALO' ? '🐃 म्हैस' : '🐄🐃 दोन्ही'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => { setForm(f); setEditId(f.id || null); setShowForm(true); }}
                      className="text-blue-500 hover:text-blue-700 p-1 rounded-lg hover:bg-blue-50 transition-colors"
                      title="Edit"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(f)}
                      className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-colors"
                      title="Deactivate"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && farmers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  कोणतेही उत्पादक नाहीत
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}