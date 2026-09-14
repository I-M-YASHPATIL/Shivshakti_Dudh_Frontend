import { useState, useEffect, useRef } from "react";
import { ledgerAPI, farmerAPI } from "../services/api";
import { useBranch } from "../pages/Branchcontext";
import type {
  LedgerResponse,
  LedgerEntryType,
  BillResponse,
  Farmer,
} from "../types/dairyTypes";
import toast from "react-hot-toast";
import {
  Search,
  Plus,
  Trash2,
  Wallet,
  TrendingUp,
  TrendingDown,
  Calendar,
  ChevronDown,
  User,
} from "lucide-react";
import { getDaysInMonth, getMonth, getYear, format, parseISO } from "date-fns";

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d?: string | null): string => {
  if (!d) return "-";
  try {
    return format(parseISO(d), "dd/MM/yyyy");
  } catch {
    return d;
  }
};

type Period = { label: string; fromDate: string; toDate: string };
type MilkTypeChoice = "COW" | "BUFFALO" | "BOTH";

function getMonthPeriods(year: number, month: number): Period[] {
  const days = getDaysInMonth(new Date(year, month));
  const pad = (x: number) => String(x).padStart(2, "0");
  const m = pad(month + 1);
  return [
    {
      label: `01/${m}/${year} ते 10/${m}/${year}`,
      fromDate: `${year}-${m}-01`,
      toDate: `${year}-${m}-10`,
    },
    {
      label: `11/${m}/${year} ते 20/${m}/${year}`,
      fromDate: `${year}-${m}-11`,
      toDate: `${year}-${m}-20`,
    },
    {
      label: `21/${m}/${year} ते ${pad(days)}/${m}/${year}`,
      fromDate: `${year}-${m}-21`,
      toDate: `${year}-${m}-${pad(days)}`,
    },
  ];
}

/**
 * निव्वळ रक्कम मोजतो — PDF बिलाप्रमाणेच.
 * API चा `netAmount` सादिलवार वगळतो, त्यामुळे तो वापरत नाही.
 * तसेच mixed bill (गाय + म्हैस) असल्यास प्रत्येक प्रकारासाठी स्वतंत्र ₹5 सादिलवार
 * वजा केला जातो (म्हणजे दोन्हीसाठी एकूण ₹10).
 */
function netAmountForMilkType(
  bill: BillResponse,
  choice: MilkTypeChoice,
): number {
  const SADILVAR_PER_TYPE = 5;
  const isMixed = bill.cowTotalAmount > 0 && bill.buffaloTotalAmount > 0;

  const getShare = (type: "COW" | "BUFFALO") => {
    if (bill.totalAmount <= 0) return 0;
    return type === "COW"
      ? bill.cowTotalAmount / bill.totalAmount
      : bill.buffaloTotalAmount / bill.totalAmount;
  };

  const calculateNet = (
    amount: number,
    share: number,
    sadilvarCount: number,
  ) => {
    const saving = (bill.savingDeduction || 0) * share;
    const advance = (bill.advanceDeduction || 0) * share;
    const other = (bill.otherDeductions || 0) * share;
    return (
      amount - saving - advance - other - SADILVAR_PER_TYPE * sadilvarCount
    );
  };

  if (choice === "BOTH") {
    // Mixed bill असेल तर दोन्ही प्रकारांसाठी 2 × ₹5 = ₹10 वजा होतो
    return calculateNet(bill.totalAmount, 1, isMixed ? 2 : 1);
  }

  if (choice === "COW") {
    return calculateNet(bill.cowTotalAmount, getShare("COW"), 1);
  }

  // BUFFALO
  return calculateNet(bill.buffaloTotalAmount, getShare("BUFFALO"), 1);
}

const MONTHS = [
  "जानेवारी",
  "फेब्रुवारी",
  "मार्च",
  "एप्रिल",
  "मे",
  "जून",
  "जुलै",
  "ऑगस्ट",
  "सप्टेंबर",
  "ऑक्टोबर",
  "नोव्हेंबर",
  "डिसेंबर",
];
const YEARS = [2024, 2025, 2026, 2027];

const typeLabel: Record<LedgerEntryType, string> = {
  UCHAL: "उचल",
  LAGAVAD: "लागवड",
  JAMA: "जमा",
};

