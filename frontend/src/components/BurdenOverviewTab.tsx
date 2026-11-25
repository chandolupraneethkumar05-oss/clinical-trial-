import type { FC } from 'react';
import type { ClinicalProtocol } from '../types/protocol';
import { StatCard } from './StatCard';
import { 
  AlertTriangle, 
  Clock, 
  Users, 
  DollarSign, 
  CheckCircle2, 
  Flame,
  Activity,
  Layers
} from 'lucide-react';

interface BurdenOverviewTabProps {
  protocol: ClinicalProtocol;
  screenFailureRate: number;
  finalEligibleCount: number;
  totalCohortSize?: number;
}

export const BurdenOverviewTab: FC<BurdenOverviewTabProps> = ({
  protocol,
  screenFailureRate,
  finalEligibleCount,
  totalCohortSize = 10000
}) => {
  const { burden } = protocol;
  const modeledDelayCost =
    burden.attrition_risk_tier === 'Severe'
      ? '$2.4M+'
      : burden.attrition_risk_tier === 'High'
      ? '$1.8M'
      : burden.attrition_risk_tier === 'Moderate'
      ? '$1.2M'
      : '$0.6M';

  const topFrictionVisits = [...protocol.visits]
    .map((v) => {
      const weight = v.procedures.reduce((acc, p) => acc + p.invasiveness_weight, 0);
      const mins = v.procedures.reduce((acc, p) => acc + p.estimated_duration_minutes, 0);
      return { visit: v, score: weight + (mins / 60) * 1.5, mins };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case 'Severe':
        return 'bg-terracotta-100 text-terracotta-800 border-terracotta-300';
      case 'High':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'Moderate':
        return 'bg-indigo-100 text-indigo-800 border-indigo-300';
      default:
        return 'bg-sage-100 text-sage-800 border-sage-300';
    }
  };

  return (
    <div className="space-y-6">
      
      {/* ── KPI Cards Row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Patient Burden Index (PBI)"
          value={burden.composite_pbi_score}
          unit="/ 100"
          subtext={`Classified: ${burden.attrition_risk_tier} Patient Friction Tier`}
          icon={Flame}
          variant={burden.composite_pbi_score > 70 ? 'danger' : burden.composite_pbi_score > 50 ? 'warning' : 'safe'}
        />

        <StatCard
          label="Screen Failure Rate"
          value={screenFailureRate}
          unit="%"
          subtext={`${finalEligibleCount.toLocaleString()} eligible from ${totalCohortSize.toLocaleString()} pool`}
          icon={Users}
          variant={screenFailureRate > 60 ? 'danger' : 'warning'}
        />

        <StatCard
          label="Total Clinical Dwell Time"
          value={burden.total_clinic_hours}
          unit="hrs"
          subtext={`${burden.total_study_visits} scheduled visits over ${protocol.study_duration_weeks} weeks`}
          icon={Clock}
          variant="default"
        />

        <StatCard
          label="Modeled Delay Cost Risk"
          value={modeledDelayCost}
          subtext="Estimated at $600k/mo delay model (Tufts CSDD)"
          icon={DollarSign}
          variant={burden.attrition_risk_tier === 'Low' ? 'safe' : 'warning'}
        />
      </div>

      {/* ── Two Column Detailed Breakdown ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Tufts CSDD Burden Decomposition */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-linen-300 p-6 shadow-xs">
          <div className="flex items-center justify-between pb-4 border-b border-linen-200">
            <div>
              <div className="flex items-center space-x-2">
                <Activity className="h-4 w-4 text-terracotta-600" />
                <h2 className="font-serif font-bold text-base text-charcoal-900 tracking-tight">
                  Tufts CSDD Burden Decomposition
                </h2>
              </div>
              <p className="text-xs text-charcoal-500 font-mono mt-0.5">
                Empirical weighted friction metrics calibrated across the entire study lifetime
              </p>
            </div>
            
            <span className={`text-[11px] font-mono px-3 py-1 rounded-full font-bold border ${getTierBadge(burden.attrition_risk_tier)}`}>
              {burden.attrition_risk_tier} Friction Tier
            </span>
          </div>

          <div className="mt-6 space-y-5">
            {/* Temporal Burden */}
            <div>
              <div className="flex justify-between items-center text-xs mb-1.5">
                <span className="font-semibold text-charcoal-800">
                  Temporal Friction (Clinic Dwell + Transit Time)
                </span>
                <span className="font-mono text-charcoal-900 font-bold">{burden.temporal_burden_score}%</span>
              </div>
              <div className="w-full bg-linen-200 rounded-full h-2.5 overflow-hidden">
                <div 
                  className="bg-charcoal-900 h-2.5 rounded-full transition-all duration-700" 
                  style={{ width: `${Math.min(100, burden.temporal_burden_score)}%` }}
                />
              </div>
              <p className="text-[11px] text-charcoal-500 font-mono mt-1">
                {burden.total_clinic_hours} hrs total patient commitment ({burden.total_study_visits} clinic visits).
              </p>
            </div>

            {/* Invasiveness Burden */}
            <div>
              <div className="flex justify-between items-center text-xs mb-1.5">
                <span className="font-semibold text-charcoal-800">
                  Physical & Procedural Invasiveness Friction
                </span>
                <span className="font-mono text-charcoal-900 font-bold">{burden.invasive_burden_score}%</span>
              </div>
              <div className="w-full bg-linen-200 rounded-full h-2.5 overflow-hidden">
                <div 
                  className="bg-terracotta-600 h-2.5 rounded-full transition-all duration-700" 
                  style={{ width: `${Math.min(100, burden.invasive_burden_score)}%` }}
                />
              </div>
              <p className="text-[11px] text-charcoal-500 font-mono mt-1">
                Driven by {burden.total_biopsies} core tumor biopsies, {burden.total_imaging_scans} contrast CT/MRI scans, and {burden.total_blood_draws} blood draws.
              </p>
            </div>

            {/* Cognitive / Regimen Burden */}
            <div>
              <div className="flex justify-between items-center text-xs mb-1.5">
                <span className="font-semibold text-charcoal-800">
                  Cognitive & Protocol Regimen Friction
                </span>
                <span className="font-mono text-charcoal-900 font-bold">{burden.cognitive_burden_score}%</span>
              </div>
              <div className="w-full bg-linen-200 rounded-full h-2.5 overflow-hidden">
                <div 
                  className="bg-sage-600 h-2.5 rounded-full transition-all duration-700" 
                  style={{ width: `${Math.min(100, burden.cognitive_burden_score)}%` }}
                />
              </div>
              <p className="text-[11px] text-charcoal-500 font-mono mt-1">
                Fasting rules, electronic patient-reported outcomes (ePRO), and weekly visit clustering.
              </p>
            </div>
          </div>

          {/* Procedure Count Tags */}
          <div className="mt-6 pt-5 border-t border-linen-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="bg-linen-50 p-3.5 rounded-xl border border-linen-200">
              <span className="block font-serif text-2xl font-bold text-charcoal-900">{burden.total_study_visits}</span>
              <span className="text-[11px] font-mono text-charcoal-500">Scheduled Visits</span>
            </div>
            <div className="bg-linen-50 p-3.5 rounded-xl border border-linen-200">
              <span className="block font-serif text-2xl font-bold text-charcoal-900">{burden.total_imaging_scans}</span>
              <span className="text-[11px] font-mono text-charcoal-500">CT / MRI Scans</span>
            </div>
            <div className="bg-linen-50 p-3.5 rounded-xl border border-linen-200">
              <span className="block font-serif text-2xl font-bold text-terracotta-600">{burden.total_biopsies}</span>
              <span className="text-[11px] font-mono text-charcoal-500">Core Biopsies</span>
            </div>
            <div className="bg-linen-50 p-3.5 rounded-xl border border-linen-200">
              <span className="block font-serif text-2xl font-bold text-charcoal-900">{burden.total_blood_draws}</span>
              <span className="text-[11px] font-mono text-charcoal-500">Blood Draws / PK</span>
            </div>
          </div>
        </div>

        {/* Clinical Rationale & Peak Friction Hotspots */}
        <div className="bg-white rounded-2xl border border-linen-300 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 pb-4 border-b border-linen-200">
              <AlertTriangle className="h-4 w-4 text-terracotta-600" />
              <h2 className="font-serif font-bold text-base text-charcoal-900 tracking-tight">Clinical Risk Rationale</h2>
            </div>

            <div className="mt-4 p-4 bg-terracotta-50/60 border border-terracotta-200/80 rounded-xl">
              <p className="text-xs text-charcoal-800 leading-relaxed font-serif">
                {burden.clinical_risk_rationale}
              </p>
            </div>

            <h3 className="text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-500 mt-5 mb-3">
              Identified Friction Hotspots
            </h3>
            
            <ul className="space-y-3 text-xs">
              {topFrictionVisits.length === 0 ? (
                <li className="text-charcoal-500 font-mono">No scheduled visits available for hotspot analysis.</li>
              ) : (
                topFrictionVisits.map(({ visit, mins }, idx) => (
                  <li key={`${visit.visit_id}-${idx}`} className="flex items-start space-x-2.5 text-charcoal-700">
                    <span
                      className={`h-2 w-2 rounded-full mt-1 shrink-0 ${
                        idx < 2 ? 'bg-terracotta-500' : 'bg-amber-500'
                      }`}
                    />
                    <span>
                      <strong className="text-charcoal-900 font-semibold">
                        Week {visit.week_number} ({visit.visit_name}):
                      </strong>{' '}
                      {visit.procedures.length} procedures ({(mins / 60).toFixed(1)}h clinic dwell) —{' '}
                      {visit.procedures.map((p) => p.name).slice(0, 3).join(', ')}
                      {visit.procedures.length > 3 ? '…' : ''}.
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="mt-6 pt-4 border-t border-linen-200 flex items-center justify-between text-xs text-charcoal-500">
            <span className="font-mono text-[11px]">Peak Fatigue Epochs:</span>
            <div className="flex flex-wrap gap-1.5 justify-end">
              {Array.from(new Set(burden.peak_burden_weeks)).map((w, idx) => (
                <span key={`${w}-${idx}`} className="px-2.5 py-0.5 rounded-full font-mono text-[11px] font-bold bg-terracotta-100 text-terracotta-700 border border-terracotta-200">
                  Wk {w}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Protocol Eligibility Rules Overview ────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-linen-300 p-6 shadow-xs">
        <div className="flex items-center space-x-2 mb-1">
          <Layers className="h-4 w-4 text-charcoal-700" />
          <h2 className="font-serif font-bold text-base text-charcoal-900 tracking-tight">
            Protocol Eligibility Rules Deconstruction
          </h2>
        </div>
        <p className="text-xs text-charcoal-500 font-mono mb-5">
          Key inclusion and exclusion filters extracted directly from the active protocol
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
          {/* Inclusion Criteria */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-sage-800 font-semibold pb-2 border-b border-linen-200">
              <CheckCircle2 className="h-4 w-4 text-sage-600" />
              <span className="font-serif">Key Inclusion Criteria</span>
            </div>
            <ul className="space-y-2">
              {protocol.eligibility.inclusion_criteria.slice(0, 5).map((crit, idx) => (
                <li key={idx} className="flex items-start space-x-2 text-charcoal-800">
                  <span className="text-sage-700 font-mono font-bold shrink-0">I-{idx + 1}.</span>
                  <span className="leading-relaxed font-serif text-[11px]">{crit}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Exclusion Criteria */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-terracotta-800 font-semibold pb-2 border-b border-linen-200">
              <AlertTriangle className="h-4 w-4 text-terracotta-600" />
              <span className="font-serif">Key Exclusion Criteria (Recruitment Bottlenecks)</span>
            </div>
            <ul className="space-y-2">
              {protocol.eligibility.exclusion_criteria.map((crit, idx) => (
                <li key={idx} className="flex items-start space-x-2 text-charcoal-800">
                  <span className="text-terracotta-700 font-mono font-bold shrink-0">E-{idx + 1}.</span>
                  <span className="leading-relaxed font-serif text-[11px]">{crit}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
