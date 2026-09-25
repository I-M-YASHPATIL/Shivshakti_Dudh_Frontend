import { useState, useEffect } from "react";
import { lagwadTypeAPI } from "../services/api";
import { useBranch } from "../pages/Branchcontext";
import type { LagwadType } from "../types/dairyTypes";
import toast from "react-hot-toast";
import { Plus, Save, Trash2, Pencil, X, Check, Leaf } from "lucide-react";

const UNIT_SUGGESTIONS = ["नग", "गोणी", "किलो", "लिटर", "पॅकेट"];

export default function LagwadTypesPage() {
  const { activeBranchCode } = useBranch();

  const [types, setTypes] = useState<LagwadType[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // add form
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("नग");

  // inline edit
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editUnit, setEditUnit] = useState("");

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    if (!activeBranchCode) return;
    setLoading(true);
    try {
      setTypes(await lagwadTypeAPI.getAll(activeBranchCode));
    } catch {
      toast.error("लागवड प्रकार लोड करता आले नाहीत");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchCode]);

  const handleAdd = async () => {
    if (!activeBranchCode) return;
    const p = parseFloat(price);
    if (!name.trim()) return toast.error("लागवड प्रकाराचे नाव टाका");
    if (!p || p <= 0) return toast.error("किंमत बरोबर टाका");

    setSaving(true);
    try {
      await lagwadTypeAPI.create(activeBranchCode, {
        name: name.trim(),
        price: p,
        unit: unit.trim() || undefined,
      });
      toast.success("लागवड प्रकार जतन केला");
      setName("");
      setPrice("");
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "जतन करता आले नाही");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (t: LagwadType) => {
    setEditId(t.id ?? null);
    setEditName(t.name);
    setEditPrice(String(t.price));
    setEditUnit(t.unit ?? "");
  };

  const handleUpdate = async () => {
    if (!activeBranchCode || editId == null) return;
    const p = parseFloat(editPrice);
    if (!editName.trim()) return toast.error("नाव टाका");
    if (!p || p <= 0) return toast.error("किंमत बरोबर टाका");

    try {
      await lagwadTypeAPI.update(activeBranchCode, editId, {
        name: editName.trim(),
        price: p,
        unit: editUnit.trim() || undefined,
      });
      toast.success("बदल जतन केला");
      setEditId(null);
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "बदल करता आला नाही");
    }
  };

  const handleDelete = async () => {
    if (!activeBranchCode || deleteId == null) return;
    setDeleting(true);
    try {
      await lagwadTypeAPI.delete(activeBranchCode, deleteId);
      toast.success("लागवड प्रकार हटवला");
      setDeleteId(null);
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "हटवता आले नाही");
    } finally {
      setDeleting(false);
    }
  };

  if (!activeBranchCode) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center text-gray-400">
        <p className="text-lg font-semibold">शाखा निवडा</p>
        <p className="text-sm mt-1">
          Please select a branch to manage lagwad types.
        </p>
      </div>
    );
  }

  const inputCls =
    "w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-green-400 outline-none";

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* ── Delete confirmation ── */}
      {deleteId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4 border border-red-100">
            <h3 className="font-bold text-gray-800 text-lg mb-2">
              हा लागवड प्रकार हटवायचा आहे का?
            </h3>
            <p className="text-xs text-gray-400 mb-5">
              जुन्या खाते नोंदींवर याचा परिणाम होणार नाही.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white py-2.5 rounded-xl font-semibold text-sm"
              >
                <Trash2 size={15} />
                {deleting ? "हटवत आहे..." : "हटवा"}
              </button>
              <button
                onClick={() => setDeleteId(null)}
                disabled={deleting}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-xl font-semibold text-sm"
              >
                रद्द करा
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add form ── */}
      <div className="bg-white rounded-2xl border border-green-200 shadow-sm p-6">
        <h3 className="font-bold text-green-900 mb-4 flex items-center gap-2">
          <Leaf size={18} /> नवीन लागवड प्रकार
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              लागवड प्रकाराचे नाव *
            </label>
            <input
              type="text"
              placeholder="उदा. पशुखाद्य, सरकी पेंड, मका"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              किंमत (₹) — एका युनिटची *
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className={inputCls}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              युनिट (ऐच्छिक)
            </label>
            <input
              type="text"
              list="lagwad-unit-list"
              placeholder="नग / गोणी / किलो"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className={inputCls}
            />
            <datalist id="lagwad-unit-list">
              {UNIT_SUGGESTIONS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </div>
        </div>
        <button
          onClick={handleAdd}
          disabled={saving}
          className="mt-5 flex items-center gap-2 bg-green-700 hover:bg-green-800 disabled:bg-gray-300 text-white px-5 py-2.5 rounded-xl font-semibold"
        >
          <Plus size={16} /> {saving ? "जतन होत आहे..." : "प्रकार जोडा"}
        </button>
      </div>

      {/* ── List ── */}
      <div className="bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-green-800 text-green-100 text-xs uppercase">
              <th className="px-4 py-3 text-left">#</th>
              <th className="px-4 py-3 text-left">लागवड प्रकार</th>
              <th className="px-4 py-3 text-right">किंमत (₹)</th>
              <th className="px-4 py-3 text-left">युनिट</th>
              <th className="px-4 py-3 text-center">क्रिया</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  लोड होत आहे...
                </td>
              </tr>
            ) : types.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  अजून कोणताही लागवड प्रकार नाही
                </td>
              </tr>
            ) : (
              types.map((t, i) =>
                editId === t.id ? (
                  <tr key={t.id} className="bg-amber-50">
                    <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-2">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-green-400"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                        className="w-28 ml-auto block border border-gray-200 rounded-lg px-3 py-1.5 text-right outline-none focus:ring-2 focus:ring-green-400"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={editUnit}
                        onChange={(e) => setEditUnit(e.target.value)}
                        className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-green-400"
                      />
                    </td>
                    <td className="px-4 py-2 text-center whitespace-nowrap">
                      <button
                        onClick={handleUpdate}
                        className="text-green-600 hover:text-green-800 p-1 rounded-lg hover:bg-green-50"
                        title="जतन करा"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={() => setEditId(null)}
                        className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"
                        title="रद्द करा"
                      >
                        <X size={16} />
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={t.id} className="hover:bg-amber-50">
                    <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-3 font-semibold text-green-900">
                      {t.name}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      ₹{Number(t.price).toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{t.unit || "-"}</td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <button
                        onClick={() => startEdit(t)}
                        className="text-blue-400 hover:text-blue-600 p-1 rounded-lg hover:bg-blue-50"
                        title="बदला"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteId(t.id ?? null)}
                        className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50"
                        title="हटवा"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ),
              )
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 flex items-center gap-1">
        <Save size={12} /> येथे जोडलेले प्रकार "उचल/लागवड" पानावर लागवड निवडल्यावर
        दिसतील.
      </p>
    </div>
  );
}