const typeStyle: Record<LedgerEntryType, string> = {
  UCHAL: "bg-red-100 text-red-800",
  LAGAVAD: "bg-orange-100 text-orange-800",
  JAMA: "bg-green-100 text-green-800",
};

export default function LedgerPage() {
  const { activeBranchCode } = useBranch();

  const [searchNumber, setSearchNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [ledger, setLedger] = useState<LedgerResponse | null>(null);

  // ── Farmer dropdown (search-as-you-type) ──
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeBranchCode) {
      setFarmers([]);
      return;
    }
    farmerAPI
      .getAll(activeBranchCode)
      .then(setFarmers)
      .catch(() => setFarmers([]));
  }, [activeBranchCode]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filteredFarmers = (() => {
    const q = searchNumber.trim().toLowerCase();
    const activeOnly = farmers.filter((f) => f.isActive !== false);
    if (!q) return activeOnly.slice(0, 30);
    return activeOnly
      .filter(
        (f) =>
          String(f.farmerNumber).includes(q) ||
          f.name?.toLowerCase().includes(q),
      )
      .slice(0, 30);
  })();

  const handleSelectFarmer = (f: Farmer) => {
    setSearchNumber(String(f.farmerNumber));
    setShowDropdown(false);
    load(f.farmerNumber);
  };

  const [type, setType] = useState<LedgerEntryType>("UCHAL");
  const [amount, setAmount] = useState("");
  const [entryDate, setEntryDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // जमा-only: बिल कालावधी निवडा (वर्ष + महिना → 3 पैकी 1 बिल)
  const now = new Date();
  const [selYear, setSelYear] = useState(getYear(now));
  const [selMonth, setSelMonth] = useState(getMonth(now));
  const [selPeriod, setSelPeriod] = useState<number | null>(null);
  const [billInfo, setBillInfo] = useState<BillResponse | null>(null);
  const [billLoading, setBillLoading] = useState(false);
  // जमा-only: गाय / म्हैस / दोन्ही — कोणत्या दूध प्रकाराची रक्कम जमा करायची
  const [milkTypeForJama, setMilkTypeForJama] =
    useState<MilkTypeChoice>("BOTH");

  const periods = getMonthPeriods(selYear, selMonth);
  const activePeriod = selPeriod != null ? periods[selPeriod] : null;

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async (num?: number) => {
    const farmerNumber = num ?? parseInt(searchNumber);
    if (!activeBranchCode) {
      toast.error("कृपया प्रथम शाखा निवडा");
      return;
    }
    if (!farmerNumber) {
      toast.error("कृपया उत्पादक क्रमांक टाका");
      return;
    }
    setLoading(true);
    try {
      const data = await ledgerAPI.get(activeBranchCode, farmerNumber);
      setLedger(data);
    } catch (err: any) {
      setLedger(null);
      toast.error(err.response?.data?.message || "उत्पादक सापडला नाही");
    } finally {
      setLoading(false);
    }
  };

  const resetBillLookup = () => {
    setSelPeriod(null);
    setBillInfo(null);
    setMilkTypeForJama("BOTH");
  };

  const handleTypeChange = (t: LedgerEntryType) => {
    setType(t);
    if (t !== "JAMA") resetBillLookup();
  };

  const handleBillLookup = async (period: Period) => {
    if (!activeBranchCode || !ledger) return;
    setBillLoading(true);
    try {
      const bill = await ledgerAPI.lookupBill(
        activeBranchCode,
        ledger.farmerNumber,
        period.fromDate,
        period.toDate,
      );
      setBillInfo(bill);
      const rounded = Math.floor(netAmountForMilkType(bill, milkTypeForJama));
      setAmount(String(rounded));
      setEntryDate(period.toDate);
      toast.success(`बिल सापडले: ₹${rounded.toLocaleString("en-IN")}`);
    } catch (err: any) {
      setBillInfo(null);
      toast.error(
        err.response?.data?.message || "या कालावधीचे बिल सापडले नाही",
      );
    } finally {
      setBillLoading(false);
    }
  };

  const handlePeriodSelect = (i: number) => {
    setSelPeriod(i);
    setBillInfo(null);
    handleBillLookup(periods[i]);
  };

  const handleMilkTypeSelect = (choice: MilkTypeChoice) => {
    setMilkTypeForJama(choice);
    if (billInfo) {
      setAmount(String(Math.floor(netAmountForMilkType(billInfo, choice))));
    }
  };

  const handleAdd = async () => {
    if (!activeBranchCode || !ledger) return;
    const amt = Math.floor(parseFloat(amount));
    if (!amt || amt <= 0) {
      toast.error("रक्कम बरोबर टाका");
      return;
    }
    if (!entryDate) {
      toast.error("दिनांक टाका");
      return;
    }
    setSaving(true);
    try {
      const updated = await ledgerAPI.addEntry(
        activeBranchCode,
        ledger.farmerNumber,
        {
          type,
          amount: amt,
          entryDate,
          billFromDate:
            type === "JAMA" && activePeriod ? activePeriod.fromDate : undefined,
          billToDate:
            type === "JAMA" && activePeriod ? activePeriod.toDate : undefined,
          // Tag which section (गाय / म्हैस / दोन्ही) this जमा belongs to, so
          // the payment register can credit it to the right column instead
          // of splitting it proportionally.
          milkType: type === "JAMA" ? milkTypeForJama : undefined,
          note: note.trim() || undefined,
        },
      );
      setLedger(updated);
      setAmount("");
      setNote("");
      resetBillLookup();
      toast.success(`${typeLabel[type]} नोंदवली`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "नोंद करता आली नाही");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!activeBranchCode || !ledger || deleteId == null) return;
    setDeleting(true);
    try {
      const updated = await ledgerAPI.deleteEntry(
        activeBranchCode,
        ledger.farmerNumber,
        deleteId,
      );
      setLedger(updated);
      toast.success("नोंद हटवली");
      setDeleteId(null);
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
          Please select a branch to manage the ledger.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* ── Delete Confirmation Modal ── */}
      {deleteId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4 border border-red-100">
            <h3 className="font-bold text-gray-800 text-lg mb-2">
              नोंद हटवायची आहे का?
            </h3>
            <p className="text-xs text-gray-400 mb-5">
              ही नोंद हटवल्यावर बाकी पुन्हा मोजली जाईल.
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

      {/* ── Search ── */}
      <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-5">
        <h3 className="font-bold text-green-900 mb-3">उचल / लागवड खाते शोधा</h3>
        <div className="flex gap-2">
          <div className="relative flex-1" ref={dropdownRef}>
            <input
              type="text"
              placeholder="उत्पादक क्रमांक किंवा नाव टाका"
              value={searchNumber}
              onChange={(e) => {
                setSearchNumber(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              className="w-full border border-gray-200 rounded-xl pl-4 pr-9 py-2.5 focus:ring-2 focus:ring-green-400 outline-none"
            />
            <ChevronDown
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />

            {showDropdown && (
              <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg">
                {filteredFarmers.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-400">
                    उत्पादक सापडला नाही
                  </div>
                ) : (
                  filteredFarmers.map((f) => (
                    <button
                      key={f.farmerNumber}
                      type="button"
                      onClick={() => handleSelectFarmer(f)}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-green-50 border-b border-gray-50 last:border-0"
                    >
                      <User size={14} className="text-gray-400 shrink-0" />
                      <span className="font-semibold text-green-900">
                        #{f.farmerNumber}
                      </span>
                      <span className="text-gray-700 truncate">{f.name}</span>
                      <span
                        className={`ml-auto shrink-0 text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                          f.animalType === "COW"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-indigo-100 text-indigo-800"
                        }`}
                      >
                        {f.animalType === "COW" ? "🐄" : "🐃"}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => load()}
            disabled={loading}
            className="flex items-center gap-2 bg-green-700 hover:bg-green-800 disabled:bg-gray-300 text-white px-5 py-2.5 rounded-xl font-semibold"
          >
            <Search size={16} /> {loading ? "शोधत आहे..." : "शोधा"}
          </button>
        </div>
      </div>

      {ledger && (
        <>
          {/* ── Farmer Info + Balance ── */}
          <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs text-gray-500">उत्पादक</p>
              <p className="font-bold text-green-900 text-lg">
                #{ledger.farmerNumber} — {ledger.farmerName}
              </p>
              <span
                className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                  ledger.animalType === "COW"
                    ? "bg-yellow-100 text-yellow-800"
                    : "bg-indigo-100 text-indigo-800"
                }`}
              >
                {ledger.animalType === "COW" ? "🐄 गाय" : "🐃 म्हैस"}
              </span>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 flex items-center justify-end gap-1">
                <Wallet size={14} /> सध्याची बाकी
              </p>
              <p
                className={`font-bold text-2xl ${ledger.currentBalance > 0 ? "text-red-600" : "text-green-700"}`}
              >
                ₹{ledger.currentBalance.toLocaleString("en-IN")}
              </p>
            </div>
          </div>

          {/* ── Add Entry Form ── */}
          <div className="bg-white rounded-2xl border border-green-200 shadow-sm p-6">
            <h3 className="font-bold text-green-900 mb-4">नवीन नोंद</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  प्रकार *
                </label>
                <div className="flex gap-2">
                  {(["UCHAL", "LAGAVAD", "JAMA"] as LedgerEntryType[]).map(
                    (t) => (
                      <button
                        key={t}
                        onClick={() => handleTypeChange(t)}
                        className={`flex-1 py-2.5 rounded-xl font-semibold text-sm border-2 transition-all ${
                          type === t
                            ? t === "JAMA"
                              ? "border-green-500 bg-green-50 text-green-800 shadow-sm"
                              : "border-red-400 bg-red-50 text-red-800 shadow-sm"
                            : "border-gray-200 bg-gray-50 text-gray-500"
                        }`}
                      >
                        {typeLabel[t]}
                      </button>
                    ),
                  )}
                </div>
              </div>

              {/* ── जमा: बिल कालावधी निवडा ── */}
              {type === "JAMA" && (
                <div className="md:col-span-2 bg-green-50 border border-green-200 rounded-xl p-4">
                  <label className="flex items-center gap-2 text-xs font-semibold text-green-800 mb-2">
                    <Calendar size={14} /> बिल कालावधी निवडा — रक्कम आपोआप दिसेल
                  </label>

                  <div className="flex flex-wrap gap-2 mb-3">
                    <select
                      value={selYear}
                      onChange={(e) => {
                        setSelYear(+e.target.value);
                        resetBillLookup();
                      }}
                      className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold bg-white focus:ring-2 focus:ring-green-400 outline-none"
                    >
                      {YEARS.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                    <select
                      value={selMonth}
                      onChange={(e) => {
                        setSelMonth(+e.target.value);
                        resetBillLookup();
                      }}
                      className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold bg-white focus:ring-2 focus:ring-green-400 outline-none"
                    >
                      {MONTHS.map((m, i) => (
                        <option key={i} value={i}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
                    {periods.map((p, i) => (
                      <button
                        key={i}
                        onClick={() => handlePeriodSelect(i)}
                        disabled={billLoading}
                        className={`rounded-xl border-2 px-3 py-2.5 text-sm font-semibold text-left transition-all ${
                          selPeriod === i
                            ? "border-green-600 bg-green-700 text-white shadow-md"
                            : "border-gray-200 bg-white text-gray-700 hover:border-green-300 hover:bg-green-50"
                        }`}
                      >
                        <div className="text-xs opacity-70 mb-0.5">
                          बिल {i + 1}
                        </div>
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {/* ── दूध प्रकार: गाय / म्हैस / दोन्ही ── */}
                  <label className="block text-xs font-semibold text-green-800 mb-1.5">
                    दूध प्रकार निवडा
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => handleMilkTypeSelect("COW")}
                      className={`rounded-xl border-2 px-3 py-2 text-sm font-semibold transition-all ${
                        milkTypeForJama === "COW"
                          ? "border-yellow-500 bg-yellow-100 text-yellow-800 shadow-sm"
                          : "border-gray-200 bg-white text-gray-600 hover:border-yellow-300"
                      }`}
                    >
                      🐄 गाय
                    </button>
                    <button
                      onClick={() => handleMilkTypeSelect("BUFFALO")}
                      className={`rounded-xl border-2 px-3 py-2 text-sm font-semibold transition-all ${
                        milkTypeForJama === "BUFFALO"
                          ? "border-indigo-500 bg-indigo-100 text-indigo-800 shadow-sm"
                          : "border-gray-200 bg-white text-gray-600 hover:border-indigo-300"
                      }`}
                    >
                      🐃 म्हैस
                    </button>
                    <button
                      onClick={() => handleMilkTypeSelect("BOTH")}
                      className={`rounded-xl border-2 px-3 py-2 text-sm font-semibold transition-all ${
                        milkTypeForJama === "BOTH"
                          ? "border-green-600 bg-green-100 text-green-800 shadow-sm"
                          : "border-gray-200 bg-white text-gray-600 hover:border-green-300"
                      }`}
                    >
                      🐄🐃 दोन्ही
                    </button>
                  </div>

                  {billLoading && (
                    <p className="text-xs text-gray-500 mt-3">
                      बिल शोधत आहे...
                    </p>
                  )}
                  {billInfo && (
                    <div className="mt-3 text-sm bg-white rounded-xl border border-green-100 p-3 space-y-1.5">
                      <div className="flex flex-wrap gap-x-6 gap-y-1">
                        <span>
                          दूध: <b>{billInfo.totalLiters} लि.</b>
                        </span>
                        <span>
                          एकूण रक्कम:{" "}
                          <b>₹{billInfo.totalAmount.toLocaleString("en-IN")}</b>
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
                        <span>
                          🐄 गाय निव्वळ: ₹
                          {Math.floor(
                            netAmountForMilkType(billInfo, "COW"),
                          ).toLocaleString("en-IN")}
                        </span>
                        <span>
                          🐃 म्हैस निव्वळ: ₹
                          {Math.floor(
                            netAmountForMilkType(billInfo, "BUFFALO"),
                          ).toLocaleString("en-IN")}
                        </span>
                      </div>
                      <div className="text-green-700 pt-1 border-t border-green-50">
                        निव्वळ (जमा
                        {milkTypeForJama === "COW"
                          ? " — गाय"
                          : milkTypeForJama === "BUFFALO"
                            ? " — म्हैस"
                            : " — दोन्ही"}
                        ):{" "}
                        <b>
                          ₹
                          {Math.floor(
                            netAmountForMilkType(billInfo, milkTypeForJama),
                          ).toLocaleString("en-IN")}
                        </b>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  रक्कम (₹) *
                </label>
                <input
                  type="number"
                  step="1"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-green-400 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  दिनांक *
                </label>
                <input
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-green-400 outline-none"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  टीप (ऐच्छिक)
                </label>
                <input
                  type="text"
                  placeholder="टीप..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-green-400 outline-none"
                />
              </div>
            </div>
            <button
              onClick={handleAdd}
              disabled={saving}
              className="mt-5 flex items-center gap-2 bg-green-700 hover:bg-green-800 disabled:bg-gray-300 text-white px-5 py-2.5 rounded-xl font-semibold"
            >
              <Plus size={16} /> {saving ? "जतन होत आहे..." : "नोंद करा"}
            </button>
          </div>

          {/* ── History Table ── */}
          <div className="bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-green-800 text-green-100 text-xs uppercase">
                  <th className="px-4 py-3 text-left">दिनांक</th>
                  <th className="px-4 py-3 text-center">प्रकार</th>
                  <th className="px-4 py-3 text-right">रक्कम</th>
                  <th className="px-4 py-3 text-right">बाकी</th>
                  <th className="px-4 py-3 text-left">टीप</th>
                  <th className="px-4 py-3 text-center">क्रिया</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {ledger.entries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-gray-400"
                    >
                      अजून कोणतीही नोंद नाही
                    </td>
                  </tr>
                ) : (
                  [...ledger.entries].reverse().map((e) => (
                    <tr key={e.id} className="hover:bg-amber-50">
                      <td className="px-4 py-3">{fmtDate(e.entryDate)}</td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${typeStyle[e.type]}`}
                        >
                          {e.type === "JAMA" ? (
                            <TrendingDown size={12} />
                          ) : (
                            <TrendingUp size={12} />
                          )}
                          {typeLabel[e.type]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        ₹{e.amount.toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-green-900">
                        ₹{e.balanceAfter.toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {e.note || "-"}
                        {e.billFromDate && e.billToDate && (
                          <div className="text-[11px] text-green-700 mt-0.5">
                            बिल: {fmtDate(e.billFromDate)} →{" "}
                            {fmtDate(e.billToDate)}
                            {e.type === "JAMA" && e.milkType && (
                              <span className="ml-1 text-amber-700">
                                (
                                {e.milkType === "COW"
                                  ? "गाय"
                                  : e.milkType === "BUFFALO"
                                    ? "म्हैस"
                                    : "दोन्ही"}
                                )
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setDeleteId(e.id)}
                          className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
