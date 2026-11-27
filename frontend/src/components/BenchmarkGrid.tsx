import { useState, useRef, useEffect } from 'react';
import type { FC, FormEvent } from 'react';
import type { BenchmarkTrial, LiveClinicalTrialSummary } from '../types/protocol';
import { apiFetchJson, getStoredAuthToken, SessionExpiredError } from '../lib/api';
import { CheckCircle2, XCircle, Search, ExternalLink, Database, Globe, Loader2, Info } from 'lucide-react';

interface BenchmarkGridProps {
  benchmarks: BenchmarkTrial[];
  disclaimer?: string | null;
  error?: string | null;
  onRetry?: () => void;
  onUnauthorized?: () => void;
  defaultNctId?: string | null;
}

const NCT_ID_REGEX = /^NCT\d{8}$/i;

export const BenchmarkGrid: FC<BenchmarkGridProps> = ({
  benchmarks,
  disclaimer = null,
  error = null,
  onRetry,
  onUnauthorized,
  defaultNctId = null,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLETED' | 'TERMINATED'>('ALL');
  const [nctOverride, setNctOverride] = useState<{ base: string | null; value: string } | null>(null);
  const nctQuery = nctOverride && nctOverride.base === defaultNctId ? nctOverride.value : (defaultNctId || '');
  const [liveTrial, setLiveTrial] = useState<LiveClinicalTrialSummary | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleLookupLiveTrial = async (e?: FormEvent) => {
    e?.preventDefault();
    const normalized = nctQuery.trim().toUpperCase();
    if (!NCT_ID_REGEX.test(normalized)) {
      setLiveError('Enter a valid ClinicalTrials.gov identifier in NCT######## format (e.g., NCT03845296).');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLiveLoading(true);
    setLiveError(null);
    try {
      const headers: Record<string, string> = {};
      const token = getStoredAuthToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const data = await apiFetchJson<LiveClinicalTrialSummary>(
        `/api/v1/benchmark/clinicaltrials-live/${encodeURIComponent(normalized)}`,
        {
          headers,
          signal: controller.signal,
          onUnauthorized,
        }
      );
      if (controller.signal.aborted || abortRef.current !== controller) return;
      setLiveTrial(data);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      if (err instanceof SessionExpiredError) return;
      if (abortRef.current !== controller) return;
      setLiveTrial(null);
      setLiveError(err instanceof Error ? err.message : 'Unable to fetch study details from ClinicalTrials.gov.');
    } finally {
      if (abortRef.current === controller) {
        setLiveLoading(false);
      }
    }
  };

  const safeBenchmarks = Array.isArray(benchmarks) ? benchmarks : [];
  const filtered = safeBenchmarks.filter(t => {
    const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          t.nct_id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || t.actual_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="bg-white border border-linen-300 rounded-2xl shadow-xs select-none overflow-hidden">
      
      {/* ── Table Header & Controls Bar ────────────────────────────────────── */}
      <div className="p-4 border-b border-linen-200 bg-linen-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
        <div>
          <div className="flex items-center space-x-2">
            <Database className="h-4 w-4 text-terracotta-600" />
            <h2 className="font-serif font-bold text-sm text-charcoal-900 tracking-tight">
              Empirical Historical Benchmark Portfolio
            </h2>
          </div>
          <p className="text-[11px] text-charcoal-500 font-mono mt-0.5">
            Validation of ProtocolShield predictive burden models against real-world completed vs terminated Phase III trials from ClinicalTrials.gov.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {/* Status Segmented Filter */}
          <div className="flex bg-linen-200/80 p-0.5 rounded-xl text-[11px] font-medium text-charcoal-700">
            {(['ALL', 'COMPLETED', 'TERMINATED'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setStatusFilter(mode)}
                className={`px-3 py-1 rounded-lg transition-all ${
                  statusFilter === mode 
                    ? 'bg-white text-charcoal-900 shadow-xs font-semibold' 
                    : 'hover:text-charcoal-900'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-charcoal-400" />
            <input
              type="text"
              placeholder="Search NCT ID or title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-linen-300 focus:outline-none focus:border-terracotta-500 w-52 bg-white font-mono"
            />
          </div>
        </div>
      </div>

      {/* ── Curated Source Disclaimer ─────────────────────────────────────── */}
      {disclaimer && (
        <div className="px-4 py-2.5 bg-linen-50 border-b border-linen-200 text-[11px] text-charcoal-600 flex items-center space-x-2">
          <Info className="h-3.5 w-3.5 text-charcoal-500 shrink-0" />
          <span>{disclaimer}</span>
        </div>
      )}

      {/* ── Live ClinicalTrials.gov API v2 Study Comparator ───────────────── */}
      <div className="p-4 border-b border-linen-200 bg-white space-y-3 text-xs">
        <form onSubmit={handleLookupLiveTrial} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center space-x-2">
            <Globe className="h-4 w-4 text-teal-600 shrink-0" />
            <div>
              <span className="font-semibold text-charcoal-900 block">Live ClinicalTrials.gov API v2 Lookup</span>
              <span className="text-[11px] text-charcoal-500 font-mono">
                Fetch live status &amp; eligibility criteria directly from registry by NCT ID
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="text"
              aria-label="NCT Identifier"
              placeholder="e.g. NCT03845296"
              value={nctQuery}
              onChange={(e) => setNctOverride({ base: defaultNctId, value: e.target.value })}
              className="px-3 py-1.5 text-xs rounded-xl border border-linen-300 focus:outline-none focus:border-teal-600 w-40 bg-linen-50 font-mono uppercase"
            />
            <button
              type="submit"
              disabled={liveLoading}
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-charcoal-900 hover:bg-charcoal-800 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
            >
              {liveLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5 text-teal-300" />}
              <span>{liveLoading ? 'Fetching…' : 'Lookup Live Study'}</span>
            </button>
          </div>
        </form>

        {liveError && (
          <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 font-mono text-[11px]">
            {liveError}
          </div>
        )}

        {liveTrial && (
          <div className="p-3.5 rounded-xl bg-teal-50/60 border border-teal-200 space-y-2 select-text">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2 font-mono">
                <span className="font-bold text-teal-800">{liveTrial.nct_id}</span>
                {liveTrial.status && (
                  <span className="px-2 py-0.5 rounded-full bg-white border border-teal-200 text-[10px] font-bold text-charcoal-800">
                    {liveTrial.status}
                  </span>
                )}
              </div>
              <a
                href={`https://clinicaltrials.gov/study/${liveTrial.nct_id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center space-x-1 text-teal-700 hover:underline font-mono text-[11px]"
              >
                <span>Open ClinicalTrials.gov</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            {liveTrial.brief_title && (
              <p className="font-serif font-bold text-xs text-charcoal-900">{liveTrial.brief_title}</p>
            )}
            {Array.isArray(liveTrial.conditions) && liveTrial.conditions.length > 0 && (
              <p className="text-[11px] font-mono text-charcoal-600">
                Conditions: {liveTrial.conditions.join(', ')}
              </p>
            )}
            {liveTrial.eligibility_criteria_text && (
              <details className="text-[11px] text-charcoal-700">
                <summary className="cursor-pointer font-mono font-semibold text-teal-800 hover:underline">
                  View Registry Eligibility Criteria
                </summary>
                <pre className="mt-2 p-2.5 bg-white border border-teal-200 rounded-lg whitespace-pre-wrap font-mono text-[10px] max-h-48 overflow-y-auto">
                  {liveTrial.eligibility_criteria_text}
                </pre>
              </details>
            )}
          </div>
        )}
      </div>

      {/* ── Error Banner ───────────────────────────────────────────────────── */}
      {error && (
        <div className="p-4 bg-red-50 border-b border-red-200 text-xs text-red-800 flex items-center justify-between">
          <span>{error}</span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-3 py-1 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* ── Table Grid ─────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="p-10 text-center space-y-2 text-xs text-charcoal-500 font-mono">
            <p className="font-serif font-bold text-sm text-charcoal-800">
              {safeBenchmarks.length === 0
                ? 'No Historical Benchmark Trials Loaded'
                : 'No Benchmark Trials Match Your Filter'}
            </p>
            <p>
              {safeBenchmarks.length === 0
                ? 'Benchmark data is currently unavailable.'
                : 'Try clearing your search term or switching the status filter.'}
            </p>
          </div>
        ) : (
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-linen-100/70 border-b border-linen-300 text-charcoal-700 text-[10px] uppercase font-mono font-bold tracking-wider">
              <th className="py-3 px-4">NCT ID</th>
              <th className="py-3 px-4 min-w-[280px]">Official Study Title & Phase</th>
              <th className="py-3 px-4">Trial Status</th>
              <th className="py-3 px-4 font-mono text-right">Enrolled / Target</th>
              <th className="py-3 px-4 font-mono">Predicted PBI</th>
              <th className="py-3 px-4">Predictive Verdict</th>
              <th className="py-3 px-4">Friction Drivers</th>
              <th className="py-3 px-4 text-right">Registry</th>
            </tr>
          </thead>
          
          <tbody className="divide-y divide-linen-200">
            {filtered.map((trial) => {
              const isCompleted = trial.actual_status === 'COMPLETED';

              return (
                <tr key={trial.nct_id} className="hover:bg-linen-50/80 transition-colors">
                  {/* NCT ID */}
                  <td className="py-3 px-4 font-mono font-bold text-terracotta-600 text-xs">
                    {trial.nct_id}
                  </td>

                  {/* Title & Phase */}
                  <td className="py-3 px-4">
                    <span className="font-semibold text-charcoal-900 block leading-tight font-serif text-xs">
                      {trial.title}
                    </span>
                    <span className="text-[10px] text-charcoal-500 font-mono mt-0.5 block">{trial.phase}</span>
                    {trial.termination_reason && (
                      <span className="text-[10px] text-terracotta-700 font-mono font-medium block mt-1 bg-terracotta-50 p-1.5 rounded-lg border border-terracotta-200">
                        Termination: {trial.termination_reason}
                      </span>
                    )}
                  </td>

                  {/* Status Badge */}
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                      isCompleted 
                        ? 'bg-sage-100 text-sage-800 border-sage-200' 
                        : 'bg-terracotta-100 text-terracotta-800 border-terracotta-200'
                    }`}>
                      {isCompleted ? <CheckCircle2 className="h-3 w-3 text-sage-600" /> : <XCircle className="h-3 w-3 text-terracotta-600" />}
                      <span>{trial.actual_status}</span>
                    </span>
                  </td>

                  {/* Accrual */}
                  <td className="py-3 px-4 font-mono text-charcoal-800 text-right text-xs">
                    {trial.enrolled_patients} {trial.target_enrollment ? `/ ${trial.target_enrollment}` : ''}
                  </td>

                  {/* PBI Score */}
                  <td className="py-3 px-4 font-mono text-xs">
                    <span className={`font-bold ${trial.predicted_pbi > 70 ? 'text-terracotta-600' : 'text-charcoal-900'}`}>
                      {trial.predicted_pbi}
                    </span>
                    <span className="text-[10px] text-charcoal-500 block">({trial.burden_tier})</span>
                  </td>

                  {/* Verdict */}
                  <td className="py-3 px-4 text-xs font-serif text-charcoal-800">
                    {trial.termination_risk_predicted}
                  </td>

                  {/* Complexity Flags */}
                  <td className="py-3 px-4 text-[11px] text-charcoal-600">
                    <ul className="space-y-0.5">
                      {trial.protocol_complexity_flags.slice(0, 2).map((fl, idx) => (
                        <li key={idx} className="flex items-center space-x-1 truncate max-w-xs" title={fl}>
                          <span className="text-terracotta-500">•</span>
                          <span className="truncate">{fl}</span>
                        </li>
                      ))}
                    </ul>
                  </td>

                  {/* External Link */}
                  <td className="py-3 px-4 text-right">
                    <a
                      href={`https://clinicaltrials.gov/study/${trial.nct_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center space-x-1 text-charcoal-700 hover:text-terracotta-600 font-mono text-[11px] hover:underline"
                    >
                      <span>Record</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        )}
      </div>
    </div>
  );
};
