import { useState } from 'react';
import { Milk, Lock, User, Eye, EyeOff, ArrowRight } from 'lucide-react';

// NOTE: This is a simple client-side gate, not real authentication.
// The credentials below ship inside the JS bundle and can be read by
// anyone who opens dev tools, and the backend API itself still accepts
// requests without any login. Treat this as a "keep casual visitors out"
// screen only — for real protection, add auth on the backend.
const ADMIN_USERNAME = 'Shivshakti';
const ADMIN_PASSWORD = '6510';

const LIMITED_USERNAME = '7020271813';
const LIMITED_PASSWORD = 'Yash';

export type UserRole = 'admin' | 'limited';

interface LoginPageProps {
  onLogin: (role: UserRole) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    // Small delay so the button/loading state actually registers for the user
    setTimeout(() => {
      const enteredUsername = username.trim();

      if (enteredUsername === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        localStorage.setItem('dairy_auth', 'true');
        localStorage.setItem('dairy_role', 'admin');
        onLogin('admin');
      } else if (enteredUsername === LIMITED_USERNAME && password === LIMITED_PASSWORD) {
        localStorage.setItem('dairy_auth', 'true');
        localStorage.setItem('dairy_role', 'limited');
        onLogin('limited');
      } else {
        setError('चुकीचे युजरनेम किंवा पासवर्ड. कृपया पुन्हा प्रयत्न करा.');
      }
      setSubmitting(false);
    }, 300);
  };

  return (
    <div className="min-h-screen w-full flex bg-amber-50">

      {/* ── Brand panel — hidden on small screens ───────────────────────── */}
      <div
        className="hidden md:flex md:w-[44%] lg:w-[40%] relative flex-col justify-between
                   bg-gradient-to-br from-green-800 via-green-900 to-green-950
                   px-12 lg:px-16 py-14 overflow-hidden"
        style={{ clipPath: 'polygon(0 0, 100% 0, 84% 100%, 0 100%)' }}
      >
        {/* soft ambient glow */}
        <div className="pointer-events-none absolute -top-16 -right-10 w-80 h-80 rounded-full
                        bg-amber-400/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 w-64 h-64 rounded-full
                        bg-green-600/20 blur-3xl" />

        {/* wordmark */}
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-400 flex items-center justify-center shrink-0">
            <Milk size={20} className="text-green-900" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight tracking-wide">Dairy Manager</p>
            <p className="text-green-300 text-xs">दूध संकलन केंद्र</p>
          </div>
        </div>

        {/* headline */}
        <div className="relative">
          <h1 className="text-white text-3xl lg:text-4xl font-bold leading-snug max-w-xs">
            शिवशक्ती महिला सहकारी दूध संस्था
          </h1>
          <span className="block w-12 h-1 rounded-full bg-amber-400 mt-4 mb-4" />
          <p className="text-amber-200/90 text-lg font-medium">सावर्डे नं. 2</p>
          <p className="text-green-200/70 text-sm mt-3 max-w-[15rem] leading-relaxed">
            रोजचे दूध संकलन, अचूक हिशोब — एकाच ठिकाणी.
          </p>
        </div>

        {/* footer note */}
        <div className="relative">
          <div className="h-px w-full bg-white/10 mb-4" />
          <p className="text-white/40 text-xs tracking-wide">फक्त अधिकृत वापरासाठी</p>
        </div>
      </div>

      {/* ── Form panel ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-login-in">

          {/* compact brand header — mobile only */}
          <div className="flex items-center gap-3 mb-10 md:hidden">
            <div className="w-11 h-11 rounded-full bg-green-900 flex items-center justify-center shrink-0">
              <Milk size={22} className="text-amber-400" />
            </div>
            <div>
              <p className="font-bold text-green-900 text-sm leading-tight">शिवशक्ती महिला सह. दूध संस्था</p>
              <p className="text-gray-500 text-xs">सावर्डे नं. 2</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-green-900">पुन्हा स्वागत आहे</h2>
          <p className="text-sm text-gray-500 mt-1">सुरू ठेवण्यासाठी लॉगिन करा</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            <div>
              <label htmlFor="login-username" className="block text-xs font-medium text-gray-600 mb-1.5">
                युजरनेम
              </label>
              <div className="relative">
                <User size={16} className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  id="login-username"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoFocus
                  autoComplete="username"
                  placeholder="युजरनेम टाका"
                  className="w-full pl-6 pr-2 py-2 bg-transparent border-0 border-b-2 border-gray-300
                             text-green-950 placeholder:text-gray-400 outline-none
                             focus:border-green-800 transition-colors"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-medium text-gray-600 mb-1.5">
                पासवर्ड
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="पासवर्ड टाका"
                  className="w-full pl-6 pr-8 py-2 bg-transparent border-0 border-b-2 border-gray-300
                             text-green-950 placeholder:text-gray-400 outline-none
                             focus:border-green-800 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'पासवर्ड लपवा' : 'पासवर्ड दाखवा'}
                  className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 hover:text-green-800 transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-700 bg-red-50 border-l-4 border-red-400 rounded-r-md px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 bg-amber-400 hover:bg-amber-500
                         disabled:opacity-60 text-green-900 font-semibold py-3 rounded-lg shadow-sm
                         transition-colors"
            >
              {submitting ? 'तपासत आहे...' : (
                <>
                  लॉगिन करा
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-10">
            शिवशक्ती महिला सह. दूध संस्था, सावर्डे नं. 2
          </p>
        </div>
      </div>
    </div>
  );
}
