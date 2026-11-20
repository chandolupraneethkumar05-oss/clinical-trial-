import { useState, useEffect, useTransition } from 'react';
import type { FC } from 'react';
import type { 
  FunnelSimulationResult, 
  RetentionPoint 
} from '../types/protocol';
import { 
  SlidersHorizontal, 
  RotateCcw 
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
  onSimulateFunnel: (criteria: any) => Promise<FunnelSimulationResult>;
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
  }, [minEgfr, maxEcog, minPlatelets, maxBilirubin, allowStableBrainMets, maxPriorLines]);

  const resetToProtocolBaseline = () => {
    setMinEgfr(60);
    setMaxEcog(1);
    setMinPlatelets(100);
    setMaxBilirubin(1.5);
    setAllowStableBrainMets(true);
    setMaxPriorLines(0);
  };

  return (
    <div className="space-y-4 select-none">
      {/* Console Top Toolbar */}
      <div className="bg-white border border-[#d8dee4] rounded p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="font-semibold text-slate-900 text-sm">Protocol Feasibility & Parameter Variance Console</h2>
            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300">
              DUCKDB VECTOR ENGINE
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Test mathematical parameter relaxation across the 10,000 synthetic patient cohort to measure recruitment yield gains and hazard curve shifts.
          </p>
        </div>

        <button
          onClick={resetToProtocolBaseline}
          className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded border border-[#d8dee4] bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
        >
          <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
          <span>Reset to Protocol Baseline</span>
        </button>
      </div>

      {/* Main 2-Column Split Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Parameter Configuration Console (5 cols) */}
        <div className="lg:col-span-5 bg-white border border-[#d8dee4] rounded flex flex-col">
          <div className="p-3 border-b border-[#d8dee4] bg-[#f8fafc] flex items-center justify-between">
            <span className="font-bold text-[11px] uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5 text-blue-600" />
              <span>Eligibility Variance Parameters</span>
            </span>
            {isPending && (
              <span className="text-[10px] font-mono text-blue-600 animate-pulse font-medium">
                Slicing Cohort...
              </span>
            )}
          </div>

          <div className="p-4 space-y-4 text-xs divide-y divide-[#eef2f6]">
            {/* Control 1: eGFR */}
            <div className="pt-2 first:pt-0">
              <div className="flex justify-between items-center mb-1">
                <div>
                  <label className="font-semibold text-slate-800">Renal Clearance Cutoff (eGFR)</label>
                  <span className="text-[11px] text-slate-500 block">Baseline protocol: 60 mL/min/1.73m²</span>
                </div>
                <div className="flex items-center space-x-1 font-mono">
                  <button 
                    onClick={() => setMinEgfr(Math.max(30, minEgfr - 5))}
                    className="h-6 w-6 rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 flex items-center justify-center font-bold text-slate-700"
                  >
                    -
                  </button>
                  <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-bold min-w-[55px] text-center">
                    ≥ {minEgfr}
                  </span>
                  <button 
                    onClick={() => setMinEgfr(Math.min(75, minEgfr + 5))}
                    className="h-6 w-6 rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 flex items-center justify-center font-bold text-slate-700"
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
                className="w-full accent-[#0066b2] cursor-pointer mt-1"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-0.5 font-mono">
                <span>30 (CKD Stg 3)</span>
                <span className="text-blue-700 font-bold">60 (Baseline)</span>
                <span>75 (Restrictive)</span>
              </div>
            </div>

            {/* Control 2: ECOG */}
            <div className="pt-3">
              <div className="flex justify-between items-center mb-1.5">
                <div>
                  <label className="font-semibold text-slate-800">ECOG Functional Performance</label>
                  <span className="text-[11px] text-slate-500 block">Baseline protocol: ECOG 0 or 1</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map((val) => (
                  <button
                    key={val}
                    onClick={() => setMaxEcog(val)}
                    className={`py-1.5 px-2 rounded border text-xs font-medium transition-colors ${
                      maxEcog === val
                        ? 'bg-[#0066b2] text-white border-[#0066b2] shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    ECOG ≤ {val} {val === 1 && '(Baseline)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Control 3: Total Bilirubin */}
            <div className="pt-3">
              <div className="flex justify-between items-center mb-1">
                <div>
                  <label className="font-semibold text-slate-800">Total Serum Bilirubin</label>
                  <span className="text-[11px] text-slate-500 block">Baseline protocol: ≤ 1.5 mg/dL</span>
                </div>
                <div className="flex items-center space-x-1 font-mono">
                  <button 
                    onClick={() => setMaxBilirubin(Math.max(1.0, Math.round((maxBilirubin - 0.1) * 10) / 10))}
                    className="h-6 w-6 rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 flex items-center justify-center font-bold text-slate-700"
                  >
                    -
                  </button>
                  <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-bold min-w-[55px] text-center">
                    ≤ {maxBilirubin}
                  </span>
                  <button 
                    onClick={() => setMaxBilirubin(Math.min(3.0, Math.round((maxBilirubin + 0.1) * 10) / 10))}
                    className="h-6 w-6 rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 flex items-center justify-center font-bold text-slate-700"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Control 4: Stable Brain Mets */}
            <div className="pt-3">
              <label className="flex items-start justify-between cursor-pointer">
                <div>
                  <span className="font-semibold text-slate-800 block">Permit Stable Treated CNS Lesions</span>
                  <span className="text-[11px] text-slate-500">
                    Excluding all brain mets eliminates ~24% of late-stage NSCLC subjects.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={allowStableBrainMets}
                  onChange={(e) => setAllowStableBrainMets(e.target.checked)}
                  className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 mt-1"
                />
              </label>
            </div>

            {/* Control 5: Prior Systemic Lines */}
            <div className="pt-3">
              <div className="flex justify-between items-center mb-1.5">
                <div>
                  <label className="font-semibold text-slate-800">Permitted Prior Systemic Therapies</label>
                  <span className="text-[11px] text-slate-500 block">Baseline: 0 (Treatment-naïve 1L only)</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map((val) => (
                  <button
                    key={val}
                    onClick={() => setMaxPriorLines(val)}
                    className={`py-1.5 px-2 rounded border text-xs font-medium transition-colors ${
                      maxPriorLines === val
                        ? 'bg-[#0066b2] text-white border-[#0066b2] shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {val === 0 ? '1L Naïve' : `≤ ${val} Prior Line`}
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
            <div className="bg-white border border-[#d8dee4] rounded p-3 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Simulated Eligible Cohort
              </span>
              <div className="mt-1 flex items-baseline space-x-1 font-mono">
                <span className="text-2xl font-bold text-slate-900">{funnelData.final_eligible_count.toLocaleString()}</span>
                <span className="text-xs text-slate-500">/ 10k</span>
              </div>
              <span className="text-[11px] text-emerald-700 font-medium block mt-0.5">
                {funnelData.overall_yield_percentage}% population yield
              </span>
            </div>

            <div className="bg-white border border-[#d8dee4] rounded p-3 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Screen Failure Rate
              </span>
              <div className="mt-1 flex items-baseline space-x-1 font-mono">
                <span className="text-2xl font-bold text-amber-700">{funnelData.screen_failure_rate}%</span>
              </div>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                {(10000 - funnelData.final_eligible_count).toLocaleString()} disqualified
              </span>
            </div>

            <div className="bg-white border border-[#d8dee4] rounded p-3 shadow-xs col-span-2 sm:col-span-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Candidate Recovery Lift
              </span>
              <div className="mt-1 flex items-baseline space-x-1 font-mono">
                <span className="text-2xl font-bold text-emerald-700">
                  +{funnelData.sensitivity_opportunities[0]?.additional_candidates || 0}
                </span>
                <span className="text-xs text-slate-500">pts</span>
              </div>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                via eGFR relaxation
              </span>
            </div>
          </div>

          {/* Screening Funnel Breakdown Table */}
          <div className="bg-white border border-[#d8dee4] rounded overflow-hidden shadow-xs">
            <div className="p-2.5 bg-[#f8fafc] border-b border-[#d8dee4] flex items-center justify-between text-xs font-semibold text-slate-800">
              <span>Step-by-Step Patient Qualification Funnel</span>
              <span className="text-[10px] font-mono font-normal text-slate-500">Vectorized SQL</span>
            </div>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#f1f5f9] border-b border-[#e2e8f0] text-slate-600 text-[11px] font-medium">
                  <th className="py-1.5 px-3">Stage / Gate</th>
                  <th className="py-1.5 px-3 text-right">Qualified</th>
                  <th className="py-1.5 px-3 text-right">Yield %</th>
                  <th className="py-1.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef2f6]">
                {funnelData.funnel_stages.map((stg, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-medium text-slate-800">{stg.stage}</td>
                    <td className="py-2 px-3 text-right font-mono text-slate-700">{stg.count.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right font-mono text-slate-600">{stg.pass_rate}%</td>
                    <td className="py-2 px-3">
                      <div className="w-24 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className={`h-1.5 rounded-full ${idx === funnelData.funnel_stages.length - 1 ? 'bg-emerald-600' : 'bg-blue-600'}`}
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
          <div className="bg-white border border-[#d8dee4] rounded p-3.5 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Projected 52-Week Subject Retention Trajectory (Kaplan-Meier Analogue)
                </h3>
                <span className="text-[11px] text-slate-500 block">
                  Simulated subject drop-out decay as a function of cumulative protocol fatigue & visit spikes.
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-300">
                End-of-Study: {retentionData[retentionData.length - 1]?.retained_percentage}% active
              </span>
            </div>

            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={retentionData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="veevaRetained" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0066b2" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#0066b2" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" />
                  <XAxis dataKey="week" stroke="#94a3b8" tick={{ fontSize: 10 }} tickFormatter={(w) => `Wk ${w}`} />
                  <YAxis domain={[0, 100]} stroke="#94a3b8" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#162842', borderColor: '#243d60', borderRadius: '4px', color: '#fff', fontSize: '11px' }}
                    formatter={(val: any) => [`${val}% retained`, 'Active Retention']}
                    labelFormatter={(label) => `Protocol Week ${label}`}
                  />
                  <ReferenceLine x={12} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: 'Wk 12 Restaging', fill: '#d97706', fontSize: 10 }} />
                  <Area type="monotone" dataKey="retained_percentage" stroke="#0066b2" strokeWidth={2} fill="url(#veevaRetained)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
