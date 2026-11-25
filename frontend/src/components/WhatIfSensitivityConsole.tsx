import { useState, useEffect, useRef, useCallback } from 'react';
import type { FC } from 'react';
import type {
  ClinicalProtocol,
  FunnelSimulationResult,
  RetentionPoint,
} from '../types/protocol';
import {
  SlidersHorizontal,
  RotateCcw,
  Sparkles,
  Zap,
  TrendingUp,
  Users,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';

interface WhatIfSensitivityConsoleProps {
  protocol: ClinicalProtocol;
  initialFunnel: FunnelSimulationResult | null;
  initialRetention: RetentionPoint[];
  simulationError?: string | null;
  onSimulateFunnel: (criteria: Record<string, unknown>, signal?: AbortSignal) => Promise<FunnelSimulationResult>;
  onCalculateRetention: (
    enrolled: number,
    pbi: number,
    durationWeeks?: number,
    peakWeeks?: number[],
    signal?: AbortSignal
  ) => Promise<RetentionPoint[]>;
  onSimulationUpdated?: (funnel: FunnelSimulationResult, retention: RetentionPoint[]) => void;
}

function getBaselineFromProtocol(protocol: ClinicalProtocol) {
  const filters = protocol.eligibility?.structured_filters ?? {};
  return {
    minEgfr: typeof filters.min_egfr === 'number' ? filters.min_egfr : 50,
    maxEcog: typeof filters.max_ecog === 'number' ? filters.max_ecog : 1,
    maxBilirubin: typeof filters.max_total_bilirubin === 'number' ? filters.max_total_bilirubin : 1.5,
    allowStableBrainMets:
      typeof filters.allow_stable_brain_mets === 'boolean' ? filters.allow_stable_brain_mets : true,
    maxPriorLines: typeof filters.max_prior_lines === 'number' ? filters.max_prior_lines : 2,
  };
}

export const WhatIfSensitivityConsole: FC<WhatIfSensitivityConsoleProps> = ({
  protocol,
  initialFunnel,
  initialRetention,
  simulationError: externalError = null,
  onSimulateFunnel,
  onCalculateRetention,
  onSimulationUpdated,
}) => {
  const baseline = getBaselineFromProtocol(protocol);
  const protoKey = `${protocol.protocol_id}:${JSON.stringify(protocol.eligibility?.structured_filters ?? {})}:${protocol.burden?.composite_pbi_score ?? 0}`;

  // Track user-modified slider values scoped by active protocol key so switching protocols resets cleanly without effects
  const [sliderOverride, setSliderOverride] = useState<{
    protoKey: string;
    minEgfr: number;
    maxEcog: number;
    maxBilirubin: number;
    allowStableBrainMets: boolean;
    maxPriorLines: number;
  } | null>(null);

  const activeSliders =
    sliderOverride && sliderOverride.protoKey === protoKey
      ? sliderOverride
      : { protoKey, ...baseline };

  const minEgfr = activeSliders.minEgfr;
  const maxEcog = activeSliders.maxEcog;
  const maxBilirubin = activeSliders.maxBilirubin;
  const allowStableBrainMets = activeSliders.allowStableBrainMets;
  const maxPriorLines = activeSliders.maxPriorLines;

  const [localResult, setLocalResult] = useState<{
    protoKey: string;
    funnel: FunnelSimulationResult | null;
    retention: RetentionPoint[];
    stale: boolean;
    error: string | null;
  } | null>(null);

  const hasLocalForProto = localResult?.protoKey === protoKey;
  const funnelData = hasLocalForProto ? localResult.funnel : initialFunnel;
  const retentionData = hasLocalForProto ? localResult.retention : initialRetention;
  const isStaleResult = hasLocalForProto ? localResult.stale : false;
  const simError = (hasLocalForProto ? localResult.error : null) ?? externalError;

  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const abortRef = useRef<AbortController | null>(null);

  // Abort any in-flight simulation on unmount or protocol change
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [protoKey]);

  const executeSimulation = useCallback(
    async (sliders: {
      minEgfr: number;
      maxEcog: number;
      maxBilirubin: number;
      allowStableBrainMets: boolean;
      maxPriorLines: number;
    }) => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      setIsSimulating(true);
      setLocalResult((prev) =>
        prev && prev.protoKey === protoKey ? { ...prev, error: null } : prev
      );

      try {
        const baseFilters = protocol.eligibility?.structured_filters ?? {};
        const criteria: Record<string, unknown> = {
          ...baseFilters,
          max_ecog: sliders.maxEcog,
          min_egfr: sliders.minEgfr,
          max_total_bilirubin: sliders.maxBilirubin,
          max_prior_lines: sliders.maxPriorLines,
          allow_stable_brain_mets: sliders.allowStableBrainMets,
        };
        if (typeof baseFilters.min_prior_lines === 'number' && sliders.maxPriorLines < baseFilters.min_prior_lines) {
          criteria.min_prior_lines = sliders.maxPriorLines;
        }

        const newFunnel = await onSimulateFunnel(criteria, controller.signal);
        if (controller.signal.aborted || abortRef.current !== controller) return;

        const basePbi = protocol.burden?.composite_pbi_score ?? 55.0;
        const adjustedPbi = Math.max(
          20.0,
          Math.min(
            100.0,
            basePbi - (sliders.maxEcog > baseline.maxEcog ? 3.5 : 0) - (sliders.minEgfr < baseline.minEgfr ? 2.5 : 0)
          )
        );
        const enrolledForCurve = Math.max(10, Math.min(10000, newFunnel.final_eligible_count || 10));
        const newRetention = await onCalculateRetention(
          enrolledForCurve,
          adjustedPbi,
          protocol.study_duration_weeks,
          protocol.burden?.peak_burden_weeks,
          controller.signal
        );
        if (controller.signal.aborted || abortRef.current !== controller) return;

        setLocalResult({
          protoKey,
          funnel: newFunnel,
          retention: newRetention,
          stale: false,
          error: null,
        });
        onSimulationUpdated?.(newFunnel, newRetention);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (abortRef.current !== controller) return;
        const msg = err instanceof Error ? err.message : 'Simulation failed. Please retry.';
        setLocalResult((prev) => {
          const existing = prev && prev.protoKey === protoKey ? prev.funnel : initialFunnel;
          return {
            protoKey,
            funnel: existing,
            retention: prev && prev.protoKey === protoKey ? prev.retention : initialRetention,
            stale: Boolean(existing),
            error: msg,
          };
        });
      } finally {
        if (abortRef.current === controller) {
          setIsSimulating(false);
        }
      }
    },
    [
      protoKey,
      protocol,
      baseline.maxEcog,
      baseline.minEgfr,
      onSimulateFunnel,
      onCalculateRetention,
      onSimulationUpdated,
      initialFunnel,
      initialRetention,
    ]
  );

  const updateSliders = (
    patch: Partial<{
      minEgfr: number;
      maxEcog: number;
      maxBilirubin: number;
      allowStableBrainMets: boolean;
      maxPriorLines: number;
    }>
  ) => {
    const next = {
      ...activeSliders,
      ...patch,
      protoKey,
    };
    setSliderOverride(next);
    void executeSimulation(next);
  };

  const setMinEgfr = (val: number) => updateSliders({ minEgfr: val });
  const setMaxEcog = (val: number) => updateSliders({ maxEcog: val });
  const setMaxBilirubin = (val: number) => updateSliders({ maxBilirubin: val });
  const setAllowStableBrainMets = (val: boolean) => updateSliders({ allowStableBrainMets: val });
  const setMaxPriorLines = (val: number) => updateSliders({ maxPriorLines: val });

  const resetToProtocolBaseline = () => {
    const next = getBaselineFromProtocol(protocol);
    updateSliders(next);
  };

  const applyPreset = (preset: 'renal' | 'ecog' | 'realworld') => {
    if (preset === 'renal') {
      updateSliders({
        minEgfr: 50,
        maxEcog: baseline.maxEcog,
        allowStableBrainMets: true,
        maxPriorLines: baseline.maxPriorLines,
      });
    } else if (preset === 'ecog') {
      updateSliders({
        minEgfr: baseline.minEgfr,
        maxEcog: 2,
        allowStableBrainMets: true,
        maxPriorLines: baseline.maxPriorLines,
      });
    } else if (preset === 'realworld') {
      updateSliders({
        minEgfr: 50,
        maxEcog: 2,
        allowStableBrainMets: true,
        maxPriorLines: Math.max(1, baseline.maxPriorLines),
      });
    }
  };

  const totalPopulation = funnelData?.total_population ?? 10000;
  const endRetention =
    retentionData.length > 0 ? retentionData[retentionData.length - 1]?.retained_percentage : null;
  const peakWeekRef = protocol.burden?.peak_burden_weeks?.find(
    (w) => w >= 0 && w <= protocol.study_duration_weeks
  );

  return (
    <div className="space-y-4 select-none">
      
      {/* ── Top Flight Deck Toolbar ────────────────────────────────────────── */}
      <div className="bg-white border border-linen-300 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="font-serif font-bold text-sm text-charcoal-900 tracking-tight">
              Feasibility & Parameter Variance Console
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-linen-200 text-charcoal-700 border border-linen-300 font-semibold">
              DUCKDB VECTOR ENGINE
            </span>
          </div>
          <p className="text-[11px] text-charcoal-500 font-mono mt-0.5">
            Test mathematical parameter relaxation across the {totalPopulation.toLocaleString()} synthetic patient cohort in real time.
          </p>
        </div>

        <button
          type="button"
          onClick={resetToProtocolBaseline}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border border-linen-300 bg-white text-charcoal-700 hover:bg-linen-100 transition-colors shadow-2xs self-start sm:self-center cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5 text-charcoal-500" />
          <span>Reset Baseline</span>
        </button>
      </div>

      {/* ── Error / Stale Banner ──────────────────────────────────────────── */}
      {simError && (
        <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center justify-between gap-3">
          <div className="flex items-start space-x-2">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Simulation Update Failed</span>
              <span className="text-red-700">
                {simError}
                {isStaleResult && ' Showing previously computed results for this protocol.'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void executeSimulation(activeSliders)}
            className="px-3 py-1 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 flex items-center space-x-1 shrink-0 cursor-pointer"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* ── 1-Click Optimization Presets ──────────────────────────────────── */}
      <div className="bg-charcoal-950 text-white rounded-2xl p-3.5 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5">
        <div className="flex items-center space-x-2">
          <Sparkles className="h-4 w-4 text-terracotta-400 flex-shrink-0" />
          <div>
            <span className="text-xs font-semibold text-white block">One-Click Protocol Amendment Presets:</span>
            <span className="text-[10px] text-charcoal-400 font-mono">Clinically calibrated variance scenarios</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => applyPreset('renal')}
            className="px-3 py-1 rounded-lg text-xs font-medium bg-charcoal-900 hover:bg-charcoal-800 border border-charcoal-700 text-charcoal-200 hover:text-white transition-all flex items-center space-x-1.5 cursor-pointer"
          >
            <Zap className="h-3 w-3 text-terracotta-400" />
            <span>KDIGO Renal (eGFR 50)</span>
          </button>

          <button
            type="button"
            onClick={() => applyPreset('ecog')}
            className="px-3 py-1 rounded-lg text-xs font-medium bg-charcoal-900 hover:bg-charcoal-800 border border-charcoal-700 text-charcoal-200 hover:text-white transition-all flex items-center space-x-1.5 cursor-pointer"
          >
            <Users className="h-3 w-3 text-sage-400" />
            <span>ECOG 2 Expansion</span>
          </button>

          <button
            type="button"
            onClick={() => applyPreset('realworld')}
            className="px-3 py-1 rounded-lg text-xs font-medium bg-charcoal-900 hover:bg-charcoal-800 border border-charcoal-700 text-charcoal-200 hover:text-white transition-all flex items-center space-x-1.5 cursor-pointer"
          >
            <TrendingUp className="h-3 w-3 text-amber-400" />
            <span>Real-World Max Yield</span>
          </button>
        </div>
      </div>

      {/* ── Main 2-Column Split Console ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left Column: Parameter Configuration Console (5 cols) */}
        <div className="lg:col-span-5 bg-white border border-linen-300 rounded-2xl flex flex-col shadow-xs overflow-hidden">
          <div className="p-3.5 border-b border-linen-200 bg-linen-50 flex items-center justify-between">
            <span className="font-mono font-bold text-[11px] uppercase tracking-wider text-charcoal-800 flex items-center space-x-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5 text-terracotta-600" />
              <span>Eligibility Variance Parameters</span>
            </span>
            {isSimulating && (
              <span className="text-[10px] font-mono text-terracotta-600 animate-pulse font-semibold">
                Slicing Cohort...
              </span>
            )}
          </div>

          <div className="p-4 space-y-4 text-xs divide-y divide-linen-200">
            
            {/* Control 1: eGFR */}
            <div className="pt-2 first:pt-0 space-y-2">
              <div className="flex justify-between items-center">
                <div>
                  <label className="font-semibold text-charcoal-900 block text-xs">
                    Renal Clearance Cutoff (eGFR)
                  </label>
                  <span className="text-[10px] text-charcoal-500 font-mono">
                    Protocol baseline: {baseline.minEgfr} mL/min/1.73m²
                  </span>
                </div>
                
                <div className="flex items-center space-x-1 font-mono">
                  <button
                    type="button"
                    onClick={() => setMinEgfr(Math.max(30, minEgfr - 5))}
                    aria-label="Decrease minimum eGFR"
                    className="h-6 w-6 rounded-lg border border-linen-300 bg-linen-50 hover:bg-linen-100 flex items-center justify-center font-bold text-charcoal-700 cursor-pointer"
                  >
                    -
                  </button>
                  <span className="px-2.5 py-0.5 rounded-lg bg-terracotta-50 text-terracotta-800 border border-terracotta-200 font-bold min-w-[55px] text-center text-xs">
                    ≥ {minEgfr}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMinEgfr(Math.min(75, minEgfr + 5))}
                    aria-label="Increase minimum eGFR"
                    className="h-6 w-6 rounded-lg border border-linen-300 bg-linen-50 hover:bg-linen-100 flex items-center justify-center font-bold text-charcoal-700 cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              <input
                type="range"
                min="30"
                max="75"
                step="5"
                value={minEgfr}
                onChange={(e) => setMinEgfr(Number(e.target.value))}
                className="w-full accent-terracotta-600 cursor-pointer"
              />

              <div className="flex justify-between text-[10px] text-charcoal-400 font-mono">
                <span>30 (CKD Stg 3)</span>
                <span className="text-terracotta-600 font-bold">{baseline.minEgfr} (Baseline)</span>
                <span>75 (Restrictive)</span>
              </div>
            </div>

            {/* Control 2: ECOG */}
            <div className="pt-3 space-y-2">
              <div className="flex justify-between items-center">
                <div>
                  <label className="font-semibold text-charcoal-900 block text-xs">
                    ECOG Functional Performance
                  </label>
                  <span className="text-[10px] text-charcoal-500 font-mono">
                    Protocol baseline: ECOG ≤ {baseline.maxEcog}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setMaxEcog(val)}
                    className={`py-2 px-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                      maxEcog === val
                        ? 'bg-charcoal-900 text-white border-charcoal-900 shadow-xs font-semibold'
                        : 'bg-white text-charcoal-700 border-linen-300 hover:bg-linen-100'
                    }`}
                  >
                    ECOG ≤ {val} {val === baseline.maxEcog && '(Base)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Control 3: Total Bilirubin */}
            <div className="pt-3 space-y-2">
              <div className="flex justify-between items-center">
                <div>
                  <label className="font-semibold text-charcoal-900 block text-xs">
                    Total Serum Bilirubin
                  </label>
                  <span className="text-[10px] text-charcoal-500 font-mono">
                    Protocol baseline: ≤ {baseline.maxBilirubin} mg/dL
                  </span>
                </div>
                
                <div className="flex items-center space-x-1 font-mono">
                  <button
                    type="button"
                    onClick={() => setMaxBilirubin(Math.max(1.0, Math.round((maxBilirubin - 0.1) * 10) / 10))}
                    aria-label="Decrease max bilirubin"
                    className="h-6 w-6 rounded-lg border border-linen-300 bg-linen-50 hover:bg-linen-100 flex items-center justify-center font-bold text-charcoal-700 cursor-pointer"
                  >
                    -
                  </button>
                  <span className="px-2.5 py-0.5 rounded-lg bg-linen-100 text-charcoal-800 border border-linen-300 font-bold min-w-[55px] text-center text-xs">
                    ≤ {maxBilirubin}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMaxBilirubin(Math.min(3.0, Math.round((maxBilirubin + 0.1) * 10) / 10))}
                    aria-label="Increase max bilirubin"
                    className="h-6 w-6 rounded-lg border border-linen-300 bg-linen-50 hover:bg-linen-100 flex items-center justify-center font-bold text-charcoal-700 cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Control 4: Stable Brain Mets */}
            <div className="pt-3">
              <label className="flex items-start justify-between cursor-pointer p-2 rounded-xl hover:bg-linen-50 transition-colors">
                <div>
                  <span className="font-semibold text-charcoal-900 block text-xs">
                    Permit Stable Treated CNS Lesions
                  </span>
                  <span className="text-[11px] text-charcoal-500">
                    Active/untreated brain metastases remain excluded under safety criteria.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={allowStableBrainMets}
                  onChange={(e) => setAllowStableBrainMets(e.target.checked)}
                  className="h-4 w-4 rounded text-terracotta-600 focus:ring-terracotta-500 border-linen-300 mt-0.5"
                />
              </label>
            </div>

            {/* Control 5: Prior Systemic Lines */}
            <div className="pt-3 space-y-2">
              <div className="flex justify-between items-center">
                <div>
                  <label className="font-semibold text-charcoal-900 block text-xs">
                    Permitted Max Prior Systemic Therapies
                  </label>
                  <span className="text-[10px] text-charcoal-500 font-mono">
                    Protocol baseline: ≤ {baseline.maxPriorLines} prior lines
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {[0, 1, 2, 10].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setMaxPriorLines(val)}
                    className={`py-2 px-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                      maxPriorLines === val
                        ? 'bg-charcoal-900 text-white border-charcoal-900 shadow-xs font-semibold'
                        : 'bg-white text-charcoal-700 border-linen-300 hover:bg-linen-100'
                    }`}
                  >
                    {val === 0 ? '1L Naïve' : val === 10 ? '≤ 10' : `≤ ${val}`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Real-Time Accrual Analytics & Retention Curve (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {!funnelData ? (
            <div className="bg-white border border-linen-300 rounded-2xl p-10 text-center space-y-3 shadow-xs">
              <RefreshCw className={`h-6 w-6 mx-auto ${isSimulating ? 'animate-spin text-terracotta-600' : 'text-charcoal-400'}`} />
              <p className="font-serif font-bold text-sm text-charcoal-900">
                {isSimulating ? 'Running Cohort Simulation…' : 'Simulation Results Unavailable'}
              </p>
              <p className="text-xs text-charcoal-500 font-mono">
                {simError || 'Evaluating eligibility funnel for the selected protocol.'}
              </p>
            </div>
          ) : (
            <>
              {/* Key Feasibility Impact Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-white border border-linen-300 rounded-2xl p-4 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-500 block">
                      Simulated Eligible Cohort
                    </span>
                    {isStaleResult && (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                        Previous
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-baseline space-x-1">
                    <span className="font-serif text-3xl font-bold text-charcoal-900">
                      {funnelData.final_eligible_count.toLocaleString()}
                    </span>
                    <span className="text-xs font-mono text-charcoal-500">
                      / {totalPopulation.toLocaleString()}
                    </span>
                  </div>
                  <span className="text-[11px] text-sage-700 font-mono font-medium block mt-1">
                    {funnelData.overall_yield_percentage}% population yield
                  </span>
                </div>

                <div className="bg-white border border-linen-300 rounded-2xl p-4 shadow-xs">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-500 block">
                    Screen Failure Rate
                  </span>
                  <div className="mt-1 flex items-baseline space-x-1">
                    <span className="font-serif text-3xl font-bold text-terracotta-600">
                      {funnelData.screen_failure_rate}%
                    </span>
                  </div>
                  <span className="text-[11px] text-charcoal-500 font-mono block mt-1">
                    {Math.max(0, totalPopulation - funnelData.final_eligible_count).toLocaleString()} disqualified
                  </span>
                </div>

                <div className="bg-white border border-linen-300 rounded-2xl p-4 shadow-xs col-span-2 sm:col-span-1">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-500 block">
                    Candidate Recovery Lift
                  </span>
                  <div className="mt-1 flex items-baseline space-x-1">
                    <span className="font-serif text-3xl font-bold text-sage-700">
                      +{funnelData.sensitivity_opportunities[0]?.additional_candidates ?? 0}
                    </span>
                    <span className="text-xs font-mono text-charcoal-500">pts</span>
                  </div>
                  <span className="text-[11px] text-charcoal-500 font-mono block mt-1">
                    via eGFR relaxation
                  </span>
                </div>
              </div>

              {/* Screening Funnel Breakdown Table */}
              <div className="bg-white border border-linen-300 rounded-2xl overflow-hidden shadow-xs">
                <div className="p-3 bg-linen-50 border-b border-linen-200 flex items-center justify-between text-xs font-semibold text-charcoal-900">
                  <span className="font-serif text-sm">Step-by-Step Patient Qualification Funnel</span>
                  <span className="text-[10px] font-mono text-charcoal-500 font-normal">Vectorized DuckDB</span>
                </div>
                
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-linen-100 border-b border-linen-200 text-charcoal-600 text-[10px] font-mono uppercase tracking-wider">
                      <th className="py-2 px-3.5">Stage / Gate</th>
                      <th className="py-2 px-3 text-right">Qualified</th>
                      <th className="py-2 px-3 text-right">Yield %</th>
                      <th className="py-2 px-3.5">Funnel Velocity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-linen-200">
                    {funnelData.funnel_stages.map((stg, idx) => (
                      <tr key={stg.stage || idx} className="hover:bg-linen-50 transition-colors">
                        <td className="py-2.5 px-3.5 font-medium text-charcoal-900">{stg.stage}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-charcoal-700 font-semibold">
                          {stg.count.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-charcoal-600">{stg.pass_rate}%</td>
                        <td className="py-2.5 px-3.5">
                          <div className="w-28 bg-linen-200 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-1.5 rounded-full transition-all duration-500 ${
                                idx === funnelData.funnel_stages.length - 1 ? 'bg-sage-600' : 'bg-charcoal-900'
                              }`}
                              style={{ width: `${Math.min(100, Math.max(0, stg.pass_rate))}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Longitudinal Survival Trajectory (Recharts) */}
              <div className="bg-white border border-linen-300 rounded-2xl p-4 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-serif font-bold text-sm text-charcoal-900">
                      Projected {protocol.study_duration_weeks}-Week Subject Retention Trajectory
                    </h3>
                    <span className="text-[11px] text-charcoal-500 font-mono block">
                      Simulated subject dropout decay as a function of cumulative protocol fatigue & visit spikes.
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-charcoal-900 bg-linen-100 px-2.5 py-1 rounded-full border border-linen-300">
                    End-of-Study: {endRetention !== null ? `${endRetention}% active` : 'Unavailable'}
                  </span>
                </div>

                <div className="h-44 w-full pt-2">
                  {retentionData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs font-mono text-charcoal-400">
                      Retention curve unavailable.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={retentionData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                        <defs>
                          <linearGradient id="terracottaRetained" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#e05a47" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#e05a47" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1efe9" />
                        <XAxis
                          dataKey="week"
                          stroke="#9ca3af"
                          tick={{ fontSize: 10, fill: '#6b7280' }}
                          tickFormatter={(w) => `Wk ${w}`}
                        />
                        <YAxis
                          domain={[0, 100]}
                          stroke="#9ca3af"
                          tick={{ fontSize: 10, fill: '#6b7280' }}
                          tickFormatter={(v) => `${v}%`}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            borderColor: '#1e293b',
                            borderRadius: '12px',
                            color: '#fff',
                            fontSize: '11px',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                          }}
                          formatter={(val: unknown) => [`${val}% retained`, 'Active Retention']}
                          labelFormatter={(label) => `Protocol Week ${label}`}
                        />
                        {peakWeekRef !== undefined && (
                          <ReferenceLine
                            x={peakWeekRef}
                            stroke="#f59e0b"
                            strokeDasharray="3 3"
                            label={{ value: `Wk ${peakWeekRef} Peak`, fill: '#d97706', fontSize: 10 }}
                          />
                        )}
                        <Area
                          type="monotone"
                          dataKey="retained_percentage"
                          stroke="#e05a47"
                          strokeWidth={2.5}
                          fill="url(#terracottaRetained)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
