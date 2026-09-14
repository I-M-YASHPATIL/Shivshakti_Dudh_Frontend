import { useState, useEffect, useRef } from "react";
import { farmerAPI, fatRateAPI, milkEntryAPI } from "../services/api";
import { useBranch } from "../pages/Branchcontext";
import type { MilkEntryResponse, AnimalType, FarmerAnimalType } from "../types/dairyTypes";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { Sun, Moon, Save, Trash2, RefreshCw } from "lucide-react";

export default function MilkEntryPage() {
  const { activeBranchCode } = useBranch();
  const [session, setSession] = useState<"MORNING" | "EVENING">("MORNING");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [farmerNum, setFarmerNum] = useState("");
  const [farmerName, setFarmerName] = useState("");
  const [farmerError, setFarmerError] = useState("");
  const [animalType, setAnimalType] = useState<AnimalType>("COW");
  const [farmerAnimalType, setFarmerAnimalType] = useState<FarmerAnimalType>("COW");
  const [liters, setLiters] = useState("");
  const [fat, setFat] = useState("");
  const [snf, setSnf] = useState("");
  const [rate, setRate] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [todayEntries, setTodayEntries] = useState<MilkEntryResponse[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

  const litersRef = useRef<HTMLInputElement>(null);
  const fatRef = useRef<HTMLInputElement>(null);
  const snfRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (activeBranchCode) loadEntries();
  }, [date, session, activeBranchCode]);

  useEffect(() => {
    const calc = async () => {
      if (!fat || !liters || !activeBranchCode) {
        setRate("");
        setAmount("");
        return;
      }
      const fatVal = parseFloat(fat);
      const snfVal = snf ? parseFloat(snf) : undefined;
      if (isNaN(fatVal)) return;
      if (snf && snfVal !== undefined && isNaN(snfVal)) return;
      try {
        const result = await fatRateAPI.lookup(
          activeBranchCode,
          fatVal,
          animalType,
          parseFloat(liters),
          snfVal,
        );
        setRate(result.ratePerLiter.toString());
        setAmount(result.estimatedAmount?.toFixed(2) || "");
      } catch {
        setRate("");
        setAmount("");
      }
    };
    calc();
  }, [fat, snf, liters, animalType, activeBranchCode]);

  if (!activeBranchCode) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center text-gray-400">
        <p className="text-lg font-semibold">शाखा निवडा</p>
        <p className="text-sm mt-1">
          Please select a branch to record milk entries.
        </p>
      </div>
    );
  }

  const loadEntries = async () => {
    setLoadingEntries(true);
    try {
      const all = await milkEntryAPI.getByDate(activeBranchCode, date);
      setTodayEntries(all.filter((e) => e.session === session));
    } catch {
    } finally {
      setLoadingEntries(false);
    }
  };

  const lookupFarmer = async () => {
    if (!farmerNum || !activeBranchCode) return;
    setFarmerError("");
    setFarmerName("");
    setFat("");
    setSnf("");
    setRate("");
    setAmount("");
    try {
      const farmer = await farmerAPI.getByNumber(
        activeBranchCode,
        parseInt(farmerNum),
      );
      setFarmerName(farmer.name);
      if (farmer.animalType) {
        setFarmerAnimalType(farmer.animalType);
        if (farmer.animalType !== "BOTH") {
          setAnimalType(farmer.animalType);
        } else {
          setAnimalType("COW"); // default; farmer picks COW/BUFFALO below for this entry
        }
      }
      litersRef.current?.focus();
    } catch {
      setFarmerError("उत्पादक सापडला नाही");
    }
  };

  const handleSave = async () => {
    if (!activeBranchCode) {
      toast.error("कृपया प्रथम शाखा निवडा");
      return;
    }
    if (!farmerNum || !farmerName || !liters || !fat) {
      toast.error("कृपया सर्व माहिती भरा");
      return;
    }
    if (fatInvalid) {
      toast.error(
        animalType === "COW"
          ? "गाय फॅट 2.8–5.0 असावा"
          : "म्हैस फॅट 4.8–12.0 असावा",
      );
      return;
    }
    if (snfInvalid) {
      toast.error(
        animalType === "COW"
          ? "गाय SNF 8.0–9.5 असावा"
          : "म्हैस SNF 8.0–12.0 असावा",
      );
      return;
    }
    setSaving(true);
    try {
      await milkEntryAPI.create(activeBranchCode, {
        farmerNumber: parseInt(farmerNum),
        entryDate: date,
        session,
        animalType,
        liters: parseFloat(liters),
        fat: parseFloat(fat),
        snf: snf ? parseFloat(snf) : undefined,
      });
      const emoji = animalType === "COW" ? "🐄" : "🐃";
      toast.success(
        `✅ ${emoji} ${farmerName} - ${liters}L @ ₹${rate} = ₹${amount}`,
      );
      setFarmerNum("");
      setFarmerName("");
      setLiters("");
      setFat("");
      setSnf("");
      setRate("");
      setAmount("");
      setFarmerError("");
      document.getElementById("farmerInput")?.focus();
      loadEntries();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error saving entry");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!activeBranchCode) return;
    if (!window.confirm("Delete this entry?")) return;
    try {
      await milkEntryAPI.delete(activeBranchCode, id);
      toast.success("Deleted");
      loadEntries();
    } catch {
      toast.error("Delete failed");
    }
  };

  const totalLiters = todayEntries.reduce((s, e) => s + e.liters, 0);
  const totalAmount = todayEntries.reduce((s, e) => s + e.amount, 0);
  const cowEntries = todayEntries.filter((e) => e.animalType === "COW");
  const bufEntries = todayEntries.filter((e) => e.animalType === "BUFFALO");

  const fatInvalid =
    fat !== "" &&
    (() => {
      const f = parseFloat(fat);
      if (isNaN(f)) return true;
      if (animalType === "COW" && (f < 2.8 || f > 5.0)) return true;
      if (animalType === "BUFFALO" && (f < 4.8 || f > 12.0)) return true;
      return false;
    })();

  const snfInvalid =
    snf !== "" &&
    (() => {
      const s = parseFloat(snf);
      if (isNaN(s)) return true;
      if (animalType === "COW" && (s < 8.0 || s > 9.5)) return true;
      if (animalType === "BUFFALO" && (s < 8.5 || s > 12.0)) return true;
      return false;
    })();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-amber-100 p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <button
            onClick={() => setSession("MORNING")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition-all ${session === "MORNING" ? "bg-amber-400 text-green-900 shadow-md" : "bg-gray-100 text-gray-600"}`}
          >
            <Sun size={18} /> सकाळ
          </button>
          <button
            onClick={() => setSession("EVENING")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition-all ${session === "EVENING" ? "bg-indigo-500 text-white shadow-md" : "bg-gray-100 text-gray-600"}`}
          >
            <Moon size={18} /> संध्याकाळ
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-green-400 outline-none"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-amber-100 p-6">
        <h3 className="text-green-900 font-bold text-lg mb-4">
          {session === "MORNING" ? "🌅 सकाळ" : "🌙 संध्याकाळ"} नवीन नोंद
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              क्र. नंबर *
            </label>
            <input
              id="farmerInput"
              type="text"
              value={farmerNum}
              onChange={(e) => {
                setFarmerNum(e.target.value);
                setFarmerName("");
                setFarmerError("");
                setFarmerAnimalType("COW");
                setFat("");
                setSnf("");
                setRate("");
                setAmount("");
              }}
              onBlur={lookupFarmer}
              onKeyDown={(e) => e.key === "Enter" && lookupFarmer()}
              placeholder="1, 2, 3..."
              autoFocus
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg font-bold focus:ring-2 focus:ring-green-400 outline-none"
            />
            {farmerName && (
              <div className="mt-1">
                <p className="text-green-700 font-semibold text-sm">
                  ✅ {farmerName}
                </p>
                {farmerAnimalType === "BOTH" ? (
                  <div className="flex gap-1.5 mt-1">
                    {(["COW", "BUFFALO"] as AnimalType[]).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setAnimalType(type)}
                        className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border-2 transition-all ${
                          animalType === type
                            ? type === "COW"
                              ? "border-yellow-500 bg-yellow-50 text-yellow-800"
                              : "border-indigo-500 bg-indigo-50 text-indigo-800"
                            : "border-gray-200 bg-gray-50 text-gray-500"
                        }`}
                      >
                        {type === "COW" ? "🐄 गाय" : "🐃 म्हैस"}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold mt-0.5 ${animalType === "COW" ? "bg-yellow-100 text-yellow-800" : "bg-indigo-100 text-indigo-800"}`}
                  >
                    {animalType === "COW" ? "🐄 गाय" : "🐃 म्हैस"}
                  </span>
                )}
              </div>
            )}
            {farmerError && (
              <p className="mt-1 text-red-500 text-sm">❌ {farmerError}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              दूध (Liters) *
            </label>
            <input
              ref={litersRef}
              type="text"
              step="0.1"
              value={liters}
              onChange={(e) => setLiters(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fatRef.current?.focus()}
              placeholder="0.0"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg font-bold focus:ring-2 focus:ring-green-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              फॅट % *{" "}
              <span
                className={`font-normal ${animalType === "COW" ? "text-yellow-600" : "text-indigo-600"}`}
              >
                ({animalType === "COW" ? "2.8–5.0" : "4.8–12.0"})
              </span>
            </label>
            <input
              ref={fatRef}
              type="text"
              step="0.1"
              value={fat}
              onChange={(e) => setFat(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && snfRef.current?.focus()}
              placeholder={animalType === "COW" ? "3.5" : "6.0"}
              className={`w-full border-2 rounded-xl px-4 py-3 text-lg font-bold focus:ring-2 outline-none transition-all ${fatInvalid ? "border-red-400 bg-red-50 focus:ring-red-300" : "border-gray-200 focus:ring-green-400"}`}
            />
            {fatInvalid && (
              <p className="mt-1 text-red-500 text-xs">
                ⚠️{" "}
                {animalType === "COW"
                  ? "गाय फॅट 2.8–5.0 असावा"
                  : "म्हैस फॅट 4.8–12.0 असावा"}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              SNF %{" "}
              <span
                className={`font-normal ${animalType === "COW" ? "text-yellow-600" : "text-indigo-600"}`}
              >
                ({animalType === "COW" ? "8.0–9.5" : "9.0–12.0"}, ऐच्छिक)
              </span>
            </label>
            <input
              ref={snfRef}
              type="text"
              step="0.1"
              value={snf}
              onChange={(e) => setSnf(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveRef.current?.click()}
              placeholder={animalType === "COW" ? "8.5" : "9.5"}
              className={`w-full border-2 rounded-xl px-4 py-3 text-lg font-bold focus:ring-2 outline-none transition-all ${snfInvalid ? "border-red-400 bg-red-50 focus:ring-red-300" : "border-gray-200 focus:ring-green-400"}`}
            />
            {snfInvalid && (
              <p className="mt-1 text-red-500 text-xs">
                ⚠️{" "}
                {animalType === "COW"
                  ? "गाय SNF 8.0–9.5 असावा"
                  : "म्हैस SNF 9.0–12.0 असावा"}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              दर / रक्कम
            </label>
            {rate && amount ? (
              <div
                className={`rounded-xl p-3 border h-[52px] flex items-center justify-between ${animalType === "COW" ? "bg-yellow-50 border-yellow-200" : "bg-indigo-50 border-indigo-200"}`}
              >
                <span className="text-sm font-bold text-blue-700">
                  ₹{rate}/L
                </span>
                <span className="text-sm font-bold text-green-700">
                  = ₹{amount}
                </span>
              </div>
            ) : (
              <div className="rounded-xl p-3 border border-dashed border-gray-200 h-[52px] flex items-center justify-center text-xs text-gray-400">
                लिटर व फॅट भरा
              </div>
            )}
          </div>
        </div>
        <button
          ref={saveRef}
          onClick={handleSave}
          disabled={
            saving ||
            !activeBranchCode ||
            !farmerName ||
            !liters ||
            !fat ||
            !!fatInvalid ||
            !!snfInvalid
          }
          className={`mt-4 w-full flex items-center justify-center gap-2 font-bold py-3.5 rounded-xl transition-all text-white ${animalType === "COW" ? "bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-300" : "bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300"}`}
        >
          <Save size={18} />
          {saving
            ? "Saving..."
            : `जतन करा — ${animalType === "COW" ? "🐄 गाय" : "🐃 म्हैस"}`}
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-amber-100 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-green-900">
              {date} · {session === "MORNING" ? "🌅 सकाळ" : "🌙 संध्याकाळ"}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {cowEntries.length > 0 && `🐄 गाय: ${cowEntries.length}`}
              {cowEntries.length > 0 && bufEntries.length > 0 && "  "}
              {bufEntries.length > 0 && `🐃 म्हैस: ${bufEntries.length}`}
            </p>
          </div>
          <button
            onClick={loadEntries}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <RefreshCw
              size={16}
              className={loadingEntries ? "animate-spin" : ""}
            />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                <th className="px-4 py-3 text-left">क्र.</th>
                <th className="px-4 py-3 text-left">नाव</th>
                <th className="px-4 py-3 text-center">प्राणी</th>
                <th className="px-4 py-3 text-right">दूध (L)</th>
                <th className="px-4 py-3 text-right">फॅट</th>
                <th className="px-4 py-3 text-right">SNF</th>
                <th className="px-4 py-3 text-right">दर</th>
                <th className="px-4 py-3 text-right">रक्कम</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {todayEntries.map((entry) => (
                <tr
                  key={entry.id}
                  className={
                    entry.animalType === "BUFFALO"
                      ? "bg-indigo-50/20 hover:bg-indigo-50"
                      : "hover:bg-amber-50"
                  }
                >
                  <td className="px-4 py-3 font-bold text-green-800">
                    {entry.farmerNumber}
                  </td>
                  <td className="px-4 py-3 font-medium">{entry.farmerName}</td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${entry.animalType === "COW" ? "bg-yellow-100 text-yellow-800" : "bg-indigo-100 text-indigo-800"}`}
                    >
                      {entry.animalType === "COW" ? "🐄 गाय" : "🐃 म्हैस"}
                    </span>
                  </td>
                  {/* ✅ Liters: always show 1 decimal place e.g. 5.0 */}
                  <td className="px-4 py-3 text-right font-semibold">
                    {entry.liters.toFixed(1)}
                  </td>
                  {/* ✅ Fat: always show 1 decimal place e.g. 3.0 */}
                  <td className="px-4 py-3 text-right">
                    {Number(entry.fat).toFixed(1)}
                  </td>
                  {/* ✅ SNF: always show 1 decimal place e.g. 8.5 */}
                  <td className="px-4 py-3 text-right">
                    {entry.snf != null ? Number(entry.snf).toFixed(1) : "-"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    ₹{entry.ratePerLiter}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-green-700">
                    ₹{entry.amount.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="text-red-400 hover:text-red-600 p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {todayEntries.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-8 text-center text-gray-400"
                  >
                    कोणत्याही नोंदी नाहीत
                  </td>
                </tr>
              )}
            </tbody>
            {todayEntries.length > 0 && (
              <tfoot>
                {cowEntries.length > 0 && (
                  <tr className="bg-yellow-50 text-xs font-semibold">
                    <td colSpan={2} className="px-4 py-2 text-yellow-800">
                      🐄 गाय एकूण
                    </td>
                    <td></td>
                    {/* ✅ Footer liters: 1 decimal */}
                    <td className="px-4 py-2 text-right text-yellow-800">
                      {cowEntries.reduce((s, e) => s + e.liters, 0).toFixed(1)}{" "}
                      L
                    </td>
                    <td colSpan={3}></td>
                    <td className="px-4 py-2 text-right text-yellow-800">
                      ₹{cowEntries.reduce((s, e) => s + e.amount, 0).toFixed(2)}
                    </td>
                    <td></td>
                  </tr>
                )}
                {bufEntries.length > 0 && (
                  <tr className="bg-indigo-50 text-xs font-semibold">
                    <td colSpan={2} className="px-4 py-2 text-indigo-800">
                      🐃 म्हैस एकूण
                    </td>
                    <td></td>
                    {/* ✅ Footer liters: 1 decimal */}
                    <td className="px-4 py-2 text-right text-indigo-800">
                      {bufEntries.reduce((s, e) => s + e.liters, 0).toFixed(1)}{" "}
                      L
                    </td>
                    <td colSpan={3}></td>
                    <td className="px-4 py-2 text-right text-indigo-800">
                      ₹{bufEntries.reduce((s, e) => s + e.amount, 0).toFixed(2)}
                    </td>
                    <td></td>
                  </tr>
                )}
                <tr className="bg-green-50 font-bold border-t-2 border-green-200">
                  <td colSpan={2} className="px-4 py-3 text-green-800">
                    एकूण (Total)
                  </td>
                  <td></td>
                  {/* ✅ Grand total liters: 1 decimal */}
                  <td className="px-4 py-3 text-right text-green-800">
                    {totalLiters.toFixed(1)} L
                  </td>
                  <td colSpan={3}></td>
                  <td className="px-4 py-3 text-right text-green-800">
                    ₹{totalAmount.toFixed(2)}
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
