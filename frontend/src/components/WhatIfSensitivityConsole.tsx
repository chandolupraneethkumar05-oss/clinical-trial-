import { useState, useEffect, useTransition } from 'react';
import type { FC } from 'react';
import type { 
  FunnelSimulationResult, 
  RetentionPoint 
} from '../types/protocol';
import { 
  SlidersHorizontal, 
  RotateCcw,
  Sparkles,
  Zap,
  TrendingUp,
  Users
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

interface WhatIfSensitivityConsoleProps {
  initialFunnel: FunnelSimulationResult;
  initialRetention: RetentionPoint[];
  onSimulateFunnel: (criteria: Record<string, unknown>) => Promise<FunnelSimulationResult>;
  onCalculateRetention: (enrolled: number, pbi: number) => Promise<RetentionPoint[]>;
}

export const WhatIfSensitivityConsole: FC<WhatIfSensitivityConsoleProps> = ({
  initialFunnel,
  initialRetention,
  onSimulateFunnel,
  onCalculateRetention
}) => {
  // Clinical Parameter State
  const [minEgfr, setMinEgfr] = useState<number>(60);
  const [maxEcog, setMaxEcog] = useState<number>(1);
  const [minPlatelets, setMinPlatelets] = useState<number>(100);
  const [maxBilirubin, setMaxBilirubin] = useState<number>(1.5);
  const [allowStableBrainMets, setAllowStableBrainMets] = useState<boolean>(true);
  const [maxPriorLines, setMaxPriorLines] = useState<number>(0);

  const [funnelData, setFunnelData] = useState<FunnelSimulationResult>(initialFunnel);
  const [retentionData, setRetentionData] = useState<RetentionPoint[]>(initialRetention);
  const [isPending, startTransition] = useTransition();

  // Trigger vectorized simulation
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

        const basePbi = 68.4;
        const adjustedPbi = Math.max(35.0, basePbi - (maxEcog > 1 ? 5 : 0) - (minEgfr < 60 ? 4 : 0));
        const newRetention = await onCalculateRetention(newFunnel.final_eligible_count, adjustedPbi);
        setRetentionData(newRetention);
      } catch (err) {
        console.error("Simulation failed:", err);
      }
    });
  }, [minEgfr, maxEcog, minPlatelets, maxBilirubin, allowStableBrainMets, maxPriorLines, onCalculateRetention, onSimulateFunnel]);

  const resetToProtocolBaseline = () => {
    setMinEgfr(60);
    setMaxEcog(1);
    setMinPlatelets(100);
    setMaxBilirubin(1.5);
    setAllowStableBrainMets(true);
    setMaxPriorLines(0);
  };

  const applyPreset = (preset: 'renal' | 'ecog' | 'realworld') => {
    if (preset === 'renal') {
      setMinEgfr(50);
      setMaxEcog(1);
      setAllowStableBrainMets(true);
      setMaxPriorLines(0);
    } else if (preset === 'ecog') {
      setMinEgfr(60);
      setMaxEcog(2);
      setAllowStableBrainMets(true);
      setMaxPriorLines(0);
    } else if (preset === 'realworld') {
      setMinEgfr(50);
      setMaxEcog(2);
      setAllowStableBrainMets(true);
      setMaxPriorLines(1);
    }
  };

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
            Test mathematical parameter relaxation across the 10,000 synthetic patient cohort in real time.
          </p>
        </div>

        <button
          onClick={resetToProtocolBaseline}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border border-linen-300 bg-white text-charcoal-700 hover:bg-linen-100 transition-colors shadow-2xs self-start sm:self-center"
        >
          <RotateCcw className="h-3.5 w-3.5 text-charcoal-500" />
          <span>Reset Baseline</span>
        </button>
      </div>

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
            onClick={() => applyPreset('renal')}
            className="px-3 py-1 rounded-lg text-xs font-medium bg-charcoal-900 hover:bg-charcoal-800 border border-charcoal-700 text-charcoal-200 hover:text-white transition-all flex items-center space-x-1.5"
          >
            <Zap className="h-3 w-3 text-terracotta-400" />
            <span>KDIGO Renal (eGFR 50)</span>
          </button>

          <button
            onClick={() => applyPreset('ecog')}
            className="px-3 py-1 rounded-lg text-xs font-medium bg-charcoal-900 hover:bg-charcoal-800 border border-charcoal-700 text-charcoal-200 hover:text-white transition-all flex items-center space-x-1.5"
          >
            <Users className="h-3 w-3 text-sage-400" />
            <span>ECOG 2 Expansion</span>
          </button>

          <button
            onClick={() => applyPreset('realworld')}
            className="px-3 py-1 rounded-lg text-xs font-medium bg-charcoal-900 hover:bg-charcoal-800 border border-charcoal-700 text-charcoal-200 hover:text-white transition-all flex items-center space-x-1.5"
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
            {isPending && (
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
                  <span className="text-[10px] text-charcoal-500 font-mono">Baseline protocol: 60 mL/min/1.73m²</span>
                </div>
                
                <div className="flex items-center space-x-1 font-mono">
                  <button 
                    onClick={() => setMinEgfr(Math.max(30, minEgfr - 5))}
                    className="h-6 w-6 rounded-lg border border-linen-300 bg-linen-50 hover:bg-linen-100 flex items-center justify-center font-bold text-charcoal-700"
                  >
                    -
                  </button>
                  <span className="px-2.5 py-0.5 rounded-lg bg-terracotta-50 text-terracotta-800 border border-terracotta-200 font-bold min-w-[55px] text-center text-xs">
                    ≥ {minEgfr}
                  </span>
                  <button 
                    onClick={() => setMinEgfr(Math.min(75, minEgfr + 5))}
                    className="h-6 w-6 rounded-lg border border-linen-300 bg-linen-50 hover:bg-linen-100 flex items-center justify-center font-bold text-charcoal-700"
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
                <span className="text-terracotta-600 font-bold">60 (Baseline)</span>
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
                  <span className="text-[10px] text-charcoal-500 font-mono">Baseline protocol: ECOG 0 or 1</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map((val) => (
                  <button
                    key={val}
                    onClick={() => setMaxEcog(val)}
                    className={`py-2 px-2 rounded-xl border text-xs font-medium transition-all ${
                      maxEcog === val
                        ? 'bg-charcoal-900 text-white border-charcoal-900 shadow-xs font-semibold'
                        : 'bg-white text-charcoal-700 border-linen-300 hover:bg-linen-100'
                    }`}
                  >
                    ECOG ≤ {val} {val === 1 && '(Base)'}
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
                  <span className="text-[10px] text-charcoal-500 font-mono">Baseline protocol: ≤ 1.5 mg/dL</span>
                </div>
                
                <div className="flex items-center space-x-1 font-mono">
                  <button 
                    onClick={() => setMaxBilirubin(Math.max(1.0, Math.round((maxBilirubin - 0.1) * 10) / 10))}
                    className="h-6 w-6 rounded-lg border border-linen-300 bg-linen-50 hover:bg-linen-100 flex items-center justify-center font-bold text-charcoal-700"
                  >
                    -
                  </button>
                  <span className="px-2.5 py-0.5 rounded-lg bg-linen-100 text-charcoal-800 border border-linen-300 font-bold min-w-[55px] text-center text-xs">
                    ≤ {maxBilirubin}
                  </span>
                  <button 
                    onClick={() => setMaxBilirubin(Math.min(3.0, Math.round((maxBilirubin + 0.1) * 10) / 10))}
                    className="h-6 w-6 rounded-lg border border-linen-300 bg-linen-50 hover:bg-linen-100 flex items-center justify-center font-bold text-charcoal-700"
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
                    Excluding all brain mets drops ~24% of late-stage oncology candidates.
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
                    Permitted Prior Systemic Therapies
                  </label>
                  <span className="text-[10px] text-charcoal-500 font-mono">Baseline: 0 (Treatment-naïve 1L only)</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map((val) => (
                  <button
                    key={val}
                    onClick={() => setMaxPriorLines(val)}
                    className={`py-2 px-2 rounded-xl border text-xs font-medium transition-all ${
                      maxPriorLines === val
                        ? 'bg-charcoal-900 text-white border-charcoal-900 shadow-xs font-semibold'
                        : 'bg-white text-charcoal-700 border-linen-300 hover:bg-linen-100'
                    }`}
                  >
                    {val === 0 ? '1L Naïve' : `≤ ${val} Prior`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Real-Time Accrual Analytics & Retention Curve (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* Key Feasibility Impact Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-white border border-linen-300 rounded-2xl p-4 shadow-xs">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-500 block">
                Simulated Eligible Cohort
              </span>
              <div className="mt-1 flex items-baseline space-x-1">
                <span className="font-serif text-3xl font-bold text-charcoal-900">{funnelData.final_eligible_count.toLocaleString()}</span>
                <span className="text-xs font-mono text-charcoal-500">/ 10k</span>
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
                <span className="font-serif text-3xl font-bold text-terracotta-600">{funnelData.screen_failure_rate}%</span>
              </div>
              <span className="text-[11px] text-charcoal-500 font-mono block mt-1">
                {(10000 - funnelData.final_eligible_count).toLocaleString()} disqualified
              </span>
            </div>

            <div className="bg-white border border-linen-300 rounded-2xl p-4 shadow-xs col-span-2 sm:col-span-1">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-500 block">
                Candidate Recovery Lift
              </span>
              <div className="mt-1 flex items-baseline space-x-1">
                <span className="font-serif text-3xl font-bold text-sage-700">
                  +{funnelData.sensitivity_opportunities[0]?.additional_candidates || 0}
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
                  <tr key={idx} className="hover:bg-linen-50 transition-colors">
                    <td className="py-2.5 px-3.5 font-medium text-charcoal-900">{stg.stage}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-charcoal-700 font-semibold">{stg.count.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-charcoal-600">{stg.pass_rate}%</td>
                    <td className="py-2.5 px-3.5">
                      <div className="w-28 bg-linen-200 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className={`h-1.5 rounded-full transition-all duration-500 ${
                            idx === funnelData.funnel_stages.length - 1 ? 'bg-sage-600' : 'bg-charcoal-900'
                          }`}
                          style={{ width: `${stg.pass_rate}%` }}
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
                  Projected 52-Week Subject Retention Trajectory
                </h3>
                <span className="text-[11px] text-charcoal-500 font-mono block">
                  Simulated subject dropout decay as a function of cumulative protocol fatigue & visit spikes.
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-charcoal-900 bg-linen-100 px-2.5 py-1 rounded-full border border-linen-300">
                End-of-Study: {retentionData[retentionData.length - 1]?.retained_percentage}% active
              </span>
            </div>

            <div className="h-44 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={retentionData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="terracottaRetained" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#e05a47" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#e05a47" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1efe9" />
                  <XAxis dataKey="week" stroke="#9ca3af" tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={(w) => `Wk ${w}`} />
                  <YAxis domain={[0, 100]} stroke="#9ca3af" tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px', color: '#fff', fontSize: '11px', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}
                    formatter={(val: any) => [`${val}% retained`, 'Active Retention']}
                    labelFormatter={(label) => `Protocol Week ${label}`}
                  />
                  <ReferenceLine x={12} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: 'Wk 12 Restaging', fill: '#d97706', fontSize: 10 }} />
                  <Area type="monotone" dataKey="retained_percentage" stroke="#e05a47" strokeWidth={2.5} fill="url(#terracottaRetained)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
