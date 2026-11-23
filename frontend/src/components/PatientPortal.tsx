import { useState, useEffect } from 'react';
import type { FC } from 'react';
import type { AuthUser } from '../types/auth';
import { UserMenu } from './UserMenu';
import {
  HeartHandshake,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Sparkles,
  Sliders,
  RefreshCw,
  ArrowLeft
} from 'lucide-react';

interface PatientPortalProps {
  user: AuthUser;
  onSignOut: () => void;
  onSwitchPersona: () => void;
  onOpenAuth: () => void;
  onBackToLanding?: () => void;
}

interface CriterionCheck {
  criterion: string;
  category: string;
  passed: boolean;
  patient_value: string;
  required_threshold: string;
  impact_note: string;
}

interface TrialMatch {
  protocol_id: string;
  title: string;
  indication: string;
  phase: string;
  match_status: 'POTENTIALLY_ELIGIBLE' | 'REQUIRES_REVIEW' | 'NOT_ELIGIBLE' | 'ELIGIBLE' | 'BORDERLINE' | 'INELIGIBLE';
  match_score_pct: number;
  passed_criteria_count: number;
  total_criteria_count: number;
  criteria_breakdown: CriterionCheck[];
  recruitment_acceleration_opportunity?: string;
  patient_burden_summary: {
    pbi_score: number;
    attrition_risk_tier: string;
    total_study_visits: number;
    total_clinic_hours: number;
    travel_distance_miles: number;
    telehealth_eligible_visits: number;
  };
  investigator_confirmation_required?: boolean;
  investigator_disclaimer?: string;
}

