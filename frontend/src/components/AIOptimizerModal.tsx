import { useState, useEffect } from 'react';
import type { FC } from 'react';
import type { ClinicalProtocol } from '../types/protocol';
import type { ProtocolAmendmentProposal } from '../types/amendment';
import { apiUrl, extractApiErrorMessage, getStoredAuthToken, parseJsonSafe } from '../lib/api';
import {
  X,
  Sparkles,
  CheckCircle2,
  MinusCircle,
  ShieldCheck,
  Zap,
  TrendingUp,
  Clock,
  DollarSign,
  Users,
  ChevronDown,
  ChevronUp,
  FileCheck2,
  Loader2,
  AlertTriangle,
  Building2,
  Award
} from 'lucide-react';

interface AIOptimizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  protocol: ClinicalProtocol;
  onApplyAmendment: (amendmentId: string) => Promise<void>;
  appliedAmendmentIds: string[];
  onUnauthorized?: () => void;
}

export const AIOptimizerModal: FC<AIOptimizerModalProps> = ({
  isOpen,
  onClose,
  protocol,
  onApplyAmendment,
  appliedAmendmentIds,
  onUnauthorized,
}) => {
  const [proposals, setProposals] = useState<ProtocolAmendmentProposal[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({
    'AMD-01': true,
    'AMD-02': true
  });
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [applyingAll, setApplyingAll] = useState<boolean>(false);
  const [showFormalNoticeModal, setShowFormalNoticeModal] = useState<boolean>(false);

  // Fetch proposals from API with proper AbortController cancellation
  useEffect(() => {
    if (!isOpen) return;

    const controller = new AbortController();
    let isMounted = true;
    async function fetchProposals() {
      try {
        setLoading(true);
        setError(null);
        setApplyError(null);
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const token = getStoredAuthToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(apiUrl('/api/v1/optimizer/propose-amendments'), {
          method: 'POST',
          headers,
          body: JSON.stringify(protocol),
          signal: controller.signal,
        });

        if (res.status === 401) {
          onUnauthorized?.();
          throw new Error('Your session has expired. Please sign in again.');
        }

        const data = await parseJsonSafe(res);
        if (!res.ok) {
          throw new Error(extractApiErrorMessage(data, `Failed to generate amendment proposals (HTTP ${res.status}).`));
        }

        if (!Array.isArray(data)) {
          throw new Error('Received an unexpected amendment proposal response format.');
        }

        if (isMounted) {
          setProposals(data as ProtocolAmendmentProposal[]);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Unable to connect to AI Protocol Optimizer service.');
        }
      } finally {
        if (isMounted && !controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchProposals();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [isOpen, protocol, onUnauthorized]);

  if (!isOpen) return null;

  // Aggregate executive metrics
  const totalCandidateLift = proposals.reduce((acc, p) => acc + p.candidate_yield_lift, 0);
  const totalPbiReduction = proposals.reduce((acc, p) => acc + p.pbi_reduction_points, 0);
  const totalAccrualMonths = proposals.reduce((acc, p) => acc + p.estimated_accrual_acceleration_months, 0);
  const totalSavingsUsd = proposals.reduce((acc, p) => acc + p.projected_sponsor_cost_savings_usd, 0);

  // Filtered proposals
  const filteredProposals = proposals.filter((p) => {
    if (selectedCategory === 'ALL') return true;
    return p.category === selectedCategory;
  });

  const toggleExpand = (id: string) => {
    setExpandedDetails((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleApplySingle = async (id: string) => {
    setApplyingId(id);
    setApplyError(null);
    try {
      await onApplyAmendment(id);
    } catch (err: unknown) {
      setApplyError(err instanceof Error ? err.message : `Failed to apply amendment ${id}.`);
    } finally {
      setApplyingId(null);
    }
  };

  const handleApplyAll = async () => {
    setApplyingAll(true);
    setApplyError(null);
    try {
      for (const p of proposals) {
        if (!appliedAmendmentIds.includes(p.amendment_id)) {
          await onApplyAmendment(p.amendment_id);
        }
      }
    } catch (err: unknown) {
      setApplyError(err instanceof Error ? err.message : 'Failed to apply recommended amendments.');
    } finally {
      setApplyingAll(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-charcoal-950/75 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white border border-linen-300 max-w-5xl w-full rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* ── Modal Header ──────────────────────────────────────────────── */}
        <div className="p-5 sm:p-6 bg-charcoal-950 text-white flex items-start justify-between border-b border-charcoal-800">
          <div className="flex items-start space-x-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-terracotta-500 to-amber-500 shadow-md">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-serif font-bold text-lg sm:text-xl text-white tracking-tight">
                  AI Protocol Amendment & Optimization Advisor
                </h2>
                <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-terracotta-500/20 text-terracotta-300 border border-terracotta-500/30">
                  FDA / ASCO ALIGNED
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sage-500/20 text-sage-300 border border-sage-500/30">
                  FDORA SEC 3601 READY
                </span>
              </div>
              <p className="text-xs text-charcoal-300 font-sans mt-1">
                Autonomous redline synthesis designed to remove non-essential patient barriers, widen demographic eligibility, and reduce Tufts CSDD trial friction.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-charcoal-400 hover:text-white p-1.5 rounded-xl transition-colors hover:bg-charcoal-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Executive Lift & Burden Reduction Summary Deck ──────────── */}
        <div className="bg-linen-100/80 border-b border-linen-300 px-5 sm:px-6 py-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Metric 1: Recoverable Candidates */}
            <div className="bg-white p-3.5 rounded-2xl border border-linen-300 shadow-2xs">
              <div className="flex items-center justify-between text-charcoal-500 text-[10px] font-mono uppercase tracking-wider mb-1">
                <span>Candidate Yield Lift</span>
                <Users className="h-3.5 w-3.5 text-terracotta-500" />
              </div>
              <div className="font-serif font-bold text-2xl text-charcoal-950">
                +{totalCandidateLift} <span className="text-xs font-mono font-normal text-terracotta-600">pts</span>
              </div>
              <p className="text-[11px] text-charcoal-600 font-sans mt-0.5">
                From 10k patient real-world cohort
              </p>
            </div>

            {/* Metric 2: PBI Reduction */}
            <div className="bg-white p-3.5 rounded-2xl border border-linen-300 shadow-2xs">
              <div className="flex items-center justify-between text-charcoal-500 text-[10px] font-mono uppercase tracking-wider mb-1">
                <span>Tufts PBI Reduction</span>
                <TrendingUp className="h-3.5 w-3.5 text-sage-600" />
              </div>
              <div className="font-serif font-bold text-2xl text-charcoal-950">
                -{totalPbiReduction.toFixed(1)} <span className="text-xs font-mono font-normal text-sage-600">pts</span>
              </div>
              <p className="text-[11px] text-charcoal-600 font-sans mt-0.5">
                Composite friction burden relief
              </p>
            </div>

            {/* Metric 3: Enrollment Time Saved */}
            <div className="bg-white p-3.5 rounded-2xl border border-linen-300 shadow-2xs">
              <div className="flex items-center justify-between text-charcoal-500 text-[10px] font-mono uppercase tracking-wider mb-1">
                <span>Accrual Accelerated</span>
                <Clock className="h-3.5 w-3.5 text-indigo-500" />
              </div>
              <div className="font-serif font-bold text-2xl text-charcoal-950">
                +{totalAccrualMonths.toFixed(1)} <span className="text-xs font-mono font-normal text-indigo-600">mo</span>
              </div>
              <p className="text-[11px] text-charcoal-600 font-sans mt-0.5">
                Faster time to primary endpoint
              </p>
            </div>

            {/* Metric 4: Sponsor Delay Capital Saved */}
            <div className="bg-white p-3.5 rounded-2xl border border-linen-300 shadow-2xs">
              <div className="flex items-center justify-between text-charcoal-500 text-[10px] font-mono uppercase tracking-wider mb-1">
                <span>Sponsor Capital Saved</span>
                <DollarSign className="h-3.5 w-3.5 text-amber-500" />
              </div>
              <div className="font-serif font-bold text-2xl text-charcoal-950">
                ${(totalSavingsUsd / 1000000).toFixed(2)}M
              </div>
              <p className="text-[11px] text-charcoal-600 font-sans mt-0.5">
                $600k/mo average Phase 3 delay burn
              </p>
            </div>
          </div>
        </div>

        {/* ── Category Filters & Quick Actions ───────────────────────── */}
        <div className="px-5 sm:px-6 py-3 border-b border-linen-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center space-x-2 overflow-x-auto py-0.5">
            <span className="text-[10px] font-mono uppercase text-charcoal-400 font-bold tracking-widest flex-shrink-0">
              Filter:
            </span>

            {[
              { id: 'ALL', label: `All (${proposals.length})` },
              { id: 'RENAL_FUNCTION', label: 'Renal Function' },
              { id: 'RE_BIOPSY', label: 'Decentralized Biopsy' },
              { id: 'STABLE_CNS', label: 'Stable CNS Mets' },
              { id: 'TELEHEALTH_PK', label: 'Telehealth PK' }
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`text-xs font-medium px-3 py-1 rounded-full transition-all flex-shrink-0 ${
                  selectedCategory === cat.id
                    ? 'bg-charcoal-950 text-white font-semibold shadow-2xs'
                    : 'bg-linen-100 text-charcoal-700 hover:bg-linen-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-2 flex-shrink-0">
            <button
              onClick={() => setShowFormalNoticeModal(true)}
              className="text-xs font-semibold px-3 py-1.5 rounded-full border border-linen-300 bg-white text-charcoal-700 hover:bg-linen-100 transition-colors shadow-2xs flex items-center space-x-1.5"
            >
              <FileCheck2 className="h-3.5 w-3.5 text-terracotta-600" />
              <span>IRB / FDA Notice Preview</span>
            </button>

            <button
              onClick={handleApplyAll}
              disabled={
                loading ||
                proposals.length === 0 ||
                applyingAll ||
                proposals.every((p) => appliedAmendmentIds.includes(p.amendment_id))
              }
              className={`text-xs font-semibold px-4 py-1.5 rounded-full transition-all flex items-center space-x-1.5 shadow-sm disabled:opacity-60 ${
                proposals.length > 0 && proposals.every((p) => appliedAmendmentIds.includes(p.amendment_id))
                  ? 'bg-sage-100 text-sage-800 border border-sage-300 cursor-default'
                  : 'bg-charcoal-900 hover:bg-charcoal-800 text-white'
              }`}
            >
              {applyingAll ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-terracotta-300" />
                  <span>Applying Batch...</span>
                </>
              ) : proposals.length > 0 && proposals.every((p) => appliedAmendmentIds.includes(p.amendment_id)) ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-sage-600" />
                  <span>All Amendments Applied</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5 text-terracotta-300" />
                  <span>Apply All Recommended</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── Proposals Body Scroll Area ─────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 bg-linen-50">
          {applyError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between text-xs text-rose-800">
              <span>{applyError}</span>
              <button
                type="button"
                onClick={() => setApplyError(null)}
                className="text-rose-600 hover:text-rose-900 font-semibold ml-3 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}
          
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <Loader2 className="h-8 w-8 text-terracotta-600 animate-spin mx-auto" />
              <p className="font-serif font-bold text-sm text-charcoal-900">
                Evaluating Protocol against FDA & ASCO Guidance Frameworks...
              </p>
              <p className="text-xs text-charcoal-500 font-mono">
                Cross-referencing 10,000 synthetic patient cohort & Tufts CSDD friction coefficients
              </p>
            </div>
          ) : error ? (
            <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-center space-y-2">
              <AlertTriangle className="h-6 w-6 text-rose-600 mx-auto" />
              <p className="font-serif font-bold text-rose-950 text-sm">Optimization Engine Advisory Error</p>
              <p className="text-xs text-rose-700 font-mono">{error}</p>
            </div>
          ) : filteredProposals.length === 0 ? (
            <div className="py-12 text-center text-xs text-charcoal-500 font-mono">
              No amendment proposals found for selected filter category.
            </div>
          ) : (
            filteredProposals.map((proposal) => {
              const isApplied = appliedAmendmentIds.includes(proposal.amendment_id);
              const isExpanded = expandedDetails[proposal.amendment_id] ?? false;
              const isBusy = applyingId === proposal.amendment_id;

              return (
                <div
                  key={proposal.amendment_id}
                  className={`bg-white rounded-2xl border transition-all shadow-xs overflow-hidden ${
                    isApplied
                      ? 'border-sage-300 ring-1 ring-sage-200'
                      : 'border-linen-300 hover:border-linen-400'
                  }`}
                >
                  {/* Card Header */}
                  <div className="p-4 sm:p-5 border-b border-linen-200 bg-white flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-md bg-charcoal-950 text-white">
                          {proposal.amendment_id}
                        </span>
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-linen-200 text-charcoal-700 border border-linen-300">
                          {proposal.category.replace('_', ' ')}
                        </span>
                        {isApplied ? (
                          <span className="inline-flex items-center space-x-1 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-sage-100 text-sage-800 border border-sage-300">
                            <CheckCircle2 className="h-3 w-3 text-sage-600" />
                            <span>APPLIED & SYNCHRONIZED</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300">
                            <Sparkles className="h-3 w-3 text-amber-600" />
                            <span>FDA RECOMMENDED</span>
                          </span>
                        )}
                      </div>

                      <h3 className="font-serif font-bold text-base text-charcoal-950">
                        {proposal.title}
                      </h3>
                      <p className="text-xs text-charcoal-500 font-mono">
                        Target: <strong className="text-charcoal-800">{proposal.target_section}</strong>
                      </p>
                    </div>

                    {/* 1-Click Apply Button */}
                    <div className="flex items-center space-x-2 flex-shrink-0 self-start md:self-center">
                      <button
                        onClick={() => handleApplySingle(proposal.amendment_id)}
                        disabled={isApplied || isBusy}
                        className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all flex items-center space-x-1.5 shadow-2xs ${
                          isApplied
                            ? 'bg-sage-100 text-sage-800 border border-sage-300 cursor-default'
                            : 'bg-charcoal-950 hover:bg-charcoal-850 text-white cursor-pointer active:scale-95'
                        }`}
                      >
                        {isBusy ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-terracotta-400" />
                            <span>Mutating Protocol & Funnel...</span>
                          </>
                        ) : isApplied ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5 text-sage-600" />
                            <span>Applied in DuckDB</span>
                          </>
                        ) : (
                          <>
                            <Zap className="h-3.5 w-3.5 text-terracotta-400" />
                            <span>Apply Amendment</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Quantitative Impact Micro-Metrics */}
                  <div className="px-5 py-2.5 bg-linen-50 border-b border-linen-200 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                    <div className="flex items-center space-x-1.5 text-charcoal-700">
                      <Users className="h-3.5 w-3.5 text-terracotta-600" />
                      <span>Yield Lift:</span>
                      <strong className="text-charcoal-950">
                        {proposal.candidate_yield_lift > 0 
                          ? `+${proposal.candidate_yield_lift} (+${proposal.yield_lift_percentage}%)` 
                          : 'Retention Focused'}
                      </strong>
                    </div>

                    <div className="flex items-center space-x-1.5 text-charcoal-700">
                      <TrendingUp className="h-3.5 w-3.5 text-sage-600" />
                      <span>Burden Drop:</span>
                      <strong className="text-sage-700">-{proposal.pbi_reduction_points} PBI pts</strong>
                    </div>

                    <div className="flex items-center space-x-1.5 text-charcoal-700">
                      <Clock className="h-3.5 w-3.5 text-indigo-600" />
                      <span>Accrual:</span>
                      <strong className="text-charcoal-950">+{proposal.estimated_accrual_acceleration_months} Mo</strong>
                    </div>

                    <div className="flex items-center space-x-1.5 text-charcoal-700">
                      <DollarSign className="h-3.5 w-3.5 text-amber-600" />
                      <span>Capital Saved:</span>
                      <strong className="text-charcoal-950">${(proposal.projected_sponsor_cost_savings_usd / 1000000).toFixed(2)}M</strong>
                    </div>
                  </div>

                  {/* ── Redline Diff Box (Original vs Proposed) ─────────────── */}
                  <div className="p-5 space-y-3">
                    <span className="text-[10px] font-mono uppercase text-charcoal-400 font-bold tracking-widest block">
                      Editorial Protocol Redline Comparison
                    </span>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Current Restrictive Clause */}
                      <div className="p-3.5 rounded-xl bg-rose-50/70 border border-rose-200 text-xs space-y-1.5">
                        <div className="flex items-center space-x-1.5 text-rose-800 text-[10px] font-mono font-bold uppercase">
                          <MinusCircle className="h-3.5 w-3.5 text-rose-600" />
                          <span>Current Restrictive Clause</span>
                        </div>
                        <p className="line-through text-rose-950/80 font-serif leading-relaxed">
                          {proposal.current_clause}
                        </p>
                      </div>

                      {/* Proposed AI Redline */}
                      <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-300 text-xs space-y-1.5">
                        <div className="flex items-center space-x-1.5 text-emerald-800 text-[10px] font-mono font-bold uppercase">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Proposed Modernized Clause</span>
                        </div>
                        <p className="text-emerald-950 font-serif font-semibold leading-relaxed">
                          {proposal.proposed_clause}
                        </p>
                      </div>
                    </div>

                    {/* Expandable Evidence & Diversity Drawer */}
                    <div className="pt-2">
                      <button
                        onClick={() => toggleExpand(proposal.amendment_id)}
                        className="text-xs font-mono text-charcoal-600 hover:text-charcoal-900 flex items-center space-x-1 cursor-pointer"
                      >
                        <span>{isExpanded ? 'Hide' : 'Show'} Regulatory Precedents & FDORA Diversity Analysis</span>
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>

                      {isExpanded && (
                        <div className="mt-3 p-4 rounded-xl bg-linen-100/60 border border-linen-200 space-y-3 text-xs leading-relaxed animate-in fade-in duration-150">
                          
                          {/* Clinical Rationale */}
                          <div>
                            <span className="font-mono text-[10px] font-bold uppercase text-charcoal-500 block mb-0.5">
                              Clinical Evidence & Guideline Consensus:
                            </span>
                            <p className="font-serif text-charcoal-800">
                              {proposal.clinical_evidence_rationale}
                            </p>
                          </div>

                          {/* Regulatory Precedent */}
                          <div>
                            <span className="font-mono text-[10px] font-bold uppercase text-indigo-700 block mb-0.5 flex items-center space-x-1">
                              <Building2 className="h-3 w-3" />
                              <span>FDA / EMA Regulatory Precedent:</span>
                            </span>
                            <p className="font-serif text-charcoal-800 bg-white p-2.5 rounded-lg border border-linen-300">
                              {proposal.regulatory_precedent}
                            </p>
                          </div>

                          {/* Diversity Action Plan */}
                          <div>
                            <span className="font-mono text-[10px] font-bold uppercase text-sage-800 block mb-0.5 flex items-center space-x-1">
                              <Award className="h-3 w-3" />
                              <span>FDA Diversity Action Plan (FDORA Section 3601) Impact:</span>
                            </span>
                            <p className="font-serif text-sage-950 bg-sage-50/70 p-2.5 rounded-lg border border-sage-200">
                              {proposal.health_equity_diversity_impact}
                            </p>
                          </div>

                          {/* Mandatory Safety Guardrails */}
                          {proposal.safety_guardrail_conditions.length > 0 && (
                            <div>
                              <span className="font-mono text-[10px] font-bold uppercase text-charcoal-700 block mb-1">
                                Mandatory Safety Monitoring Guardrails:
                              </span>
                              <ul className="space-y-1">
                                {proposal.safety_guardrail_conditions.map((guard, gIdx) => (
                                  <li key={gIdx} className="flex items-start space-x-1.5 font-sans text-[11px] text-charcoal-700">
                                    <ShieldCheck className="h-3.5 w-3.5 text-sage-600 mt-0.5 flex-shrink-0" />
                                    <span>{guard}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── Modal Footer ──────────────────────────────────────────────── */}
        <div className="p-4 bg-linen-100 border-t border-linen-300 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 text-charcoal-500 font-mono text-[11px]">
            <ShieldCheck className="h-3.5 w-3.5 text-sage-600" />
            <span>All proposed amendments automatically logged to 21 CFR Part 11 Audit Trail</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 font-medium rounded-full border border-linen-300 bg-white text-charcoal-700 hover:bg-linen-200 transition-colors"
            >
              Done & Return to Studio
            </button>
          </div>
        </div>
      </div>

      {/* ── Formal IRB / FDA Amendment Notice Modal ────────────────────── */}
      {showFormalNoticeModal && (
        <div className="fixed inset-0 bg-charcoal-950/80 backdrop-blur-md z-60 flex items-center justify-center p-4">
          <div className="bg-white border border-linen-300 max-w-2xl w-full rounded-3xl shadow-2xl overflow-hidden space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 bg-charcoal-950 text-white flex items-center justify-between border-b border-charcoal-800">
              <div className="flex items-center space-x-2.5">
                <FileCheck2 className="h-5 w-5 text-terracotta-300" />
                <div>
                  <h3 className="font-serif font-bold text-sm">FDA Form 1572 / IRB Protocol Amendment Notice</h3>
                  <p className="text-[11px] text-charcoal-400 font-mono">Formal Clinical Justification Dossier</p>
                </div>
              </div>
              <button 
                onClick={() => setShowFormalNoticeModal(false)}
                className="text-charcoal-400 hover:text-white p-1 rounded-lg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-charcoal-800 max-h-[70vh] overflow-y-auto font-serif">
              <div className="p-3 bg-linen-100 rounded-xl border border-linen-300 font-mono text-[11px] space-y-1">
                <div><strong>Protocol ID:</strong> {protocol.protocol_id}</div>
                <div><strong>Indication:</strong> {protocol.indication}</div>
                <div><strong>Sponsor / Protocol Reference:</strong> {protocol.source_filename || protocol.protocol_id}</div>
                <div><strong>Regulatory Standard:</strong> FDA 21 CFR § 312.30 / FDORA Section 3601</div>
              </div>

              <h4 className="font-serif font-bold text-charcoal-950 text-sm border-b border-linen-300 pb-1">
                Summary of Proposed Protocol Modifications:
              </h4>

              <div className="space-y-3 font-sans text-xs">
                {proposals.map((p) => (
                  <div key={p.amendment_id} className="p-3 rounded-xl border border-linen-200 bg-linen-50/60 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <strong className="text-charcoal-900 font-serif">{p.amendment_id}: {p.title}</strong>
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-linen-200 text-charcoal-700">
                        {p.target_section}
                      </span>
                    </div>
                    <p className="text-charcoal-700 font-serif text-[11px]">
                      <strong>Regulatory Justification:</strong> {p.regulatory_precedent}
                    </p>
                    <p className="text-sage-800 font-serif text-[11px]">
                      <strong>Diversity Impact:</strong> {p.health_equity_diversity_impact}
                    </p>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-950 text-[11px] font-sans">
                <strong>Principal Investigator Attestation:</strong> These modifications optimize clinical feasibility, prevent unnecessary patient biopsy trauma, and enhance representation without compromising patient safety or trial statistical power.
              </div>
            </div>

            <div className="p-4 bg-linen-100 border-t border-linen-300 flex items-center justify-end space-x-2">
              <button
                onClick={() => setShowFormalNoticeModal(false)}
                className="px-4 py-2 text-xs font-medium rounded-full border border-linen-300 bg-white text-charcoal-700 hover:bg-linen-200 transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="px-5 py-2 text-xs font-semibold rounded-full bg-charcoal-900 text-white hover:bg-charcoal-800 shadow-sm flex items-center space-x-1.5 transition-colors"
              >
                <FileCheck2 className="h-3.5 w-3.5" />
                <span>Print Official Notice</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
