import React, { createContext, useContext, useState, useEffect } from 'react';
import { branchAPI } from '../services/api';
import type { Branch } from '../types/dairyTypes';

interface BranchContextType {
  branches:         Branch[];
  activeBranch:     Branch | null;
  activeBranchCode: string;
  setActiveBranch:  (branch: Branch) => void;
  loading:          boolean;
}

const BranchContext = createContext<BranchContextType>({
  branches:         [],
  activeBranch:     null,
  activeBranchCode: '',
  setActiveBranch:  () => {},
  loading:          true,
});

export function BranchProvider({ children }: { children: React.ReactNode }) {
  const [branches,     setBranches]     = useState<Branch[]>([]);
  const [activeBranch, setActiveBranch] = useState<Branch | null>(null);
  const [loading,      setLoading]      = useState(true);

  useEffect(() => {
    branchAPI.getAll()
      .then(list => {
        const all = list ?? [];
        setBranches(all);

        // Restore last-selected branch, or default to first
        const savedCode = localStorage.getItem('activeBranchCode');
        const found = (savedCode ? all.find(b => b.code === savedCode) : null)
                      ?? all[0]
                      ?? null;
        setActiveBranch(found);
      })
      .catch(err => {
        console.error('[BranchContext] failed to load branches:', err);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSetActiveBranch = (branch: Branch) => {
    setActiveBranch(branch);
    localStorage.setItem('activeBranchCode', branch.code);
  };

  return (
    <BranchContext.Provider value={{
      branches,
      activeBranch,
      activeBranchCode: activeBranch?.code ?? '',
      setActiveBranch:  handleSetActiveBranch,
      loading,
    }}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  return useContext(BranchContext);
}