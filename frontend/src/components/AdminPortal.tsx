import { useMemo, useState } from 'react';
import type { FC } from 'react';
import type { AuthUser } from '../types/auth';
import type {
  AuditEvent,
  AuditVerificationStatus,
  ManagedUserAccount,
  PatientInterestSummary,
  PatientScreeningRecord,
} from '../types/audit';
import { UserMenu } from './UserMenu';
import { AuditTrailView } from './AuditTrailView';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FlaskConical,
  RefreshCw,
  Search,
  Server,
  Shield,
  ShieldCheck,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';

export interface ReadinessResponse {
  status: string;
  service: string;
  checks: {
    database: string;
    cohort_initialized: boolean;
    persistent_storage: boolean;
  };
}

export interface CohortStatsResponse {
  is_synthetic_data: boolean;
  data_disclaimer: string;
  total_patients: number;
  stages: Array<{ stage: string; count: number }>;
  ecog_scores: Array<{ ecog: number; count: number }>;
  rurality: Array<{ type: string; count: number }>;
  averages: {
    age: number | null;
    egfr: number | null;
    distance_miles: number | null;
    anc: number | null;
  };
}

export type AdminTab = 'overview' | 'users' | 'clinical_queue' | 'audit';

interface AdminPortalProps {
  user: AuthUser;
  auditEvents: AuditEvent[];
  auditLoading?: boolean;
  auditError?: string | null;
  auditVerification: AuditVerificationStatus | null;
  patientScreenings: PatientScreeningRecord[];
  verifyingScreeningId?: string | null;
  screeningVerifyError?: string | null;
  onVerifyScreening: (screeningId: string) => Promise<void> | void;
  patientInterests: PatientInterestSummary[];
  adminUsers: ManagedUserAccount[];
  promotingUserId?: string | null;
  userPromoteError?: string | null;
  onPromoteUser: (userId: string, targetRole: 'doctor' | 'admin') => Promise<void> | void;
  readiness: ReadinessResponse | null;
  cohortStats: CohortStatsResponse | null;
  opsLoading?: boolean;
  opsError?: string | null;
  onRefreshAll: () => Promise<void> | void;
  onSeedCohort: (forceRegenerate?: boolean, confirmationPhrase?: string) => Promise<string | null>;
  onOpenStudioView: () => void;
  onBackToLanding: () => void;
  onOpenAuth: () => void;
  onSignOut: () => void;
  onSwitchPersona: () => void;
}

