import { useState, useMemo } from 'react';
import type { FC, FormEvent } from 'react';
import type { AuthUser, AuthModalView } from '../types/auth';
import { apiUrl, extractApiErrorMessage, parseJsonSafe } from '../lib/api';
import {
  X,
  Mail,
  Lock,
  User,
  Building2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Eye,
  EyeOff,
  Sparkles,
  KeyRound,
  RefreshCw,
} from 'lucide-react';

interface AuthModalProps {
  initialView?: AuthModalView;
  initialResetToken?: string;
  onClose: () => void;
  onLoginSuccess: (user: AuthUser) => void;
}

interface SampleIdentity {
  id: string;
  name: string;
  email: string;
  role: 'doctor' | 'patient';
  roleLabel: string;
  organization: string;
}

// Development-only sample identities for manual testing (strictly emails, zero passwords)
const DEV_SAMPLE_IDENTITIES: SampleIdentity[] = import.meta.env.DEV
  ? [
      {
        id: 'usr-dev-001',
        name: 'Dr. Elena Vance',
        email: 'elena.vance@novartis.com',
        role: 'doctor',
        roleLabel: 'Doctor / Clinical Investigator',
        organization: 'Novartis Oncology',
      },
      {
        id: 'usr-dev-002',
        name: 'John Miller',
        email: 'john.miller@patient.org',
        role: 'patient',
        roleLabel: 'Patient / Trial Volunteer',
        organization: 'Oncology Patient Cohort',
      },
    ]
  : [];

const KNOWN_ENTERPRISE_DOMAINS: Record<string, string> = {
  'novartis.com': 'Novartis Clinical Network',
  'roche.com': 'Roche Global Diagnostics',
  'pfizer.com': 'Pfizer Oncology',
  'astrazeneca.com': 'AstraZeneca R&D',
  'merck.com': 'Merck Research Labs',
  'mskcc.org': 'Memorial Sloan Kettering',
  'stanford.edu': 'Stanford Medicine',
  'harvard.edu': 'Harvard Medical School',
  'jhmi.edu': 'Johns Hopkins Medicine',
};