export const PatientPortal: FC<PatientPortalProps> = ({
  user,
  onSignOut,
  onSwitchPersona,
  onOpenAuth,
  onBackToLanding,
}) => {
  // Candidate Phenotype Input State
  const [age, setAge] = useState<number>(62);
  const [cancerStage, setCancerStage] = useState<string>('Stage IV (Oligometastatic)');
  const [ecogScore, setEcogScore] = useState<number>(1);
  const [egfr, setEgfr] = useState<number>(52.0);
  const [distanceMiles, setDistanceMiles] = useState<number>(24.0);
  const [stableBrainMets, setStableBrainMets] = useState<boolean>(true);

  // Results State
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [matches, setMatches] = useState<TrialMatch[]>([]);
  const [summary, setSummary] = useState<string>('');
  const [enrolledTrialId, setEnrolledTrialId] = useState<string | null>(null);

  // Fetch persisted interests on mount
  useEffect(() => {
    async function loadInterests() {
      if (!user.token) return;
      try {
        const res = await fetch('/api/v1/patient/interests', {
          headers: { Authorization: `Bearer ${user.token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setEnrolledTrialId(data[0].protocol_id);
          }
        }
      } catch (e) {
        console.warn('Could not load existing interests', e);
      }
    }
    loadInterests();
  }, [user]);

  // Persist interest to backend DuckDB
  const handleExpressInterest = async (protocolId: string) => {
    setEnrolledTrialId(protocolId);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (user.token) {
        headers['Authorization'] = `Bearer ${user.token}`;
      }
      await fetch('/api/v1/patient/interest', {
        method: 'POST',
        headers,
        body: JSON.stringify({ protocol_id: protocolId })
      });
    } catch (err) {
      console.error('Failed to register interest:', err);
    }
  };

  // Live Screening Query
  const runScreening = async () => {
    setIsLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (user.token) {
        headers['Authorization'] = `Bearer ${user.token}`;
      }

      const res = await fetch('/api/v1/patient/screen-eligibility', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          patient_id: user.id || 'PT-VOLUNTEER',
          age,
          cancer_stage: cancerStage,
          ecog_score: ecogScore,
          egfr_ml_min: egfr,
          distance_to_center_miles: distanceMiles,
          has_stable_brain_mets: stableBrainMets,
          anc: 1850.0,
          platelets: 165.0,
          hemoglobin: 11.4,
          total_bilirubin: 1.1,
          prior_lines: 0,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMatches(data.matches || []);
        setSummary(data.recruitment_support_summary || '');
      }
    } catch (err) {
      console.error('Failed to run patient screening:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    runScreening();
  }, [age, cancerStage, ecogScore, egfr, distanceMiles, stableBrainMets]);

  return (
    <div className="min-h-screen bg-linen-100 flex flex-col font-sans text-charcoal-900">
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-linen-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center">
              <HeartHandshake className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-serif font-bold text-sm tracking-tight text-charcoal-900">
                  ProtocolShield Patient Portal
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-100 text-blue-800">
                  Patient Role Active
                </span>
              </div>
              <span className="text-[11px] text-charcoal-500 font-mono">
                Personalized Clinical Trial Eligibility & Burden Matching
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {onBackToLanding && (
              <button
                onClick={onBackToLanding}
                className="hidden sm:inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-medium text-charcoal-700 bg-linen-200 hover:bg-linen-300 border border-linen-300 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-charcoal-500" />
                <span>Overview</span>
              </button>
            )}
            <UserMenu
              user={user}
              onOpenAuth={onOpenAuth}
              onSignOut={onSignOut}
              onSwitchPersona={onSwitchPersona}
            />
          </div>
        </div>
      </header>

      {/* ── Main Portal Body ────────────────────────────────────────────────── */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Welcome Banner */}
        <div className="bg-white rounded-3xl border border-linen-300 p-6 sm:p-8 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-blue-600 font-bold block">
              COGNIZANT OPEN INNOVATION • PATIENT RECRUITMENT SUITE
            </span>
            <h1 className="font-serif text-2xl sm:text-3xl text-charcoal-900 font-bold">
              Welcome, {user.name}
            </h1>
            <p className="text-xs sm:text-sm text-charcoal-600 max-w-2xl leading-relaxed">
              Your clinical profile is screened in real time against ongoing oncology protocols. ProtocolShield automatically highlights matching trials, explains eligibility criteria in plain language, and models visit burden before you consent.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-linen-50 border border-linen-200 text-center min-w-[200px]">
            <span className="text-[10px] font-mono text-charcoal-500 block uppercase">Matched Opportunities</span>
            <span className="font-serif text-3xl font-bold text-charcoal-900 block mt-0.5">
              {matches.filter((m) =>
                m.match_status === 'POTENTIALLY_ELIGIBLE' ||
                m.match_status === 'REQUIRES_REVIEW' ||
                m.match_status === 'ELIGIBLE' ||
                m.match_status === 'BORDERLINE'
              ).length}
            </span>
            <span className="text-[10px] font-mono text-sage-700 bg-sage-50 px-2 py-0.5 rounded-full inline-block mt-1">
              Active Clinical Trials
            </span>
          </div>
        </div>

        {/* Two-Column Grid: Left Controls / Right Matches */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Interactive Patient Phenotype Controls */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white rounded-3xl border border-linen-300 p-6 shadow-xs space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-linen-200">
                <div className="flex items-center space-x-2">
                  <Sliders className="h-4 w-4 text-blue-600" />
                  <h3 className="font-serif font-bold text-sm text-charcoal-900">
                    Your Clinical Parameters
                  </h3>
                </div>
                <button
                  onClick={runScreening}
                  className="p-1 rounded text-charcoal-400 hover:text-charcoal-700"
                  title="Refresh"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Age Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <label className="text-charcoal-700 font-medium">Age</label>
                  <span className="font-mono font-bold text-charcoal-900">{age} years</span>
                </div>
                <input
                  type="range"
                  min="25"
                  max="85"
                  value={age}
                  onChange={(e) => setAge(Number(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>

              {/* Cancer Stage */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-charcoal-700 block">
                  Cancer Stage
                </label>
                <select
                  value={cancerStage}
                  onChange={(e) => setCancerStage(e.target.value)}
                  className="w-full p-2 text-xs bg-linen-50 border border-linen-300 rounded-xl focus:outline-none focus:border-blue-500 font-mono"
                >
                  <option value="Stage IV (Oligometastatic)">Stage IV (Oligometastatic)</option>
                  <option value="Stage IV (Polymetastatic)">Stage IV (Polymetastatic)</option>
                  <option value="Stage IIIB">Stage IIIB (Locally Advanced)</option>
                  <option value="Stage II">Stage II (Early / Resectable)</option>
                </select>
              </div>

              {/* Renal eGFR Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <label className="text-charcoal-700 font-medium">Kidney eGFR</label>
                  <span className={`font-mono font-bold ${egfr >= 60 ? 'text-sage-700' : egfr >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                    {egfr} mL/min
                  </span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="90"
                  step="1"
                  value={egfr}
                  onChange={(e) => setEgfr(Number(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
                <span className="text-[10px] text-charcoal-500 font-mono block">
                  {egfr < 60 && egfr >= 50
                    ? '⚠️ Borderline clearance: Matches protocols adopting AMD-01.'
                    : egfr >= 60
                    ? '✓ Normal kidney function threshold.'
                    : 'Restricted renal clearance.'}
                </span>
              </div>

              {/* ECOG Score */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-charcoal-700 block">
                  ECOG Performance Status
                </label>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  {[0, 1, 2].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setEcogScore(s)}
                      className={`p-2 rounded-xl border transition-all cursor-pointer ${
                        ecogScore === s
                          ? 'bg-blue-600 text-white border-blue-600 font-semibold'
                          : 'bg-linen-50 text-charcoal-700 border-linen-200 hover:bg-linen-100'
                      }`}
                    >
                      <span className="font-mono text-xs block">ECOG {s}</span>
                      <span className="text-[9px] block opacity-80">
                        {s === 0 ? 'Fully active' : s === 1 ? 'Mild fatigue' : 'Ambulatory'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Distance to Center */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <label className="text-charcoal-700 font-medium">Distance to Hospital</label>
                  <span className="font-mono font-bold text-charcoal-900">{distanceMiles} miles</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="120"
                  step="5"
                  value={distanceMiles}
                  onChange={(e) => setDistanceMiles(Number(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>

              {/* Stable Brain Mets Toggle */}
              <div className="pt-2">
                <label className="flex items-start space-x-2 text-xs text-charcoal-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={stableBrainMets}
                    onChange={(e) => setStableBrainMets(e.target.checked)}
                    className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>Stable, treated brain metastases history (radiosurgery / radiation completed)</span>
                </label>
              </div>

            </div>
          </div>

          {/* Right Column: Trial Match Results Cards */}
          <div className="lg:col-span-8 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-serif font-bold text-lg text-charcoal-900">
                  Evaluated Trial Portfolio
                </h2>
                <p className="text-xs text-charcoal-500 font-mono mt-0.5">
                  {summary || 'Matching candidate phenotype against active protocols…'}
                </p>
              </div>
            </div>

            <div className="space-y-5">
              {matches.map((trial) => {
                const isEligible = trial.match_status === 'POTENTIALLY_ELIGIBLE' || trial.match_status === 'ELIGIBLE';
                const isBorderline = trial.match_status === 'REQUIRES_REVIEW' || trial.match_status === 'BORDERLINE';
                const isEnrolled = enrolledTrialId === trial.protocol_id;

                return (
                  <div
                    key={trial.protocol_id}
                    className="bg-white rounded-3xl border border-linen-300 p-6 shadow-xs space-y-5 transition-all hover:shadow-md"
                  >
                    {/* Trial Card Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-linen-200">
                      <div>
                        <div className="flex items-center space-x-2 font-mono text-[10px]">
                          <span className="font-bold text-charcoal-500">{trial.protocol_id}</span>
                          <span>•</span>
                          <span className="text-charcoal-600">{trial.phase}</span>
                          <span>•</span>
                          <span className="text-charcoal-600">{trial.indication}</span>
                        </div>
                        <h3 className="font-serif font-bold text-base text-charcoal-900 mt-1 leading-snug">
                          {trial.title}
                        </h3>
                      </div>

                      <div className="flex items-center space-x-2 self-start sm:self-auto">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold font-mono border ${
                            isEligible
                              ? 'bg-sage-100 text-sage-800 border-sage-200'
                              : isBorderline
                              ? 'bg-amber-100 text-amber-800 border-amber-200'
                              : 'bg-red-50 text-red-700 border-red-200'
                          }`}
                        >
                          {isEligible ? '✓ Potentially Eligible' : isBorderline ? '⚡ Requires Review' : '✕ Excluded'}
                        </span>
                      </div>
                    </div>

                    {/* Criteria Status Breakdown */}
                    <div className="space-y-2">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-400 block">
                        Eligibility Criteria Verification ({trial.passed_criteria_count} of {trial.total_criteria_count} passed)
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {trial.criteria_breakdown.map((c, idx) => (
                          <div
                            key={idx}
                            className={`p-2.5 rounded-xl border text-xs flex items-start space-x-2.5 ${
                              c.passed
                                ? 'bg-sage-50/50 border-sage-200 text-sage-900'
                                : 'bg-amber-50/60 border-amber-200 text-amber-900'
                            }`}
                          >
                            {c.passed ? (
                              <CheckCircle2 className="h-4 w-4 text-sage-600 shrink-0 mt-0.5" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1">
                              <span className="font-semibold block">{c.criterion}</span>
                              <span className="text-[10px] font-mono opacity-80 block">
                                Your value: {c.patient_value} (Requires {c.required_threshold})
                              </span>
                              <p className="text-[10px] mt-0.5 opacity-90 leading-tight">{c.impact_note}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Opportunity Box */}
                    {trial.recruitment_acceleration_opportunity && (
                      <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl flex items-start space-x-2.5 text-xs text-blue-900">
                        <Sparkles className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-serif font-bold text-xs text-blue-950 block">
                            Recruitment Modernization Opportunity
                          </span>
                          <p className="text-[11px] text-blue-800 mt-0.5 leading-relaxed">
                            {trial.recruitment_acceleration_opportunity}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Burden & Schedule Metrics */}
                    <div className="pt-2 border-t border-linen-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center font-mono">
                      <div className="p-2.5 bg-linen-50 rounded-xl border border-linen-200">
                        <span className="text-[9px] text-charcoal-400 block">TOTAL VISITS</span>
                        <span className="font-serif text-lg font-bold text-charcoal-900">
                          {trial.patient_burden_summary.total_study_visits}
                        </span>
                        <span className="text-[9px] text-charcoal-500 block">Over 52 Weeks</span>
                      </div>

                      <div className="p-2.5 bg-linen-50 rounded-xl border border-linen-200">
                        <span className="text-[9px] text-charcoal-400 block">CLINIC DWELL</span>
                        <span className="font-serif text-lg font-bold text-charcoal-900">
                          {Math.round(trial.patient_burden_summary.total_clinic_hours)}h
                        </span>
                        <span className="text-[9px] text-charcoal-500 block">Cumulative Care</span>
                      </div>

                      <div className="p-2.5 bg-linen-50 rounded-xl border border-linen-200">
                        <span className="text-[9px] text-charcoal-400 block">TRAVEL MILES</span>
                        <span className="font-serif text-lg font-bold text-charcoal-900">
                          {trial.patient_burden_summary.travel_distance_miles} mi
                        </span>
                        <span className="text-[9px] text-charcoal-500 block">Per Visit</span>
                      </div>

                      <div className="p-2.5 bg-linen-50 rounded-xl border border-linen-200">
                        <span className="text-[9px] text-charcoal-400 block">VIRTUAL VISITS</span>
                        <span className="font-serif text-lg font-bold text-sage-700">
                          {trial.patient_burden_summary.telehealth_eligible_visits}
                        </span>
                        <span className="text-[9px] text-sage-600 block">Telehealth Options</span>
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="pt-2 flex items-center justify-between">
                      <span className="text-[11px] text-charcoal-500 font-mono">
                        {isEligible
                          ? '✓ Ready for study coordinator contact'
                          : isBorderline
                          ? '⚡ Sponsor investigator amendment review recommended'
                          : 'Not actively enrolling for current clinical profile'}
                      </span>

                      {isEnrolled ? (
                        <span className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-sage-600 text-white shadow-xs">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Interest Registered with Site Coordinator</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => handleExpressInterest(trial.protocol_id)}
                          className={`inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                            isEligible || isBorderline
                              ? 'bg-charcoal-900 hover:bg-charcoal-800 text-white shadow-xs'
                              : 'bg-linen-200 text-charcoal-400 cursor-not-allowed'
                          }`}
                          disabled={!isEligible && !isBorderline}
                        >
                          <span>Express Interest in Study</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Investigator Clinical Review Disclaimer */}
                    {trial.investigator_disclaimer && (
                      <div className="p-2.5 rounded-xl bg-linen-100/60 border border-linen-200 text-[10px] text-charcoal-500 flex items-center space-x-2">
                        <AlertCircle className="h-3.5 w-3.5 text-charcoal-400 shrink-0" />
                        <span>{trial.investigator_disclaimer}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};
