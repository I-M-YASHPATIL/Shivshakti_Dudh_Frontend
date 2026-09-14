import { useState, useEffect } from 'react';
import { Milk, Users, FileText, Settings, BarChart3, Menu, Building2, BookOpen, Wallet, LogOut } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import { BranchProvider, useBranch } from './pages/Branchcontext';
import BranchSelector from './pages/Branchselector ';
import DashboardPage from './pages/DashboardPage';
import MilkEntryPage from './pages/MilkEntryPage';
import FarmersPage from './pages/FarmersPage';
import BillsPage from './pages/BillsPage';
import FatRatesPage from './pages/FatRatesPage';
import BranchSetupPage from './pages/Branchsetuppage';
import FarmerYearlyReport from './pages/Farmeryearlyreport';
import LedgerPage from './pages/LedgerPage';
import LoginPage from './pages/LoginPage';

type Page = 'dashboard' | 'entry' | 'farmers' | 'bills' | 'yearly' | 'rates' | 'branches' | 'ledger';

const navItems = [
  { id: 'dashboard' as Page, label: 'Dashboard',      labelMr: 'डॅशबोर्ड',     icon: <BarChart3  size={20} /> },
  { id: 'entry'     as Page, label: 'Milk Entry',     labelMr: 'दूध नोंद',      icon: <Milk      size={20} /> },
  { id: 'farmers'   as Page, label: 'Productors',        labelMr: 'उत्पादक',        icon: <Users     size={20} /> },
  { id: 'bills'     as Page, label: 'Bills',          labelMr: 'बिले',           icon: <FileText  size={20} /> },
  { id: 'ledger'    as Page, label: 'Ledger',         labelMr: 'उचल/लागवड',    icon: <Wallet    size={20} /> },
  { id: 'yearly'    as Page, label: 'Yearly Report',  labelMr: 'वार्षिक अहवाल', icon: <BookOpen  size={20} /> },
  { id: 'rates'     as Page, label: 'Fat Rates',      labelMr: 'फॅट दर',        icon: <Settings  size={20} /> },
  { id: 'branches'  as Page, label: 'Branches',       labelMr: 'शाखा',           icon: <Building2 size={20} /> },
];

function AppInner({ onLogout }: { onLogout: () => void }) {
  const [page,        setPage]        = useState<Page>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { loading, branches } = useBranch();

  // Auto-redirect to Branch setup if no branches exist
  useEffect(() => {
    if (!loading && branches.length === 0) {
      setPage('branches');
    }
  }, [loading, branches.length]);

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <DashboardPage />;
      case 'entry':     return <MilkEntryPage />;
      case 'farmers':   return <FarmersPage />;
      case 'bills':     return <BillsPage />;
      case 'ledger':    return <LedgerPage />;
      case 'yearly':    return <FarmerYearlyReport />;
      case 'rates':     return <FatRatesPage />;
      case 'branches':  return <BranchSetupPage />;
    }
  };

  return (
    <div className="min-h-screen bg-amber-50 flex">
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-48
        bg-gradient-to-b from-green-800 to-green-900
        transform transition-transform duration-300
        md:translate-x-0 md:static md:flex-shrink-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-green-700">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-amber-400 flex items-center justify-center shrink-0">
                <Milk size={20} className="text-green-900" />
              </div>
              <div>
                <h1 className="text-white font-bold text-base leading-tight">Dairy Manager</h1>
                <p className="text-green-300 text-xs">दूध संकलन केंद्र</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => { setPage(item.id); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                  page === item.id
                    ? 'bg-amber-400 text-green-900 font-semibold shadow-md'
                    : 'text-green-100 hover:bg-green-700'
                }`}
              >
                {item.icon}
                <div>
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="text-xs opacity-70">{item.labelMr}</div>
                </div>
              </button>
            ))}
          </nav>

          <div className="p-3 border-t border-green-700 space-y-2">
            <button
              onClick={onLogout}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-green-100 hover:bg-green-700 text-sm font-medium transition-colors"
            >
              <LogOut size={16} />
              लॉगआऊट
            </button>
            <p className="text-green-400 text-xs text-center">शिवशक्ती महिला सह. दूध संस्था, सावर्डे नं. 2</p>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)} />
      )}

      <main className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-amber-200 px-4 py-3 flex items-center gap-3 shadow-sm">
          <button onClick={() => setSidebarOpen(true)}
            className="md:hidden p-2 rounded-lg hover:bg-amber-100">
            <Menu size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-green-900 text-lg leading-tight">
              {navItems.find(n => n.id === page)?.label}
            </h2>
            <p className="text-xs text-gray-500">
              {navItems.find(n => n.id === page)?.labelMr}
            </p>
          </div>

          <div className="shrink-0">
            {loading ? (
              <span className="text-xs text-gray-400">लोड होत आहे...</span>
            ) : branches.length === 0 ? (
              <button
                onClick={() => setPage('branches')}
                className="text-xs text-red-600 font-semibold bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-100"
              >
                ⚠️ शाखा तयार करा
              </button>
            ) : branches.length === 1 ? (
              <span className="text-xs font-bold text-green-700 bg-green-100 px-3 py-1.5 rounded-lg">
                🏢 {branches[0].name}
              </span>
            ) : (
              <BranchSelector />
            )}
          </div>
        </header>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <div className="text-4xl mb-3">🌾</div>
              <p className="font-semibold">लोड होत आहे...</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-4 md:p-6">
            {renderPage()}
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(() => localStorage.getItem('dairy_auth') === 'true');

  const handleLogout = () => {
    localStorage.removeItem('dairy_auth');
    setAuthed(false);
  };

  if (!authed) {
    return <LoginPage onLogin={() => setAuthed(true)} />;
  }

  return (
    <BranchProvider>
      <Toaster position="top-right" />
      <AppInner onLogout={handleLogout} />
    </BranchProvider>
  );
}