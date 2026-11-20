import { useState, useEffect, useTransition } from 'react';
import type { FC } from 'react';
import type { 
  FunnelSimulationResult, 
  RetentionPoint 
} from '../types/protocol';
import { 
  Sliders, 
  RefreshCw, 
  Sparkles, 
  ArrowRight 
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  ReferenceLine 
} from 'recharts';

interface WhatIfSandboxTabProps {
  initialFunnel: FunnelSimulationResult;
  initialRetention: RetentionPoint[];
  onSimulateFunnel: (criteria: any) => Promise<FunnelSimulationResult>;
  onCalculateRetention: (enrolled: number, pbi: number) => Promise<RetentionPoint[]>;
}

export const WhatIfSandboxTab: FC<WhatIfSandboxTabProps> = ({
  initialFunnel,
  initialRetention,
  onSimulateFunnel,
  onCalculateRetention
}) => {
  // Interactive Slider State
  const [minEgfr, setMinEgfr] = useState<number>(60);
  const [maxEcog, setMaxEcog] = useState<number>(1);
  const [minPlatelets, setMinPlatelets] = useState<number>(100);
  const [maxBilirubin, setMaxBilirubin] = useState<number>(1.5);
  const [allowStableBrainMets, setAllowStableBrainMets] = useState<boolean>(true);
  const [maxPriorLines, setMaxPriorLines] = useState<number>(0);

  // Simulation Results
  const [funnelData, setFunnelData] = useState<FunnelSimulationResult>(initialFunnel);
  const [retentionData, setRetentionData] = useState<RetentionPoint[]>(initialRetention);
  const [isPending, startTransition] = useTransition();

  // Run simulation whenever parameters change
  useEffect(() => {
    startTransition(async () => {
      try {
        const criteria = {
          min_age: 18,
          max_age: 75,
          allowed_stages: ["Stage IV (Oligometastatic)", "Stage IV (Polymetastatic)"],
          max_ecog: maxEcog,
          min_anc: 1500.0,
          min_platelets: minPlatelets,
          min_hemoglobin: 9.0,
          min_egfr: minEgfr,
          max_total_bilirubin: maxBilirubin,
          max_alt_multiplier: 2.5,
          max_prior_lines: maxPriorLines,
          allow_stable_brain_mets: allowStableBrainMets,
          exclude_active_autoimmune: true,
          target_biomarker_egfr_negative: true
        };

        const newFunnel = await onSimulateFunnel(criteria);
        setFunnelData(newFunnel);

        // Calculate retention curve based on updated eligible candidate pool
        const basePbi = 68.4;
        const adjustedPbi = Math.max(35.0, basePbi - (maxEcog > 1 ? 5 : 0) - (minEgfr < 60 ? 4 : 0));
        const newRetention = await onCalculateRetention(newFunnel.final_eligible_count, adjustedPbi);
        setRetentionData(newRetention);
      } catch (err) {
        console.error("Simulation failed:", err);
      }
    });
  }, [minEgfr, maxEcog, minPlatelets, maxBilirubin, allowStableBrainMets, maxPriorLines]);

  const resetDefaults = () => {
    setMinEgfr(60);
    setMaxEcog(1);
    setMinPlatelets(100);
    setMaxBilirubin(1.5);
    setAllowStableBrainMets(true);
    setMaxPriorLines(0);
  };

  return (
    <div className="space-y-6">
      {/* Sandbox Header */}
      <div className="bg-white rounded-xl border border-clinical-200 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-base font-semibold text-clinical-900">Protocol Sensitivity & What-If Sandbox</h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-brand-50 text-brand-700 font-semibold border border-brand-200">
              DUCKDB VECTOR ENGINE
            </span>
          </div>
          <p className="text-xs text-clinical-500 mt-0.5">
            Test relaxation of bottleneck eligibility criteria against 10,000 synthetic patient records to simulate candidate recovery.
          </p>
        </div>

        <button
          onClick={resetDefaults}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-clinical-300 bg-white text-clinical-700 hover:bg-clinical-50 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Reset to Baseline</span>
        </button>
      </div>

      {/* Main Sandbox Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Controls Column (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-xl border border-clinical-200 p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-clinical-100">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-clinical-500 flex items-center space-x-1.5">
                <Sliders className="h-3.5 w-3.5 text-brand-600" />
                <span>Eligibility Parameter Sliders</span>
              </h3>
              {isPending && (
                <span className="text-[11px] text-brand-600 font-medium animate-pulse">
                  Querying DuckDB...
                </span>
              )}
            </div>

            <div className="mt-4 space-y-5">
              {/* Renal Function (eGFR) */}
              <div>
                <div className="flex justify-between items-center text-xs mb-1">
                  <label className="font-medium text-clinical-800">
                    Min Renal Clearance (eGFR Cutoff)
                  </label>
                  <span className="font-mono font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                    ≥ {minEgfr} mL/min
                  </span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="70"
                  step="5"
                  value={minEgfr}
                  onChange={(e) => setMinEgfr(Number(e.target.value))}
                  className="w-full accent-brand-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-clinical-400 mt-0.5">
                  <span>30 (Mild CKD)</span>
                  <span className="text-clinical-600 font-medium">60 (Baseline)</span>
                  <span>70 (Stringent)</span>
                </div>
              </div>

              {/* ECOG Status */}
              <div>
                <div className="flex justify-between items-center text-xs mb-1">
                  <label className="font-medium text-clinical-800">
                    Max ECOG Performance Status
                  </label>
                  <span className="font-mono font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                    ECOG ≤ {maxEcog}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {[0, 1, 2].map((val) => (
                    <button
                      key={val}
                      onClick={() => setMaxEcog(val)}
                      className={`py-1.5 text-xs font-medium rounded border transition-colors ${
                        maxEcog === val
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-clinical-50 text-clinical-700 border-clinical-200 hover:bg-clinical-100'
                      }`}
                    >
                      ECOG {val} {val === 1 && '(Std)'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Total Bilirubin */}
              <div>
                <div className="flex justify-between items-center text-xs mb-1">
                  <label className="font-medium text-clinical-800">
                    Max Serum Total Bilirubin
                  </label>
                  <span className="font-mono font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                    ≤ {maxBilirubin} mg/dL
                  </span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="2.5"
                  step="0.1"
                  value={maxBilirubin}
                  onChange={(e) => setMaxBilirubin(Number(e.target.value))}
                  className="w-full accent-brand-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-clinical-400 mt-0.5">
                  <span>1.0 mg/dL</span>
                  <span className="text-clinical-600 font-medium">1.5 (Baseline)</span>
                  <span>2.5 mg/dL</span>
                </div>
              </div>

              {/* Platelets */}
              <div>
                <div className="flex justify-between items-center text-xs mb-1">
                  <label className="font-medium text-clinical-800">
                    Min Platelet Count
                  </label>
                  <span className="font-mono font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                    ≥ {minPlatelets}k /uL
                  </span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="150"
                  step="10"
                  value={minPlatelets}
                  onChange={(e) => setMinPlatelets(Number(e.target.value))}
                  className="w-full accent-brand-600 cursor-pointer"
                />
              </div>

              {/* Stable Treated Brain Metastases Toggle */}
              <div className="pt-2 border-t border-clinical-100">
                <label className="flex items-center justify-between text-xs cursor-pointer">
                  <span className="font-medium text-clinical-800">
                    Allow Stable Treated Brain Metastases
                  </span>
                  <input
                    type="checkbox"
                    checked={allowStableBrainMets}
                    onChange={(e) => setAllowStableBrainMets(e.target.checked)}
                    className="h-4 w-4 rounded text-brand-600 focus:ring-brand-500 border-clinical-300"
                  />
                </label>
                <p className="text-[11px] text-clinical-500 mt-0.5">
                  Excluding all brain mets drops ~24% of advanced Stage IV lung cancer candidates.
                </p>
              </div>

              {/* Prior Lines of Therapy */}
              <div className="pt-2 border-t border-clinical-100">
                <div className="flex justify-between items-center text-xs mb-1">
                  <label className="font-medium text-clinical-800">
                    Allowed Prior Systemic Lines
                  </label>
                  <span className="font-mono font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                    ≤ {maxPriorLines} prior lines
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 mt-1">
                  {[0, 1, 2, 3].map((val) => (
                    <button
                      key={val}
                      onClick={() => setMaxPriorLines(val)}
                      className={`py-1.5 text-xs font-medium rounded border transition-colors ${
                        maxPriorLines === val
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-clinical-50 text-clinical-700 border-clinical-200 hover:bg-clinical-100'
                      }`}
                    >
                      {val === 0 ? '1L Naïve' : `≤ ${val} Lines`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Real-Time Analytics Column (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Real-Time Impact Metric Banner */}
          <div className="bg-white rounded-xl border border-clinical-200 p-5 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-clinical-500">
                Simulated Eligible Cohort
              </span>
              <div className="mt-1 flex items-baseline space-x-2">
                <span className="text-3xl font-extrabold font-mono text-clinical-900 tabular-nums">
                  {funnelData.final_eligible_count.toLocaleString()}
                </span>
                <span className="text-xs font-medium text-clinical-500">
                  candidates ({funnelData.overall_yield_percentage}% of 10,000 population)
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs font-semibold uppercase tracking-wider text-clinical-500">
                Screen Failure Rate
              </span>
              <div className="mt-1 flex items-baseline justify-end space-x-1.5">
                <span className="text-2xl font-bold font-mono text-amber-700 tabular-nums">
                  {funnelData.screen_failure_rate}%
                </span>
              </div>
            </div>
          </div>

          {/* Screening Funnel Progress Bars */}
          <div className="bg-white rounded-xl border border-clinical-200 p-5 shadow-xs">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-clinical-500 mb-4">
              Step-by-Step Accrual Funnel
            </h3>
            <div className="space-y-3.5">
              {funnelData.funnel_stages.map((stg, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-clinical-800">{stg.stage}</span>
                    <span className="font-mono text-clinical-600">
                      <strong>{stg.count.toLocaleString()}</strong> ({stg.pass_rate}%)
                    </span>
                  </div>
                  <div className="w-full bg-clinical-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        idx === funnelData.funnel_stages.length - 1 
                          ? 'bg-emerald-600' 
                          : 'bg-brand-600'
                      }`}
                      style={{ width: `${stg.pass_rate}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 52-Week Kaplan-Meier Retention Curve */}
          <div className="bg-white rounded-xl border border-clinical-200 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-clinical-500">
                  Projected 52-Week Retention Curve (Kaplan-Meier Analogue)
                </h3>
                <p className="text-[11px] text-clinical-400">
                  Survival trajectory tracking patient fatigue & drop-off over trial duration
                </p>
              </div>
              <span className="text-xs font-mono font-semibold text-clinical-700 bg-clinical-100 px-2 py-0.5 rounded">
                Final Retention: {retentionData[retentionData.length - 1]?.retained_percentage}%
              </span>
            </div>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={retentionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRetained" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="week" 
                    stroke="#94a3b8" 
                    tick={{ fontSize: 11 }}
                    tickFormatter={(w) => `Wk ${w}`}
                  />
                  <YAxis 
                    domain={[0, 100]} 
                    stroke="#94a3b8" 
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', color: '#fff', fontSize: '11px' }}
                    formatter={(val: any) => [`${val}% retained`, 'Active Cohort']}
                    labelFormatter={(label) => `Study Week ${label}`}
                  />
                  <ReferenceLine x={12} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: 'Wk 12 Restaging', fill: '#d97706', fontSize: 10 }} />
                  <Area 
                    type="monotone" 
                    dataKey="retained_percentage" 
                    stroke="#2563eb" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorRetained)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* AI Clinical Amendment Recommendations */}
          <div className="bg-clinical-50 border border-clinical-200 rounded-xl p-5">
            <div className="flex items-center space-x-2 pb-3 border-b border-clinical-200">
              <Sparkles className="h-4 w-4 text-brand-600" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-clinical-800">
                Data-Backed Protocol Amendments
              </h3>
            </div>
            <div className="mt-3 space-y-3">
              {funnelData.sensitivity_opportunities.map((opp, idx) => (
                <div key={idx} className="bg-white p-3 rounded-lg border border-clinical-200 text-xs flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-clinical-900">{opp.parameter}</span>
                    <div className="flex items-center space-x-1.5 text-clinical-500 mt-0.5">
                      <span>{opp.current_rule}</span>
                      <ArrowRight className="h-3 w-3 text-clinical-400" />
                      <strong className="text-emerald-700">{opp.proposed_relaxation}</strong>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-emerald-700 text-sm">
                      +{opp.additional_candidates} pts
                    </span>
                    <span className="block text-[10px] text-clinical-400">
                      +{opp.relative_gain_percent}% candidate yield
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