export const AuthModal: FC<AuthModalProps> = ({
  initialView = 'signin',
  initialResetToken = '',
  onClose,
  onLoginSuccess,
}) => {
  const [view, setView] = useState<AuthModalView>(initialResetToken ? 'forgot_password' : initialView);

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [organization, setOrganization] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);

  // Forgot Password Step State
  const [forgotStep, setForgotStep] = useState<1 | 2 | 3>(initialResetToken ? 2 : 1);
  const [resetCode, setResetCode] = useState(initialResetToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Status & Feedback
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // ── Email Domain Recognition ───────────────────────────────────────────────
  const detectedDomain = useMemo(() => {
    if (!email.includes('@')) return null;
    const domain = email.split('@')[1]?.toLowerCase().trim();
    if (!domain) return null;
    return KNOWN_ENTERPRISE_DOMAINS[domain] || (domain.endsWith('.edu') ? 'Verified Academic Medical Center' : null);
  }, [email]);

  // ── Password Strength Guardrail Engine ─────────────────────────────────────
  const passwordCriteria = useMemo(() => {
    const target = view === 'forgot_password' ? newPassword : password;
    return {
      length: target.length >= 8,
      uppercase: /[A-Z]/.test(target),
      lowercase: /[a-z]/.test(target),
      number: /[0-9]/.test(target),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(target),
    };
  }, [password, newPassword, view]);

  const passwordScore = useMemo(() => {
    const passed = Object.values(passwordCriteria).filter(Boolean).length;
    return passed; // 0 to 5
  }, [passwordCriteria]);

  const strengthLabel = useMemo(() => {
    if (passwordScore === 0) return { text: 'Empty', color: 'bg-charcoal-200 text-charcoal-500' };
    if (passwordScore <= 2) return { text: 'Weak', color: 'bg-red-500 text-white' };
    if (passwordScore === 3) return { text: 'Fair', color: 'bg-amber-500 text-white' };
    if (passwordScore === 4) return { text: 'Good', color: 'bg-sage-600 text-white' };
    return { text: 'Strong (Enterprise-Grade)', color: 'bg-sage-700 text-white' };
  }, [passwordScore]);

  // ── Sign In Handler ────────────────────────────────────────────────────────
  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    if (!email || !password) {
      setErrorMessage('Please enter both your work email and password.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMessage('Please provide a valid corporate or academic email address.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(apiUrl('/api/v1/auth/signin'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      const data = await parseJsonSafe(res);
      if (!res.ok) {
        setErrorMessage(extractApiErrorMessage(data, 'Authentication failed. Please verify credentials.'));
        setIsLoading(false);
        return;
      }

      const payload = data as { user?: AuthUser; token?: string } | null;
      if (!payload?.user || !payload?.token) {
        setErrorMessage('Received an unexpected authentication response from server.');
        setIsLoading(false);
        return;
      }
      setIsLoading(false);
      onLoginSuccess({
        ...payload.user,
        token: payload.token,
      });
    } catch {
      setIsLoading(false);
      setErrorMessage('Network connection error: Unable to reach ProtocolShield server. Please check your connection and try again.');
    }
  };

  // ── Sign Up Handler ────────────────────────────────────────────────────────
  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!fullName.trim()) {
      setErrorMessage('Full name is required.');
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMessage('Please provide a valid institutional email address.');
      return;
    }
    if (passwordScore < 3) {
      setErrorMessage('Password must satisfy at least 3 security requirements.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }
    if (!agreeTerms) {
      setErrorMessage('You must acknowledge the GCP / HIPAA protocol data access guidelines.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(apiUrl('/api/v1/auth/signup'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fullName.trim(),
          email: email.trim().toLowerCase(),
          password,
          // Note: role is intentionally omitted — the backend always assigns
          // the 'patient' role to public registrations. Doctor/admin accounts
          // require administrator provisioning.
          organization: organization || detectedDomain || 'Clinical Research Network',
        }),
      });

      const data = await parseJsonSafe(res);
      if (!res.ok) {
        setErrorMessage(extractApiErrorMessage(data, 'Registration failed. An account may already exist with this email.'));
        setIsLoading(false);
        return;
      }

      const payload = data as { user?: AuthUser; token?: string } | null;
      if (!payload?.user || !payload?.token) {
        setErrorMessage('Received an unexpected registration response from server.');
        setIsLoading(false);
        return;
      }
      setIsLoading(false);
      onLoginSuccess({
        ...payload.user,
        token: payload.token,
      });
    } catch {
      setIsLoading(false);
      setErrorMessage('Network error: Unable to complete account registration.');
    }
  };

  // ── Google OAuth Handler ───────────────────────────────────────────────────
  const handleGoogleSignIn = async () => {
    const googleClientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;
    if (!googleClientId) {
      setErrorMessage(
        'Google Sign-In is not activated yet. To activate: add GOOGLE_CLIENT_ID in your root .env and VITE_GOOGLE_CLIENT_ID in frontend/.env.'
      );
      return;
    }

    const google = (window as any).google;
    if (google?.accounts?.id) {
      google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response: { credential?: string }) => {
          if (!response?.credential) {
            setErrorMessage('Google did not return an identity token. Please try again.');
            return;
          }
          setIsLoading(true);
          setErrorMessage('');
          try {
            const res = await fetch(apiUrl('/api/v1/auth/google'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id_token: response.credential }),
            });

            const data = await parseJsonSafe(res);
            if (!res.ok) {
              setErrorMessage(extractApiErrorMessage(data, 'Google ID token verification failed on server.'));
              setIsLoading(false);
              return;
            }

            const payload = data as { user?: AuthUser; token?: string } | null;
            if (!payload?.user || !payload?.token) {
              setErrorMessage('Unexpected response during Google authentication.');
              setIsLoading(false);
              return;
            }
            setIsLoading(false);
            onLoginSuccess({
              ...payload.user,
              token: payload.token,
            });
          } catch {
            setIsLoading(false);
            setErrorMessage('Network error during Google authentication.');
          }
        },
      });

      google.accounts.id.prompt((notification: any) => {
        if (notification.isNotDisplayed()) {
          setErrorMessage('Google Sign-In prompt was suppressed by browser. Please ensure third-party sign-in is allowed.');
        }
      });
    } else {
      setErrorMessage('Google Identity Services SDK is still loading. Please check internet connection and try again.');
    }
  };

  // ── Development Sample Identity Selection ─────────────────────────────────
  const handleSelectDevIdentity = (identity: SampleIdentity) => {
    setEmail(identity.email);
    setPassword('');
    setErrorMessage('');
  };

  // ── Forgot Password Handlers ───────────────────────────────────────────────
  const handleSendResetCode = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMessage('Please enter a valid email to receive your password reset token.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(apiUrl('/api/v1/auth/forgot-password/request'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const rawData = await parseJsonSafe(res);
      setIsLoading(false);
      if (!res.ok) {
        setErrorMessage(extractApiErrorMessage(rawData, `Unable to initiate password recovery (HTTP ${res.status}).`));
        return;
      }

      const data = (rawData || {}) as { dev_reset_token?: string; message?: string };
      setForgotStep(2);
      if (data.dev_reset_token) {
        setResetCode(data.dev_reset_token);
        setSuccessMessage('Reset token generated in local development mode and pre-filled below.');
      } else {
        setSuccessMessage(data.message || 'If an account is registered with this email, password reset instructions have been issued.');
      }
    } catch {
      setIsLoading(false);
      setErrorMessage('Network error: Unable to initiate password recovery.');
    }
  };

  const handleVerifyAndResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    if (!resetCode.trim()) {
      setErrorMessage('Please provide the single-use reset token.');
      return;
    }
    if (passwordScore < 3) {
      setErrorMessage('The new password must satisfy minimum security requirements.');
      return;
    }
    if (newPassword.length > 72) {
      setErrorMessage('Password must not exceed 72 characters.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMessage('New passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(apiUrl('/api/v1/auth/forgot-password/reset'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: resetCode.trim(),
          new_password: newPassword,
        }),
      });

      const rawData = await parseJsonSafe(res);
      if (!res.ok) {
        setErrorMessage(extractApiErrorMessage(rawData, 'Password reset token is invalid or expired.'));
        setIsLoading(false);
        return;
      }

      setIsLoading(false);
      setForgotStep(3);
      setSuccessMessage('Password reset successfully! You can now sign in with your new password.');
    } catch {
      setIsLoading(false);
      setErrorMessage('Network error: Unable to reset password.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      {/* ── Background: Scientific Laboratory Image with Vignette ───────────── */}
      <div
        className="fixed inset-0 transition-opacity"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 50%, rgba(15, 23, 42, 0.78) 0%, rgba(2, 6, 23, 0.94) 100%), url("https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=2000&q=85")',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
        onClick={onClose}
      />

      {/* ── Centered Glassmorphic Modal Card ───────────────────────────────── */}
      <div
        className="relative z-10 w-full max-w-lg bg-white/95 backdrop-blur-xl border border-linen-300 rounded-3xl shadow-2xl overflow-hidden my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="bg-charcoal-950 px-6 py-4 text-white flex items-center justify-between border-b border-charcoal-800">
          <div className="flex items-center space-x-2.5">
            <div className="h-8 w-8 rounded-xl bg-terracotta-600/20 border border-terracotta-500/30 flex items-center justify-center">
              <ShieldCheck className="h-4 w-4 text-terracotta-400" />
            </div>
            <div>
              <span className="font-serif font-bold text-sm tracking-tight text-white block">
                ProtocolShield Access
              </span>
              <span className="text-[10px] font-mono text-charcoal-400">
                Institutional Clinical Feasibility Portal
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close authentication modal"
            className="p-1.5 rounded-full text-charcoal-400 hover:text-white hover:bg-charcoal-800 transition-colors"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-6 pt-4 pb-2 bg-linen-50 border-b border-linen-200 flex items-center justify-between text-xs">
          <div className="flex space-x-1 p-1 bg-linen-200/80 rounded-xl">
            <button
              onClick={() => {
                setView('signin');
                setErrorMessage('');
                setSuccessMessage('');
              }}
              className={`px-4 py-1.5 rounded-lg font-medium transition-all ${
                view === 'signin'
                  ? 'bg-white text-charcoal-900 shadow-xs'
                  : 'text-charcoal-600 hover:text-charcoal-900'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setView('signup');
                setErrorMessage('');
                setSuccessMessage('');
              }}
              className={`px-4 py-1.5 rounded-lg font-medium transition-all ${
                view === 'signup'
                  ? 'bg-white text-charcoal-900 shadow-xs'
                  : 'text-charcoal-600 hover:text-charcoal-900'
              }`}
            >
              Create Account
            </button>
          </div>

          {view !== 'forgot_password' && (
            <button
              onClick={() => {
                setView('forgot_password');
                setForgotStep(1);
                setErrorMessage('');
                setSuccessMessage('');
              }}
              className="text-[11px] text-terracotta-600 hover:underline font-mono"
            >
              Forgot password?
            </button>
          )}
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4">
          {/* Alerts */}
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-2.5 text-xs text-red-700 animate-in fade-in duration-200">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-red-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-sage-50 border border-sage-200 rounded-xl flex items-start space-x-2.5 text-xs text-sage-800 animate-in fade-in duration-200">
              <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0 text-sage-600" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              VIEW: SIGN IN
             ══════════════════════════════════════════════════════════════════ */}
          {view === 'signin' && (
            <form onSubmit={handleSignIn} className="space-y-4">
              {/* Google OAuth Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full flex items-center justify-center space-x-3 py-2.5 px-4 bg-white hover:bg-linen-100 text-charcoal-900 border border-linen-300 rounded-xl font-medium text-xs transition-colors shadow-2xs hover:shadow-xs group"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google Workspace</span>
              </button>

              <div className="flex items-center space-x-3">
                <div className="flex-1 h-px bg-linen-200" />
                <span className="text-[10px] font-mono text-charcoal-400 uppercase tracking-widest">
                  or enterprise email
                </span>
                <div className="flex-1 h-px bg-linen-200" />
              </div>

              {/* Email */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-charcoal-700 block">
                  Work Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-charcoal-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@organization.com"
                    className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-linen-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-terracotta-500/20 focus:border-terracotta-500 transition-all font-mono"
                    required
                  />
                </div>
                {detectedDomain && (
                  <p className="text-[10px] font-mono text-sage-700 flex items-center space-x-1 pt-0.5">
                    <CheckCircle2 className="h-3 w-3 text-sage-600 inline" />
                    <span>Domain Recognized: {detectedDomain}</span>
                  </p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-charcoal-700 block">
                    Password
                  </label>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-charcoal-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-9 pr-9 py-2 text-xs bg-white border border-linen-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-terracotta-500/20 focus:border-terracotta-500 transition-all font-mono"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-2.5 text-charcoal-400 hover:text-charcoal-700"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-charcoal-900 hover:bg-charcoal-800 text-white rounded-xl text-xs font-semibold flex items-center justify-center space-x-2 transition-colors shadow-sm disabled:opacity-50"
              >
                {isLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin text-terracotta-300" />
                ) : (
                  <>
                    <span>Authenticate Session</span>
                    <ArrowRight className="h-3.5 w-3.5 text-terracotta-300" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              VIEW: SIGN UP / REGISTER
             ══════════════════════════════════════════════════════════════════ */}
          {view === 'signup' && (
            <form onSubmit={handleSignUp} className="space-y-3">
              {/* Role Notice */}
              <div className="p-2.5 rounded-xl border border-linen-300 bg-linen-100/70 flex items-center justify-between">
                <div>
                  <span className="text-[11px] block font-semibold text-charcoal-900">Account Type: Patient / Trial Volunteer</span>
                  <span className="text-[10px] text-charcoal-500 block">Public registrations enroll as Patient accounts. Clinical Lead and Administrator roles require controlled provisioning.</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-sage-100 text-sage-800 border border-sage-300 font-semibold shrink-0 ml-2">
                  Patient Role
                </span>
              </div>

              {/* Full Name & Organization */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-charcoal-700 block">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-3.5 w-3.5 text-charcoal-400" />
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Dr. Jane Doe"
                      className="w-full pl-8 pr-2 py-1.5 text-xs bg-white border border-linen-300 rounded-xl focus:outline-none focus:border-terracotta-500"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-charcoal-700 block">
                    Organization
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-2.5 h-3.5 w-3.5 text-charcoal-400" />
                    <input
                      type="text"
                      value={organization}
                      onChange={(e) => setOrganization(e.target.value)}
                      placeholder="Sponsor or Hospital"
                      className="w-full pl-8 pr-2 py-1.5 text-xs bg-white border border-linen-300 rounded-xl focus:outline-none focus:border-terracotta-500"
                    />
                  </div>
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-charcoal-700 block">
                  Institutional Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-3.5 w-3.5 text-charcoal-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@organization.com"
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-linen-300 rounded-xl focus:outline-none focus:border-terracotta-500 font-mono"
                    required
                  />
                </div>
                {detectedDomain && (
                  <p className="text-[10px] font-mono text-sage-700">
                    ✓ Recognized Partner: {detectedDomain}
                  </p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-charcoal-700 block">
                  Create Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-3.5 w-3.5 text-charcoal-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 8 characters, numbers, uppercase"
                    className="w-full pl-8 pr-8 py-1.5 text-xs bg-white border border-linen-300 rounded-xl focus:outline-none focus:border-terracotta-500 font-mono"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2 text-charcoal-400 hover:text-charcoal-700"
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>

                {/* Password Strength Meter */}
                {password.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="text-charcoal-500">Security Guardrail:</span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${strengthLabel.color}`}>
                        {strengthLabel.text}
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1 h-1.5">
                      {[1, 2, 3, 4, 5].map((lvl) => (
                        <div
                          key={lvl}
                          className={`rounded-full transition-all duration-300 ${
                            passwordScore >= lvl
                              ? passwordScore <= 2
                                ? 'bg-red-400'
                                : passwordScore === 3
                                ? 'bg-amber-400'
                                : 'bg-sage-500'
                              : 'bg-linen-200'
                          }`}
                        />
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9px] font-mono text-charcoal-500 pt-0.5">
                      <span className={passwordCriteria.length ? 'text-sage-700 font-bold' : ''}>
                        {passwordCriteria.length ? '✓' : '•'} 8+ Characters
                      </span>
                      <span className={passwordCriteria.uppercase ? 'text-sage-700 font-bold' : ''}>
                        {passwordCriteria.uppercase ? '✓' : '•'} 1 Uppercase Letter
                      </span>
                      <span className={passwordCriteria.number ? 'text-sage-700 font-bold' : ''}>
                        {passwordCriteria.number ? '✓' : '•'} 1 Number
                      </span>
                      <span className={passwordCriteria.special ? 'text-sage-700 font-bold' : ''}>
                        {passwordCriteria.special ? '✓' : '•'} 1 Special Character
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-charcoal-700 block">
                  Confirm Password
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-2.5 h-3.5 w-3.5 text-charcoal-400" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-linen-300 rounded-xl focus:outline-none focus:border-terracotta-500 font-mono"
                    required
                  />
                </div>
              </div>

              {/* Compliance Acknowledgment */}
              <div className="pt-1">
                <label className="flex items-start space-x-2 cursor-pointer text-[10px] text-charcoal-600 leading-tight">
                  <input
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                    className="mt-0.5 rounded text-terracotta-600 focus:ring-terracotta-500"
                  />
                  <span>
                    I acknowledge that access is restricted to authorized GCP/ICH-compliant clinical study teams and verified investigators.
                  </span>
                </label>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-charcoal-900 hover:bg-charcoal-800 text-white rounded-xl text-xs font-semibold flex items-center justify-center space-x-2 transition-colors shadow-sm disabled:opacity-50 pt-2"
              >
                {isLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin text-terracotta-300" />
                ) : (
                  <>
                    <span>Create Enterprise Account</span>
                    <ArrowRight className="h-3.5 w-3.5 text-terracotta-300" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              VIEW: FORGOT PASSWORD WIZARD
             ══════════════════════════════════════════════════════════════════ */}
          {view === 'forgot_password' && (
            <div className="space-y-4">
              <div className="text-center space-y-1 pb-1">
                <h4 className="font-serif font-bold text-sm text-charcoal-900">
                  Password Recovery Gateway
                </h4>
                <p className="text-[11px] text-charcoal-500 font-mono">
                  Self-service reset with institutional security verification
                </p>
              </div>

              {/* Step 1: Send Code */}
              {forgotStep === 1 && (
                <form onSubmit={handleSendResetCode} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-charcoal-700 block">
                      Registered Email Address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-2.5 h-4 w-4 text-charcoal-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@organization.com"
                        className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-linen-300 rounded-xl focus:outline-none focus:border-terracotta-500 font-mono"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2.5 px-4 bg-charcoal-900 hover:bg-charcoal-800 text-white rounded-xl text-xs font-semibold flex items-center justify-center space-x-2 transition-colors"
                  >
                    {isLoading ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <span>Request Password Reset</span>
                        <ArrowRight className="h-3.5 w-3.5 text-terracotta-300" />
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* Step 2: Enter Code & New Password */}
              {forgotStep === 2 && (
                <form onSubmit={handleVerifyAndResetPassword} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-charcoal-700 block">
                      Single-Use Security Token
                    </label>
                    <input
                      type="text"
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      placeholder="Paste single-use verification token"
                      className="w-full px-3 py-2 text-center text-xs tracking-wider font-mono bg-linen-50 border border-linen-300 rounded-xl focus:outline-none focus:border-terracotta-500"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-charcoal-700 block">
                      New Enterprise Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-2.5 h-3.5 w-3.5 text-charcoal-400" />
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Min 8 chars, numbers, uppercase"
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-linen-300 rounded-xl focus:outline-none focus:border-terracotta-500 font-mono"
                        required
                      />
                    </div>

                    {/* Quick Strength Bar */}
                    {newPassword.length > 0 && (
                      <div className="grid grid-cols-5 gap-1 h-1 mt-1">
                        {[1, 2, 3, 4, 5].map((lvl) => (
                          <div
                            key={lvl}
                            className={`rounded-full ${
                              passwordScore >= lvl ? 'bg-sage-600' : 'bg-linen-200'
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-charcoal-700 block">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-2.5 h-3.5 w-3.5 text-charcoal-400" />
                      <input
                        type="password"
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        placeholder="Repeat new password"
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-linen-300 rounded-xl focus:outline-none focus:border-terracotta-500 font-mono"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2.5 px-4 bg-terracotta-600 hover:bg-terracotta-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center space-x-2 transition-colors shadow-sm"
                  >
                    {isLoading ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <span>Update Password & Authorize</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* Step 3: Success Confirmation */}
              {forgotStep === 3 && (
                <div className="text-center py-4 space-y-3">
                  <div className="h-12 w-12 rounded-full bg-sage-100 text-sage-600 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <p className="font-serif font-bold text-sm text-charcoal-900">
                    Password Reset Complete
                  </p>
                  <p className="text-xs text-charcoal-600">
                    Your credentials have been securely updated in accordance with 21 CFR Part 11 security protocols.
                  </p>
                  <button
                    onClick={() => {
                      setView('signin');
                      setForgotStep(1);
                      setSuccessMessage('');
                    }}
                    className="px-6 py-2 bg-charcoal-900 text-white text-xs font-semibold rounded-xl hover:bg-charcoal-800 transition-colors"
                  >
                    Proceed to Sign In
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              LOCAL DEVELOPMENT TESTING IDENTITIES (ZERO SECRETS / ZERO PASSWORDS)
             ══════════════════════════════════════════════════════════════════ */}
          {import.meta.env.DEV && DEV_SAMPLE_IDENTITIES.length > 0 && (
            <div className="pt-2 border-t border-linen-200 space-y-2">
              <div className="flex items-center space-x-1.5 text-[10px] font-mono text-charcoal-500 uppercase tracking-widest">
                <Sparkles className="h-3 w-3 text-terracotta-500" />
                <span>Local Dev Quick-Fill (Emails Only - Enter Password to Sign In)</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {DEV_SAMPLE_IDENTITIES.map((identity) => (
                  <button
                    key={identity.id}
                    type="button"
                    onClick={() => handleSelectDevIdentity(identity)}
                    className="p-2 bg-linen-50 hover:bg-linen-100 border border-linen-200 rounded-xl text-left transition-all hover:border-terracotta-300 group cursor-pointer"
                  >
                    <span className="text-xs font-semibold text-charcoal-900 block truncate group-hover:text-terracotta-600">
                      {identity.name}
                    </span>
                    <span className="text-[10px] text-charcoal-500 block truncate font-mono">
                      {identity.roleLabel}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono inline-block mt-1 font-semibold ${
                      identity.role === 'patient' ? 'bg-blue-100 text-blue-800' : 'bg-sage-100 text-sage-800'
                    }`}>
                      {identity.role === 'patient' ? 'Patient' : 'Doctor'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