export const AdminPortal: FC<AdminPortalProps> = ({
  user,
  auditEvents,
  auditLoading = false,
  auditError = null,
  auditVerification,
  patientScreenings,
  verifyingScreeningId = null,
  screeningVerifyError = null,
  onVerifyScreening,
  patientInterests,
  adminUsers,
  promotingUserId = null,
  userPromoteError = null,
  onPromoteUser,
  readiness,
  cohortStats,
  opsLoading = false,
  opsError = null,
  onRefreshAll,
  onSeedCohort,
  onOpenStudioView,
  onBackToLanding,
  onOpenAuth,
  onSignOut,
  onSwitchPersona,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'patient' | 'doctor' | 'admin'>('all');
  const [seedingBusy, setSeedingBusy] = useState(false);
  const [seedFeedback, setSeedFeedback] = useState<string | null>(null);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [regeneratePhrase, setRegeneratePhrase] = useState('');

  const roleCounts = useMemo(() => {
    const counts = { patient: 0, doctor: 0, admin: 0 };
    for (const acc of adminUsers) {
      const r = String(acc.role || 'patient').toLowerCase().trim();
      if (r === 'admin') counts.admin += 1;
      else if (r === 'doctor') counts.doctor += 1;
      else counts.patient += 1;
    }
    return counts;
  }, [adminUsers]);

  const pendingScreeningsCount = useMemo(
    () => patientScreenings.filter((s) => !s.investigator_verified && !s.is_synthetic_data).length,
    [patientScreenings]
  );

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return adminUsers.filter((acc) => {
      const accRole = String(acc.role || 'patient').toLowerCase().trim();
      if (roleFilter !== 'all' && accRole !== roleFilter) return false;
      if (!q) return true;
      return (
        acc.name.toLowerCase().includes(q) ||
        acc.email.toLowerCase().includes(q) ||
        (acc.organization || '').toLowerCase().includes(q)
      );
    });
  }, [adminUsers, userSearch, roleFilter]);

  const handleSeedClick = async (force: boolean) => {
    setSeedingBusy(true);
    setSeedFeedback(null);
    try {
      const msg = await onSeedCohort(force, force ? regeneratePhrase.trim() : undefined);
      setSeedFeedback(msg || (force ? 'Cohort regeneration completed.' : 'Cohort verification completed.'));
      if (force) {
        setShowRegenerateConfirm(false);
        setRegeneratePhrase('');
      }
    } finally {
      setSeedingBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-linen-100 text-charcoal-900 flex flex-col">
      {/* ── Dedicated Slim Admin Header ───────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-linen-50/95 backdrop-blur-md border-b border-linen-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBackToLanding}
              className="p-1.5 text-charcoal-500 hover:text-charcoal-900 hover:bg-linen-200 rounded-lg transition-colors cursor-pointer shrink-0"
              title="Back to Landing Overview"
              aria-label="Back to Landing Overview"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-7 w-7 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center shrink-0">
                <ShieldCheck className="h-4 w-4 text-amber-800" />
              </div>
              <div className="min-w-0">
                <span className="font-serif font-bold text-sm sm:text-base tracking-tight text-charcoal-900 whitespace-nowrap block">
                  ProtocolShield Admin Console
                </span>
              </div>
              <span className="hidden lg:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap shrink-0">
                System Governance
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void onRefreshAll()}
              disabled={opsLoading || auditLoading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white hover:bg-linen-100 border border-linen-300 text-xs font-medium text-charcoal-700 cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${opsLoading || auditLoading ? 'animate-spin' : ''}`} />
              <span className="hidden lg:inline">Refresh Live Data</span>
              <span className="lg:hidden hidden sm:inline">Refresh</span>
            </button>

            <button
              type="button"
              onClick={onOpenStudioView}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-charcoal-900 hover:bg-charcoal-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <FlaskConical className="h-3.5 w-3.5 text-terracotta-300" />
              <span className="hidden sm:inline">Doctor Studio</span>
              <span className="sm:hidden">Studio</span>
            </button>

            <UserMenu
              user={user}
              onOpenAuth={onOpenAuth}
              onSignOut={onSignOut}
              onSwitchPersona={onSwitchPersona}
            />
          </div>
        </div>

        {/* ── Sub-Navigation Ribbon ───────────────────────────────────────── */}
        <div className="border-t border-linen-200 bg-white/80">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-1 overflow-x-auto no-scrollbar">
            {(
              [
                { id: 'overview', label: 'System & Cohort Ops', icon: Server },
                { id: 'users', label: `User Governance (${adminUsers.length})`, icon: Users },
                {
                  id: 'clinical_queue',
                  label: `Clinical Queue (${pendingScreeningsCount} pending)`,
                  icon: ClipboardCheck,
                },
                { id: 'audit', label: `21 CFR Part 11 Ledger (${auditEvents.length})`, icon: Shield },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'border-amber-600 text-amber-900 font-semibold'
                      : 'border-transparent text-charcoal-500 hover:text-charcoal-800 hover:bg-linen-100/60'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* ── Main Content ──────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {opsError && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-800">
            <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
            <span>{opsError}</span>
          </div>
        )}

        {/* ── Tab 1: System Readiness & Live DuckDB Cohort Ops ────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Live KPI Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-linen-300 rounded-2xl p-4 shadow-2xs">
                <span className="text-[11px] font-mono uppercase tracking-wider text-charcoal-500 block">
                  System Readiness
                </span>
                <div className="mt-2 flex items-center gap-2">
                  {readiness?.status === 'ready' ? (
                    <CheckCircle2 className="h-5 w-5 text-sage-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                  )}
                  <span className="font-serif text-xl font-bold text-charcoal-900">
                    {readiness ? (readiness.status === 'ready' ? 'Operational' : 'Not Ready') : '—'}
                  </span>
                </div>
                <p className="text-[11px] font-mono text-charcoal-500 mt-1">
                  DuckDB: {readiness?.checks?.database ?? 'checking'} • Persistent:{' '}
                  {readiness ? (readiness.checks.persistent_storage ? 'Yes' : 'In-Memory') : '—'}
                </p>
              </div>

              <div className="bg-white border border-linen-300 rounded-2xl p-4 shadow-2xs">
                <span className="text-[11px] font-mono uppercase tracking-wider text-charcoal-500 block">
                  DuckDB Cohort Records
                </span>
                <p className="mt-2 font-serif text-xl font-bold text-charcoal-900">
                  {cohortStats ? cohortStats.total_patients.toLocaleString() : '—'}
                </p>
                <p className="text-[11px] font-mono text-charcoal-500 mt-1">
                  {cohortStats
                    ? `${cohortStats.stages.length} disease stages indexed`
                    : 'Awaiting live cohort telemetry'}
                </p>
              </div>

              <div className="bg-white border border-linen-300 rounded-2xl p-4 shadow-2xs">
                <span className="text-[11px] font-mono uppercase tracking-wider text-charcoal-500 block">
                  Accounts & Verification
                </span>
                <p className="mt-2 font-serif text-xl font-bold text-charcoal-900">
                  {adminUsers.length} Users
                </p>
                <p className="text-[11px] font-mono text-charcoal-500 mt-1">
                  {roleCounts.admin} admin • {roleCounts.doctor} doctor • {roleCounts.patient} patient
                </p>
              </div>

              <div className="bg-white border border-linen-300 rounded-2xl p-4 shadow-2xs">
                <span className="text-[11px] font-mono uppercase tracking-wider text-charcoal-500 block">
                  21 CFR Part 11 Chain
                </span>
                <div className="mt-2 flex items-center gap-2">
                  {auditVerification?.valid ? (
                    <ShieldCheck className="h-5 w-5 text-sage-600 shrink-0" />
                  ) : auditVerification ? (
                    <XCircle className="h-5 w-5 text-red-600 shrink-0" />
                  ) : (
                    <Activity className="h-5 w-5 text-charcoal-400 shrink-0" />
                  )}
                  <span className="font-serif text-xl font-bold text-charcoal-900">
                    {auditVerification
                      ? auditVerification.valid
                        ? 'SHA-256 Valid'
                        : 'Integrity Alert'
                      : '—'}
                  </span>
                </div>
                <p className="text-[11px] font-mono text-charcoal-500 mt-1 line-clamp-2" title={auditVerification?.details || ''}>
                  {auditVerification
                    ? auditVerification.valid
                      ? `${auditVerification.total_records_verified} cryptographically linked events`
                      : auditVerification.details || `${auditVerification.total_records_verified} verified before mismatch`
                    : 'Verification unavailable'}
                </p>
              </div>
            </div>

            {cohortStats?.data_disclaimer && (
              <div className="px-4 py-3 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
                <Database className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
                <span>{cohortStats.data_disclaimer}</span>
              </div>
            )}

            {/* Cohort Composition + Safe Seed Operations */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 bg-white border border-linen-300 rounded-2xl p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="font-serif text-base font-bold text-charcoal-900">
                      Live Cohort Composition (DuckDB)
                    </h2>
                    <p className="text-xs text-charcoal-500">
                      Aggregated directly from DuckDB `patients` table without mock placeholders
                    </p>
                  </div>
                </div>

                {cohortStats ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 rounded-xl bg-linen-50 border border-linen-200">
                        <span className="text-[10px] font-mono text-charcoal-500 block">Avg Age</span>
                        <span className="font-mono font-bold text-sm text-charcoal-900">
                          {cohortStats.averages.age ?? '—'} yrs
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-linen-50 border border-linen-200">
                        <span className="text-[10px] font-mono text-charcoal-500 block">Avg eGFR</span>
                        <span className="font-mono font-bold text-sm text-charcoal-900">
                          {cohortStats.averages.egfr ?? '—'} mL/min
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-linen-50 border border-linen-200">
                        <span className="text-[10px] font-mono text-charcoal-500 block">Avg Distance</span>
                        <span className="font-mono font-bold text-sm text-charcoal-900">
                          {cohortStats.averages.distance_miles ?? '—'} mi
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-linen-50 border border-linen-200">
                        <span className="text-[10px] font-mono text-charcoal-500 block">Avg ANC</span>
                        <span className="font-mono font-bold text-sm text-charcoal-900">
                          {cohortStats.averages.anc ?? '—'} /uL
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-charcoal-500 block">
                        Stage Distribution
                      </span>
                      {cohortStats.stages.map((item) => {
                        const pct =
                          cohortStats.total_patients > 0
                            ? Math.round((item.count / cohortStats.total_patients) * 100)
                            : 0;
                        return (
                          <div key={item.stage} className="space-y-1">
                            <div className="flex justify-between text-xs font-mono">
                              <span className="text-charcoal-800">{item.stage}</span>
                              <span className="text-charcoal-500">
                                {item.count.toLocaleString()} ({pct}%)
                              </span>
                            </div>
                            <div className="h-2 bg-linen-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-sage-600 rounded-full"
                                style={{ width: `${Math.max(2, pct)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                      <div className="p-3 rounded-xl bg-linen-50 border border-linen-200 space-y-1.5">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-charcoal-500 block">
                          ECOG Breakdown
                        </span>
                        {cohortStats.ecog_scores.map((e) => (
                          <div key={e.ecog} className="flex justify-between text-xs font-mono">
                            <span>ECOG {e.ecog}</span>
                            <span className="text-charcoal-600">{e.count.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>

                      <div className="p-3 rounded-xl bg-linen-50 border border-linen-200 space-y-1.5">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-charcoal-500 block">
                          Geographic Split
                        </span>
                        {cohortStats.rurality.map((r) => (
                          <div key={r.type} className="flex justify-between text-xs font-mono">
                            <span>{r.type}</span>
                            <span className="text-charcoal-600">{r.count.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-charcoal-500 py-8 text-center font-mono">
                    {opsLoading ? 'Loading live DuckDB cohort distribution...' : 'Cohort telemetry not available yet.'}
                  </p>
                )}
              </div>

              <div className="lg:col-span-5 bg-white border border-linen-300 rounded-2xl p-5 shadow-2xs space-y-4">
                <div>
                  <h2 className="font-serif text-base font-bold text-charcoal-900">
                    Cohort Data Controls
                  </h2>
                  <p className="text-xs text-charcoal-500">
                    Admin-only operations to verify or explicitly regenerate synthetic DuckDB cohorts
                  </p>
                </div>

                {seedFeedback && (
                  <div className="p-3 rounded-xl bg-sage-50 border border-sage-200 text-xs text-sage-800">
                    {seedFeedback}
                  </div>
                )}

                <div className="space-y-3">
                  <button
                    type="button"
                    disabled={seedingBusy}
                    onClick={() => void handleSeedClick(false)}
                    className="w-full py-2.5 px-4 rounded-xl bg-charcoal-900 hover:bg-charcoal-800 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Database className="h-3.5 w-3.5 text-sage-300" />
                    <span>{seedingBusy ? 'Processing...' : 'Ensure Default 10,000 Cohort Seeded'}</span>
                  </button>

                  <div className="border-t border-linen-200 pt-3">
                    {!showRegenerateConfirm ? (
                      <button
                        type="button"
                        onClick={() => setShowRegenerateConfirm(true)}
                        className="w-full py-2 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-xs font-semibold cursor-pointer"
                      >
                        Reset & Regenerate Synthetic Cohort...
                      </button>
                    ) : (
                      <div className="p-3.5 rounded-xl bg-red-50/70 border border-red-200 space-y-2.5">
                        <p className="text-[11px] text-red-900 font-medium">
                          Destructive reset requires typing{' '}
                          <code className="font-mono font-bold">CONFIRM_REGENERATE_SYNTHETIC_COHORT</code>:
                        </p>
                        <input
                          type="text"
                          value={regeneratePhrase}
                          onChange={(e) => setRegeneratePhrase(e.target.value)}
                          placeholder="CONFIRM_REGENERATE_SYNTHETIC_COHORT"
                          className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-red-300 rounded-lg"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={
                              seedingBusy ||
                              regeneratePhrase.trim() !== 'CONFIRM_REGENERATE_SYNTHETIC_COHORT'
                            }
                            onClick={() => void handleSeedClick(true)}
                            className="flex-1 py-1.5 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
                          >
                            Confirm Regenerate
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowRegenerateConfirm(false);
                              setRegeneratePhrase('');
                            }}
                            className="py-1.5 px-3 rounded-lg bg-white border border-linen-300 text-xs text-charcoal-700 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Tab 2: User & Role Governance ────────────────────────────────── */}
        {activeTab === 'users' && (
          <div className="bg-white border border-linen-300 rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-serif text-base font-bold text-charcoal-900">
                  Registered User Accounts & Role Governance
                </h2>
                <p className="text-xs text-charcoal-500">
                  Public signups start as patients. Only Administrators can grant Doctor or Admin access.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 text-charcoal-400 absolute left-3 top-2.5" />
                  <input
                    type="search"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search name, email, org..."
                    className="pl-8 pr-3 py-1.5 text-xs bg-linen-50 border border-linen-300 rounded-lg focus:outline-none focus:border-amber-500"
                  />
                </div>

                {(['all', 'patient', 'doctor', 'admin'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRoleFilter(r)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-mono capitalize cursor-pointer border ${
                      roleFilter === r
                        ? 'bg-charcoal-900 text-white border-charcoal-900'
                        : 'bg-white text-charcoal-600 border-linen-300 hover:bg-linen-100'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {userPromoteError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                {userPromoteError}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-linen-200 text-[10px] font-mono uppercase tracking-wider text-charcoal-500">
                    <th className="py-2.5 pr-4">User</th>
                    <th className="py-2.5 px-3">Organization</th>
                    <th className="py-2.5 px-3">Provider</th>
                    <th className="py-2.5 px-3">Role</th>
                    <th className="py-2.5 pl-3 text-right">Governance Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linen-200">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-charcoal-500 font-mono">
                        No matching registered accounts found.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((acc) => {
                      const roleNorm = String(acc.role || 'patient').toLowerCase().trim();
                      const isBusy = promotingUserId === acc.id;
                      const badgeCls =
                        roleNorm === 'admin'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : roleNorm === 'doctor'
                            ? 'bg-sage-50 text-sage-800 border-sage-200'
                            : 'bg-sky-50 text-sky-800 border-sky-200';
                      return (
                        <tr key={acc.id} className="hover:bg-linen-50/70">
                          <td className="py-3 pr-4">
                            <p className="font-semibold text-charcoal-900">{acc.name}</p>
                            <p className="font-mono text-[11px] text-charcoal-500">{acc.email}</p>
                          </td>
                          <td className="py-3 px-3 text-charcoal-700">
                            {acc.organization || '—'}
                          </td>
                          <td className="py-3 px-3 font-mono text-[11px] text-charcoal-600">
                            {acc.provider || 'email'}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-mono font-semibold uppercase ${badgeCls}`}
                            >
                              {roleNorm}
                            </span>
                          </td>
                          <td className="py-3 pl-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              {roleNorm === 'patient' && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void onPromoteUser(acc.id, 'doctor')}
                                  className="px-2.5 py-1 rounded-lg bg-sage-600 hover:bg-sage-700 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                                >
                                  {isBusy ? 'Updating...' : 'Promote to Doctor'}
                                </button>
                              )}
                              {roleNorm !== 'admin' && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void onPromoteUser(acc.id, 'admin')}
                                  className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                                >
                                  {isBusy ? 'Updating...' : 'Promote to Admin'}
                                </button>
                              )}
                              {roleNorm === 'admin' && (
                                <span className="text-[11px] font-mono text-charcoal-400">
                                  Full Admin
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Tab 3: Patient Screenings Verification & Trial Interests ───────── */}
        {activeTab === 'clinical_queue' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-linen-300 rounded-2xl p-5 shadow-2xs space-y-3">
              <div>
                <h2 className="font-serif text-base font-bold text-charcoal-900">
                  Patient Eligibility Screenings Queue
                </h2>
                <p className="text-xs text-charcoal-500">
                  Review self-reported screenings and upgrade provenance to investigator-verified
                </p>
              </div>

              {screeningVerifyError && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                  {screeningVerifyError}
                </div>
              )}

              {patientScreenings.length === 0 ? (
                <p className="text-xs text-charcoal-500 font-mono py-6 text-center">
                  No patient eligibility screenings recorded yet.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {patientScreenings.map((scr) => {
                    const isVerified = Boolean(scr.investigator_verified);
                    const isSynthetic = Boolean(scr.is_synthetic_data);
                    const eligibleStatuses = new Set([
                      'INVESTIGATOR_VERIFIED_ELIGIBLE',
                      'PRELIMINARY_MATCH',
                      'ELIGIBLE',
                      'POTENTIALLY_ELIGIBLE',
                    ]);
                    const eligibleCount = scr.matches.filter((m) =>
                      eligibleStatuses.has(String(m.match_status || '').toUpperCase())
                    ).length;
                    const badgeClasses = isVerified
                      ? 'bg-sage-50 text-sage-800 border-sage-200'
                      : isSynthetic
                        ? 'bg-linen-100 text-charcoal-600 border-linen-300'
                        : 'bg-amber-50 text-amber-800 border-amber-200';
                    const badgeLabel = isVerified
                      ? 'Verified'
                      : isSynthetic
                        ? 'Synthetic Demo'
                        : 'Pending Clinical Review';
                    return (
                      <div
                        key={scr.screening_id}
                        className="p-3.5 rounded-xl bg-linen-50 border border-linen-200 flex items-start justify-between gap-3"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-charcoal-900">
                              {scr.screening_id}
                            </span>
                            <span
                              className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${badgeClasses}`}
                            >
                              {badgeLabel}
                            </span>
                          </div>
                          <p className="text-xs text-charcoal-700 truncate">
                            {scr.patient_id} • {scr.clinical_summary?.cancer_stage || 'Stage N/A'} •{' '}
                            {eligibleCount}/{scr.matches.length} protocol matches
                          </p>
                          <p className="text-[11px] font-mono text-charcoal-500">
                            {new Date(scr.created_at).toLocaleString()}
                          </p>
                        </div>

                        {!isVerified && !isSynthetic && (
                          <button
                            type="button"
                            disabled={verifyingScreeningId === scr.screening_id}
                            onClick={() => void onVerifyScreening(scr.screening_id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sage-600 hover:bg-sage-700 text-white text-[11px] font-semibold cursor-pointer shrink-0 disabled:opacity-50"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                            <span>{verifyingScreeningId === scr.screening_id ? 'Verifying...' : 'Verify'}</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-white border border-linen-300 rounded-2xl p-5 shadow-2xs space-y-3">
              <div>
                <h2 className="font-serif text-base font-bold text-charcoal-900">
                  Trial Interest Submissions ({patientInterests.length})
                </h2>
                <p className="text-xs text-charcoal-500">
                  Patients requesting clinical study team follow-up after eligibility screening
                </p>
              </div>

              {patientInterests.length === 0 ? (
                <p className="text-xs text-charcoal-500 font-mono py-6 text-center">
                  No patient trial interest submissions yet.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {patientInterests.map((interest) => (
                    <div
                      key={interest.id}
                      className="p-3.5 rounded-xl bg-linen-50 border border-linen-200 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-xs text-charcoal-900 truncate">
                          {interest.patient_name || interest.patient_email}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200">
                          {interest.status}
                        </span>
                      </div>
                      <p className="text-[11px] font-mono text-charcoal-600">
                        Protocol {interest.protocol_id} • Patient {interest.patient_id}
                      </p>
                      <p className="text-[11px] text-charcoal-500">
                        {interest.patient_email || 'Email withheld'} • {new Date(interest.submitted_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab 4: 21 CFR Part 11 Cryptographic Audit Ledger ────────────── */}
        {activeTab === 'audit' && (
          <AuditTrailView
            events={auditEvents}
            isLoading={auditLoading}
            error={auditError}
            onRetry={() => void onRefreshAll()}
            verificationStatus={auditVerification}
            patientScreenings={patientScreenings}
            verifyingScreeningId={verifyingScreeningId}
            screeningVerifyError={screeningVerifyError}
            onVerifyScreening={onVerifyScreening}
            patientInterests={patientInterests}
            userRole={user.role}
            adminUsers={adminUsers}
            promotingUserId={promotingUserId}
            userPromoteError={userPromoteError}
            onPromoteUser={onPromoteUser}
          />
        )}
      </main>
    </div>
  );
};
