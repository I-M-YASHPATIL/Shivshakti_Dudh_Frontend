import { useBranch } from '../pages/Branchcontext';
import type { Branch } from '../types/dairyTypes';

export default function BranchSelector() {
  const { branches, activeBranch, setActiveBranch, loading } = useBranch();

  if (loading || branches.length <= 1) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-gray-400 font-semibold">शाखा:</span>
      {branches.map((b: Branch) => (
        <button
          key={b.code}
          onClick={() => setActiveBranch(b)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
            activeBranch?.code === b.code
              ? 'border-green-600 bg-green-700 text-white shadow'
              : 'border-gray-200 bg-white text-gray-600 hover:border-green-400'
          }`}
        >
          {b.name}
        </button>
      ))}
    </div>
  );
}