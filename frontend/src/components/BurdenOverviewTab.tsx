import type { FC } from 'react';
import type { ClinicalProtocol } from '../types/protocol';
import { StatCard } from './StatCard';
import { 
  AlertTriangle, 
  Clock, 
  Users, 
  DollarSign, 
  CheckCircle, 
  XCircle, 
  Flame
} from 'lucide-react';

interface BurdenOverviewTabProps {
  protocol: ClinicalProtocol;
  screenFailureRate: number;
  finalEligibleCount: number;
}

export const BurdenOverviewTab: FC<BurdenOverviewTabProps> = ({
  protocol,
  screenFailureRate,
  finalEligibleCount
}) => {
  const { burden } = protocol;

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case 'Severe':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'High':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'Moderate':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      default:
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards Row */}
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
          subtext={`${finalEligibleCount.toLocaleString()} candidates eligible from 10k pool`}
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
          label="Projected Delay Cost Risk"
          value="$2.4M"
          subtext="Based on Tufts CSDD Phase III trial delay model ($600k/mo)"
          icon={DollarSign}
          variant="warning"
        />
      </div>

      {/* Two Column Detailed Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tufts CSDD Burden Decomposition */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-clinical-200 p-6 shadow-xs">
          <div className="flex items-center justify-between pb-4 border-b border-clinical-100">
            <div>
              <h2 className="text-base font-semibold text-clinical-900">Tufts CSDD Burden Decomposition</h2>
              <p className="text-xs text-clinical-500 mt-0.5">Empirical weighted friction metrics across study lifetime</p>
            </div>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${getTierBadge(burden.attrition_risk_tier)}`}>
              {burden.attrition_risk_tier} Friction Tier
            </span>
          </div>

          <div className="mt-6 space-y-5">
            {/* Temporal Burden */}
            <div>
              <div className="flex justify-between items-center text-xs mb-1.5">
                <span className="font-medium text-clinical-700">Temporal Friction (Clinic Dwell + Transit Time)</span>
                <span className="font-mono text-clinical-900 font-semibold">{burden.temporal_burden_score}%</span>
              </div>
              <div className="w-full bg-clinical-100 rounded-full h-2.5 overflow-hidden">
                <div 
                  className="bg-brand-600 h-2.5 rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(100, burden.temporal_burden_score)}%` }}
                />
              </div>
              <p className="text-[11px] text-clinical-500 mt-1">
                {burden.total_clinic_hours} hrs total patient commitment ({burden.total_study_visits} clinic visits).
              </p>
            </div>

            {/* Invasiveness Burden */}
            <div>
              <div className="flex justify-between items-center text-xs mb-1.5">
                <span className="font-medium text-clinical-700">Physical & Invasiveness Friction</span>
                <span className="font-mono text-clinical-900 font-semibold">{burden.invasive_burden_score}%</span>
              </div>
              <div className="w-full bg-clinical-100 rounded-full h-2.5 overflow-hidden">
                <div 
                  className="bg-amber-600 h-2.5 rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(100, burden.invasive_burden_score)}%` }}
                />
              </div>
              <p className="text-[11px] text-clinical-500 mt-1">
                Driven by {burden.total_biopsies} core tumor biopsies, {burden.total_imaging_scans} contrast CT/MRI scans, and {burden.total_blood_draws} blood draws.
              </p>
            </div>

            {/* Cognitive / Regimen Burden */}
            <div>
              <div className="flex justify-between items-center text-xs mb-1.5">
                <span className="font-medium text-clinical-700">Cognitive & Protocol Regimen Friction</span>
                <span className="font-mono text-clinical-900 font-semibold">{burden.cognitive_burden_score}%</span>
              </div>
              <div className="w-full bg-clinical-100 rounded-full h-2.5 overflow-hidden">
                <div 
                  className="bg-clinical-600 h-2.5 rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(100, burden.cognitive_burden_score)}%` }}
                />
              </div>
              <p className="text-[11px] text-clinical-500 mt-1">
                Fasting rules, electronic patient-reported outcomes (ePRO), and weekly visit clustering.
              </p>
            </div>
          </div>

          {/* Procedure Count Tags */}
          <div className="mt-6 pt-5 border-t border-clinical-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="bg-clinical-50 p-3 rounded-lg border border-clinical-100">
              <span className="block text-xl font-bold font-mono text-clinical-900">{burden.total_study_visits}</span>
              <span className="text-xs text-clinical-500">Scheduled Visits</span>
            </div>
            <div className="bg-clinical-50 p-3 rounded-lg border border-clinical-100">
              <span className="block text-xl font-bold font-mono text-clinical-900">{burden.total_imaging_scans}</span>
              <span className="text-xs text-clinical-500">CT / MRI Scans</span>
            </div>
            <div className="bg-clinical-50 p-3 rounded-lg border border-clinical-100">
              <span className="block text-xl font-bold font-mono text-clinical-900">{burden.total_biopsies}</span>
              <span className="text-xs text-clinical-500">Core Biopsies</span>
            </div>
            <div className="bg-clinical-50 p-3 rounded-lg border border-clinical-100">
              <span className="block text-xl font-bold font-mono text-clinical-900">{burden.total_blood_draws}</span>
              <span className="text-xs text-clinical-500">Blood Draws / PK</span>
            </div>
          </div>
        </div>

        {/* Clinical Rationale & Peak Friction Hotspots */}
        <div className="bg-white rounded-xl border border-clinical-200 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 pb-4 border-b border-clinical-100">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <h2 className="text-base font-semibold text-clinical-900">Clinical Risk Rationale</h2>
            </div>

            <div className="mt-4 p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-lg">
              <p className="text-xs text-amber-900 leading-relaxed">
                {burden.clinical_risk_rationale}
              </p>
            </div>

            <h3 className="text-xs font-semibold uppercase tracking-wider text-clinical-500 mt-5 mb-3">
              Identified Friction Hotspots
            </h3>
            <ul className="space-y-2.5 text-xs">
              <li className="flex items-start space-x-2 text-clinical-700">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                <span>
                  <strong className="text-clinical-900 font-medium">Week 0 (Cycle 1 Day 1):</strong> Serial 6-hour pharmacokinetic draws immediately stacked onto first IV drug infusion.
                </span>
              </li>
              <li className="flex items-start space-x-2 text-clinical-700">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                <span>
                  <strong className="text-clinical-900 font-medium">Week 12 Restaging:</strong> Concurrent contrast CT scan paired with mandatory on-treatment core tumor re-biopsy.
                </span>
              </li>
              <li className="flex items-start space-x-2 text-clinical-700">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                <span>
                  <strong className="text-clinical-900 font-medium">Screening Window:</strong> Compresses brain MRI, baseline biopsy, and multi-vial blood labs into a tight 14-day window.
                </span>
              </li>
            </ul>
          </div>

          <div className="mt-6 pt-4 border-t border-clinical-100 flex items-center justify-between text-xs text-clinical-500">
            <span>Peak Fatigue Weeks:</span>
            <div className="flex space-x-1.5">
              {burden.peak_burden_weeks.map((w) => (
                <span key={w} className="px-2 py-0.5 rounded font-mono font-medium bg-clinical-100 text-clinical-800">
                  Wk {w}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Protocol Eligibility Summary */}
      <div className="bg-white rounded-xl border border-clinical-200 p-6 shadow-xs">
        <h2 className="text-base font-semibold text-clinical-900 mb-1">Protocol Eligibility Rules Overview</h2>
        <p className="text-xs text-clinical-500 mb-5">Key clinical trial criteria parsed from study document</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
          {/* Inclusion Criteria */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-emerald-800 font-semibold pb-2 border-b border-clinical-100">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              <span>Key Inclusion Criteria</span>
            </div>
            <ul className="space-y-2">
              {protocol.eligibility.inclusion_criteria.slice(0, 5).map((crit, idx) => (
                <li key={idx} className="flex items-start space-x-2 text-clinical-700">
                  <span className="text-clinical-400 font-mono font-medium shrink-0">I-{idx + 1}.</span>
                  <span className="leading-relaxed">{crit}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Exclusion Criteria */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-rose-800 font-semibold pb-2 border-b border-clinical-100">
              <XCircle className="h-4 w-4 text-rose-600" />
              <span>Key Exclusion Criteria (Recruitment Traps)</span>
            </div>
            <ul className="space-y-2">
              {protocol.eligibility.exclusion_criteria.map((crit, idx) => (
                <li key={idx} className="flex items-start space-x-2 text-clinical-700">
                  <span className="text-clinical-400 font-mono font-medium shrink-0">E-{idx + 1}.</span>
                  <span className="leading-relaxed">{crit}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
