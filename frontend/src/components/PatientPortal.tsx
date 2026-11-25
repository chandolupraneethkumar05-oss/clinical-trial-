import { useState, useEffect, useRef } from 'react';
import type { FC } from 'react';
import type { AuthUser } from '../types/auth';
import { UserMenu } from './UserMenu';
import {
  apiFetchJson,
  apiUrl,
  extractApiErrorMessage,
  parseJsonSafe,
  SessionExpiredError,
} from '../lib/api';
import {
  HeartHandshake,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Sparkles,
  Sliders,
  RefreshCw,
  ArrowLeft,
  XCircle,
  FileCheck2,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
} from 'lucide-react';

interface PatientPortalProps {
  user: AuthUser;
  onSignOut: () => void;
  onSwitchPersona: () => void;
  onOpenAuth: () => void;
  onSessionExpired?: () => void;
  onBackToLanding?: () => void;
}

export interface CriterionCheck {
  criterion: string;
  category: string;
  status?: 'PASS' | 'FAIL' | 'UNKNOWN' | 'NEEDS_INVESTIGATOR_REVIEW';
  passed: boolean;
  patient_value: string;
  required_threshold: string;
  impact_note: string;
  is_hard_rule?: boolean;
  is_mandatory?: boolean;
}

export interface TrialMatch {
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
    study_duration_weeks?: number;
    total_clinic_hours: number;
    travel_distance_miles: number | null;
    telehealth_eligible_visits: number;
  };
  investigator_confirmation_required?: boolean;
  investigator_disclaimer?: string;
}

export interface ClinicalProfile {
  age: number | null;
  cancer_stage: string | null;
  ecog_score: number | null;
  egfr_ml_min: number | null;
  distance_to_center_miles: number | null;
  has_active_brain_mets: boolean | null;
  has_stable_brain_mets: boolean | null;
  has_active_autoimmune: boolean | null;
  has_egfr_sensitizing_mutation: boolean | null;
  anc: number | null;
  platelets: number | null;
  hemoglobin: number | null;
  total_bilirubin: number | null;
  alt_u_l: number | null;
  prior_lines: number | null;
  pdl1_tps_percent: number | null;
}

const EMPTY_CLINICAL_PROFILE: ClinicalProfile = {
  age: null,
  cancer_stage: null,
  ecog_score: null,
  egfr_ml_min: null,
  distance_to_center_miles: null,
  has_active_brain_mets: null,
  has_stable_brain_mets: null,
  has_active_autoimmune: null,
  has_egfr_sensitizing_mutation: null,
  anc: null,
  platelets: null,
  hemoglobin: null,
  total_bilirubin: null,
  alt_u_l: null,
  prior_lines: null,
  pdl1_tps_percent: null,
};

const SYNTHETIC_DEMO_PROFILE: ClinicalProfile = {
  age: 62,
  cancer_stage: 'Stage IV (Oligometastatic)',
  ecog_score: 1,
  egfr_ml_min: 52.0,
  distance_to_center_miles: 24.0,
  has_active_brain_mets: false,
  has_stable_brain_mets: true,
  has_active_autoimmune: false,
  has_egfr_sensitizing_mutation: false,
  anc: 1850.0,
  platelets: 165.0,
  hemoglobin: 11.4,
  total_bilirubin: 1.1,
  alt_u_l: 32.0,
  prior_lines: 0,
  pdl1_tps_percent: 45.0,
};

function parseNullableNumber(raw: string): number | null {
  if (raw.trim() === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function triStateToSelectValue(val: boolean | null): '' | 'true' | 'false' {
  if (val === true) return 'true';
  if (val === false) return 'false';
  return '';
}

function selectValueToTriState(raw: string): boolean | null {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return null;
}

function formatProvenanceBadge(provenance: string | null): {
  label: string;
  description: string;
  badgeClass: string;
  isUnverified: boolean;
} {
  switch (provenance) {
    case 'investigator_verified':
      return {
        label: 'Investigator-Verified Clinical Record',
        description: 'Submitted through an authorized clinical investigator workflow.',
        badgeClass: 'bg-sage-100 text-sage-800 border-sage-300',
        isUnverified: false,
      };
    case 'synthetic_demo':
      return {
        label: 'Synthetic Demo Profile — Not Real Clinical Data',
        description: 'Pre-populated demonstration values for simulator walkthroughs only.',
        badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
        isUnverified: true,
      };
    case 'patient_reported':
      return {
        label: 'Patient-Reported (Unverified by Investigator)',
        description: 'Self-reported parameters have not been clinically verified against medical records.',
        badgeClass: 'bg-blue-100 text-blue-900 border-blue-300',
        isUnverified: true,
      };
    default:
      return {
        label: 'Unknown Provenance (Unverified)',
        description: 'Clinical provenance could not be verified.',
        badgeClass: 'bg-linen-200 text-charcoal-800 border-linen-300',
        isUnverified: true,
      };
  }
}

export const PatientPortal: FC<PatientPortalProps> = ({
  user,
  onSignOut,
  onSwitchPersona,
  onOpenAuth,
  onSessionExpired,
  onBackToLanding,
}) => {
  // Clinical Profile state - initialized without invented clinical values
  const [profile, setProfile] = useState<ClinicalProfile>(EMPTY_CLINICAL_PROFILE);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [showAdvancedLabs, setShowAdvancedLabs] = useState<boolean>(false);

  // Screening Execution & Error State
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [screeningError, setScreeningError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [matches, setMatches] = useState<TrialMatch[] | null>(null);
  const [summary, setSummary] = useState<string>('');
  const [responseProvenance, setResponseProvenance] = useState<string | null>(null);
  const [isResultStale, setIsResultStale] = useState<boolean>(false);

  // Interest registration state
  const [enrolledTrialIds, setEnrolledTrialIds] = useState<Set<string>>(new Set());
  const [submittingInterestId, setSubmittingInterestId] = useState<string | null>(null);
  const [interestError, setInterestError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef<boolean>(true);

  const updateProfile = (updater: (prev: ClinicalProfile) => ClinicalProfile) => {
    setProfile(updater);
    setValidationError(null);
    if (matches !== null) {
      setIsResultStale(true);
    }
  };

  // Fetch persisted interests on mount
  useEffect(() => {
    isMountedRef.current = true;
    const controller = new AbortController();

    async function loadInterests() {
      if (!user.token) return;
      try {
        const data = await apiFetchJson<Array<{ protocol_id: string }>>('/api/v1/patient/interests', {
          headers: { Authorization: `Bearer ${user.token}` },
          signal: controller.signal,
          onUnauthorized: onSessionExpired,
        });
        if (isMountedRef.current && Array.isArray(data)) {
          setEnrolledTrialIds(new Set(data.map((d) => d.protocol_id)));
        }
      } catch (e) {
        if (e instanceof Error && (e.name === 'AbortError' || e instanceof SessionExpiredError)) return;
        console.warn('Could not load existing interests', e);
      }
    }
    loadInterests();

    return () => {
      isMountedRef.current = false;
      controller.abort();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [user.token, onSessionExpired]);

  // Express interest in study
  const handleExpressInterest = async (protocolId: string) => {
    if (submittingInterestId) return;
    setInterestError(null);
    setSubmittingInterestId(protocolId);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (user.token) {
        headers['Authorization'] = `Bearer ${user.token}`;
      }
      await apiFetchJson('/api/v1/patient/interest', {
        method: 'POST',
        headers,
        body: JSON.stringify({ protocol_id: protocolId }),
        onUnauthorized: onSessionExpired,
      });
      if (isMountedRef.current) {
        setEnrolledTrialIds((prev) => new Set([...prev, protocolId]));
      }
    } catch (err) {
      if (err instanceof SessionExpiredError) return;
      if (isMountedRef.current) {
        setInterestError(
          err instanceof Error ? err.message : 'Unable to register interest right now. Please try again.'
        );
      }
    } finally {
      if (isMountedRef.current) {
        setSubmittingInterestId(null);
      }
    }
  };

  // Switch between blank clinical profile and synthetic demo profile
  const handleToggleDemoMode = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setMatches(null);
    setSummary('');
    setResponseProvenance(null);
    setIsResultStale(false);
    setValidationError(null);
    setScreeningError(null);
    setInterestError(null);

    if (isDemoMode) {
      setIsDemoMode(false);
      setProfile(EMPTY_CLINICAL_PROFILE);
    } else {
      setIsDemoMode(true);
      setProfile(SYNTHETIC_DEMO_PROFILE);
    }
  };

  const handleResetProfile = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setProfile(EMPTY_CLINICAL_PROFILE);
    setIsDemoMode(false);
    setMatches(null);
    setSummary('');
    setResponseProvenance(null);
    setIsResultStale(false);
    setValidationError(null);
    setScreeningError(null);
    setInterestError(null);
  };

  // Validate numeric fields cleanly before sending
  const validateProfileInputs = (): string[] => {
    const errors: string[] = [];

    if (profile.age === null) {
      errors.push('Age (18–95 years) is required');
    } else if (!Number.isFinite(profile.age) || !Number.isInteger(profile.age) || profile.age < 18 || profile.age > 95) {
      errors.push('Age must be a whole number between 18 and 95');
    }

    if (!profile.cancer_stage || !profile.cancer_stage.trim()) {
      errors.push('Cancer Stage is required');
    }

    if (profile.ecog_score === null) {
      errors.push('ECOG Performance Status (0–4) is required');
    } else if (!Number.isInteger(profile.ecog_score) || profile.ecog_score < 0 || profile.ecog_score > 4) {
      errors.push('ECOG Performance Status must be between 0 and 4');
    }

    if (profile.egfr_ml_min === null) {
      errors.push('Kidney Function (eGFR) is required');
    } else if (!Number.isFinite(profile.egfr_ml_min) || profile.egfr_ml_min < 10 || profile.egfr_ml_min > 150) {
      errors.push('Kidney eGFR must be between 10 and 150 mL/min');
    }

    // Optional numeric fields (validated only if provided)
    if (profile.distance_to_center_miles !== null && (!Number.isFinite(profile.distance_to_center_miles) || profile.distance_to_center_miles < 1 || profile.distance_to_center_miles > 500)) {
      errors.push('Distance to Hospital must be between 1 and 500 miles');
    }
    if (profile.anc !== null && (!Number.isFinite(profile.anc) || profile.anc < 100 || profile.anc > 100000)) {
      errors.push('ANC must be between 100 and 100,000 cells/µL');
    }
    if (profile.platelets !== null && (!Number.isFinite(profile.platelets) || profile.platelets < 10 || profile.platelets > 5000)) {
      errors.push('Platelets must be between 10 and 5,000 x10³/µL');
    }
    if (profile.hemoglobin !== null && (!Number.isFinite(profile.hemoglobin) || profile.hemoglobin < 5 || profile.hemoglobin > 25)) {
      errors.push('Hemoglobin must be between 5 and 25 g/dL');
    }
    if (profile.total_bilirubin !== null && (!Number.isFinite(profile.total_bilirubin) || profile.total_bilirubin < 0.1 || profile.total_bilirubin > 20)) {
      errors.push('Total Bilirubin must be between 0.1 and 20 mg/dL');
    }
    if (profile.alt_u_l !== null && (!Number.isFinite(profile.alt_u_l) || profile.alt_u_l < 5 || profile.alt_u_l > 2000)) {
      errors.push('ALT must be between 5 and 2,000 U/L');
    }
    if (profile.prior_lines !== null && (!Number.isFinite(profile.prior_lines) || !Number.isInteger(profile.prior_lines) || profile.prior_lines < 0 || profile.prior_lines > 10)) {
      errors.push('Prior lines of therapy must be a whole number between 0 and 10');
    }
    if (profile.pdl1_tps_percent !== null && (!Number.isFinite(profile.pdl1_tps_percent) || profile.pdl1_tps_percent < 0 || profile.pdl1_tps_percent > 100)) {
      errors.push('PD-L1 TPS must be between 0% and 100%');
    }

    return errors;
  };

  // Perform Clinical Eligibility Screening
  const handleRunScreening = async () => {
    setValidationError(null);
    setScreeningError(null);
    setInterestError(null);

    const validationErrors = validateProfileInputs();
    if (validationErrors.length > 0) {
      setValidationError(`Please fix the following clinical inputs before screening: ${validationErrors.join('; ')}.`);
      return;
    }

    // Cancel any previous in-flight request to prevent race conditions
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Reset stale results state prior to new request
    setIsLoading(true);
    setMatches(null);
    setSummary('');
    setResponseProvenance(null);
    setIsResultStale(false);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (user.token) {
        headers['Authorization'] = `Bearer ${user.token}`;
      }

      // Build payload containing ONLY explicitly provided values (missing values remain null/omitted)
      // Never assert 'verified_clinical' from the frontend portal.
      const payload: Record<string, unknown> = {
        patient_id: user.id || 'PT-VOLUNTEER',
        is_demo_profile: isDemoMode,
        data_provenance: isDemoMode ? 'synthetic_demo' : 'patient_reported',
        age: profile.age,
        cancer_stage: profile.cancer_stage,
        ecog_score: profile.ecog_score,
        egfr_ml_min: profile.egfr_ml_min,
      };

      if (profile.distance_to_center_miles !== null) payload.distance_to_center_miles = profile.distance_to_center_miles;
      if (profile.has_active_brain_mets !== null) payload.has_active_brain_mets = profile.has_active_brain_mets;
      if (profile.has_stable_brain_mets !== null) payload.has_stable_brain_mets = profile.has_stable_brain_mets;
      if (profile.has_active_autoimmune !== null) payload.has_active_autoimmune = profile.has_active_autoimmune;
      if (profile.has_egfr_sensitizing_mutation !== null) {
        payload.has_egfr_sensitizing_mutation = profile.has_egfr_sensitizing_mutation;
      }
      if (profile.anc !== null) payload.anc = profile.anc;
      if (profile.platelets !== null) payload.platelets = profile.platelets;
      if (profile.hemoglobin !== null) payload.hemoglobin = profile.hemoglobin;
      if (profile.total_bilirubin !== null) payload.total_bilirubin = profile.total_bilirubin;
      if (profile.alt_u_l !== null) payload.alt_u_l = profile.alt_u_l;
      if (profile.prior_lines !== null) payload.prior_lines = profile.prior_lines;
      if (profile.pdl1_tps_percent !== null) payload.pdl1_tps_percent = profile.pdl1_tps_percent;

      const res = await fetch(apiUrl('/api/v1/patient/screen-eligibility'), {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (controller.signal.aborted || !isMountedRef.current || abortControllerRef.current !== controller) {
        return;
      }

      if (res.status === 401) {
        onSessionExpired?.();
        throw new SessionExpiredError();
      }

      const rawData = await parseJsonSafe(res);
      if (controller.signal.aborted || !isMountedRef.current || abortControllerRef.current !== controller) {
        return;
      }

      if (!res.ok) {
        throw new Error(extractApiErrorMessage(rawData, `Screening service returned HTTP ${res.status}.`));
      }

      const data = rawData as {
        matches?: TrialMatch[];
        recruitment_support_summary?: string;
        data_provenance?: string;
      } | null;

      if (!data || !Array.isArray(data.matches)) {
        throw new Error('Received an unexpected response structure from the screening engine.');
      }

      setMatches(data.matches);
      setSummary(data.recruitment_support_summary || '');
      setResponseProvenance(data.data_provenance || (isDemoMode ? 'synthetic_demo' : 'patient_reported'));
      setIsResultStale(false);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      if (!isMountedRef.current || abortControllerRef.current !== controller) {
        return;
      }
      if (err instanceof SessionExpiredError) {
        return;
      }
      setMatches(null);
      setResponseProvenance(null);
      setScreeningError(
        err instanceof Error ? err.message : 'Unable to complete protocol screening. Please verify your connection.'
      );
    } finally {
      if (isMountedRef.current && abortControllerRef.current === controller) {
        setIsLoading(false);
      }
    }
  };

  const missingOptionalFields: string[] = [];
  if (profile.has_active_brain_mets === null || profile.has_stable_brain_mets === null) {
    missingOptionalFields.push('CNS Metastases History');
  }
  if (profile.has_active_autoimmune === null) missingOptionalFields.push('Autoimmune History');
  if (profile.has_egfr_sensitizing_mutation === null) missingOptionalFields.push('EGFR Mutation Status');
  if (profile.anc === null || profile.platelets === null || profile.hemoglobin === null || profile.total_bilirubin === null || profile.alt_u_l === null) {
    missingOptionalFields.push('Laboratory Values');
  }

  const provenanceInfo = responseProvenance ? formatProvenanceBadge(responseProvenance) : null;

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
                  Patient-Reported (Unverified)
                </span>
                {isDemoMode && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-300">
                    Synthetic Demo Patient
                  </span>
                )}
              </div>
              <span className="text-[11px] text-charcoal-500 font-mono">
                Clinical Trial Eligibility & Visit Burden Evaluator
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {onBackToLanding && (
              <button
                type="button"
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
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        
        {/* Welcome Banner */}
        <div className="bg-white rounded-3xl border border-linen-300 p-6 sm:p-8 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-blue-600 font-bold block">
              PATIENT RECRUITMENT & ELIGIBILITY SUPPORT SUITE
            </span>
            <h1 className="font-serif text-2xl sm:text-3xl text-charcoal-900 font-bold">
              Welcome, {user.name}
            </h1>
            <p className="text-xs sm:text-sm text-charcoal-600 max-w-2xl leading-relaxed">
              Enter your clinical details below to evaluate preliminary matches against active study protocols. Any unprovided fields remain unknown and are flagged for investigator verification rather than assumed negative.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              type="button"
              onClick={handleToggleDemoMode}
              className={`px-4 py-2 rounded-2xl text-xs font-semibold font-mono border transition-all cursor-pointer ${
                isDemoMode
                  ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                  : 'bg-linen-100 text-charcoal-800 border-linen-300 hover:bg-linen-200'
              }`}
            >
              {isDemoMode ? 'Clear Demo Patient' : 'Load Demo Patient Profile'}
            </button>
          </div>
        </div>

        {/* Demo Mode Notice */}
        {isDemoMode && (
          <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-300 text-xs text-amber-900 flex items-start space-x-3 shadow-2xs">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-serif font-bold text-xs text-amber-950 block">
                Synthetic Demo Patient Profile Active — Not Real Clinical Data
              </span>
              <p className="text-[11px] leading-relaxed text-amber-800">
                You are viewing a demonstration profile populated with synthetic observations (Age 62, Stage IV, eGFR 52). This profile is provided for demonstration and planning purposes only and does not represent a real patient or verified medical record.
              </p>
            </div>
          </div>
        )}

        {/* Clinical Safety Notice */}
        <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 text-xs text-blue-900 flex items-start space-x-3 shadow-2xs">
          <HelpCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-serif font-bold text-xs text-blue-950 block">
              Clinical Safety & Data Provenance Notice
            </span>
            <p className="text-[11px] leading-relaxed text-blue-800">
              Self-submitted entries are recorded as unverified patient-reported data until reviewed by a licensed clinical investigator. This preliminary screening simulator does not constitute medical advice, diagnosis, or a binding enrollment decision.
            </p>
          </div>
        </div>

        {/* Two-Column Grid: Left Controls / Right Matches */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Patient Profile Form */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white rounded-3xl border border-linen-300 p-6 shadow-xs space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-linen-200">
                <div className="flex items-center space-x-2">
                  <Sliders className="h-4 w-4 text-blue-600" />
                  <h3 className="font-serif font-bold text-sm text-charcoal-900">
                    Clinical Parameters
                  </h3>
                </div>
                {(profile.age !== null || profile.cancer_stage !== null || profile.ecog_score !== null || profile.egfr_ml_min !== null) && (
                  <button
                    type="button"
                    onClick={handleResetProfile}
                    className="text-[10px] font-mono text-charcoal-400 hover:text-charcoal-700 underline cursor-pointer"
                  >
                    Reset Form
                  </button>
                )}
              </div>

              {/* Validation Warning */}
              {validationError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start space-x-2">
                  <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <span className="leading-snug">{validationError}</span>
                </div>
              )}

              {/* Age Input */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="patient-age" className="text-charcoal-700 font-medium">Age (Years) *</label>
                  <span className="font-mono font-bold text-charcoal-900">
                    {profile.age !== null && Number.isFinite(profile.age) ? `${profile.age} years` : 'Required'}
                  </span>
                </div>
                <input
                  id="patient-age"
                  type="number"
                  min="18"
                  max="95"
                  placeholder="e.g. 58"
                  value={profile.age !== null && Number.isFinite(profile.age) ? profile.age : ''}
                  onChange={(e) => {
                    const val = parseNullableNumber(e.target.value);
                    updateProfile((p) => ({ ...p, age: val }));
                  }}
                  className="w-full p-2 text-xs bg-linen-50 border border-linen-300 rounded-xl focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              {/* Cancer Stage */}
              <div className="space-y-1">
                <label htmlFor="patient-stage" className="text-xs font-medium text-charcoal-700 block">
                  Cancer Stage *
                </label>
                <select
                  id="patient-stage"
                  value={profile.cancer_stage ?? ''}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : e.target.value;
                    updateProfile((p) => ({ ...p, cancer_stage: val }));
                  }}
                  className="w-full p-2 text-xs bg-linen-50 border border-linen-300 rounded-xl focus:outline-none focus:border-blue-500 font-mono"
                >
                  <option value="">Select cancer stage…</option>
                  <option value="Stage IV (Oligometastatic)">Stage IV (Oligometastatic)</option>
                  <option value="Stage IV (Polymetastatic)">Stage IV (Polymetastatic)</option>
                  <option value="Stage IIIB">Stage IIIB (Locally Advanced)</option>
                  <option value="Stage IIIC">Stage IIIC (Locally Advanced)</option>
                  <option value="Stage II">Stage II (Early / Resectable)</option>
                </select>
              </div>

              {/* Renal eGFR Input */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="patient-egfr" className="text-charcoal-700 font-medium">Kidney eGFR (mL/min) *</label>
                  <span className={`font-mono font-bold ${
                    profile.egfr_ml_min === null || !Number.isFinite(profile.egfr_ml_min) ? 'text-charcoal-400' :
                    profile.egfr_ml_min >= 60 ? 'text-sage-700' :
                    profile.egfr_ml_min >= 50 ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {profile.egfr_ml_min !== null && Number.isFinite(profile.egfr_ml_min)
                      ? `${profile.egfr_ml_min} mL/min`
                      : 'Required'}
                  </span>
                </div>
                <input
                  id="patient-egfr"
                  type="number"
                  min="10"
                  max="150"
                  step="1"
                  placeholder="e.g. 65"
                  value={profile.egfr_ml_min !== null && Number.isFinite(profile.egfr_ml_min) ? profile.egfr_ml_min : ''}
                  onChange={(e) => {
                    const val = parseNullableNumber(e.target.value);
                    updateProfile((p) => ({ ...p, egfr_ml_min: val }));
                  }}
                  className="w-full p-2 text-xs bg-linen-50 border border-linen-300 rounded-xl focus:outline-none focus:border-blue-500 font-mono"
                />
                <span className="text-[10px] text-charcoal-500 font-mono block">
                  {profile.egfr_ml_min !== null && Number.isFinite(profile.egfr_ml_min) && profile.egfr_ml_min < 60 && profile.egfr_ml_min >= 50
                    ? 'Borderline clearance (50–59 mL/min).'
                    : profile.egfr_ml_min !== null && Number.isFinite(profile.egfr_ml_min) && profile.egfr_ml_min >= 60
                    ? 'Standard renal clearance threshold met.'
                    : profile.egfr_ml_min !== null && Number.isFinite(profile.egfr_ml_min)
                    ? 'Low renal clearance (< 50 mL/min).'
                    : 'Standard trials typically require eGFR ≥ 50 or 60 mL/min.'}
                </span>
              </div>

              {/* ECOG Score */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-charcoal-700 block">
                  ECOG Performance Status *
                </label>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  {[0, 1, 2].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => updateProfile((p) => ({ ...p, ecog_score: s }))}
                      className={`p-2 rounded-xl border transition-all cursor-pointer ${
                        profile.ecog_score === s
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

              {/* Distance to Hospital */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="patient-distance" className="text-charcoal-700 font-medium">Distance to Hospital</label>
                  <span className="font-mono font-bold text-charcoal-900">
                    {profile.distance_to_center_miles !== null && Number.isFinite(profile.distance_to_center_miles)
                      ? `${profile.distance_to_center_miles} mi`
                      : 'Optional'}
                  </span>
                </div>
                <input
                  id="patient-distance"
                  type="number"
                  min="1"
                  max="500"
                  placeholder="Optional (e.g. 25)"
                  value={profile.distance_to_center_miles !== null && Number.isFinite(profile.distance_to_center_miles) ? profile.distance_to_center_miles : ''}
                  onChange={(e) => {
                    const val = parseNullableNumber(e.target.value);
                    updateProfile((p) => ({ ...p, distance_to_center_miles: val }));
                  }}
                  className="w-full p-2 text-xs bg-linen-50 border border-linen-300 rounded-xl focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              {/* CNS Metastases (3-state explicit selection — never defaults missing to false) */}
              <div className="space-y-2.5 pt-2 border-t border-linen-200">
                <span className="text-[11px] font-semibold text-charcoal-800 block">
                  CNS & Safety History (Leave "Not Provided" if Unknown)
                </span>

                <div className="space-y-1">
                  <label htmlFor="active-cns-select" className="text-[11px] text-charcoal-700 block">
                    Untreated / Active Brain Metastases
                  </label>
                  <select
                    id="active-cns-select"
                    value={triStateToSelectValue(profile.has_active_brain_mets)}
                    onChange={(e) =>
                      updateProfile((p) => ({ ...p, has_active_brain_mets: selectValueToTriState(e.target.value) }))
                    }
                    className="w-full p-1.5 text-xs bg-linen-50 border border-linen-300 rounded-xl font-mono"
                  >
                    <option value="">Unknown / Not Provided</option>
                    <option value="false">No — Confirmed No Active Brain Mets</option>
                    <option value="true">Yes — Active / Untreated Brain Mets</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="stable-cns-select" className="text-[11px] text-charcoal-700 block">
                    Treated & Stable Brain Metastases
                  </label>
                  <select
                    id="stable-cns-select"
                    value={triStateToSelectValue(profile.has_stable_brain_mets)}
                    onChange={(e) =>
                      updateProfile((p) => ({ ...p, has_stable_brain_mets: selectValueToTriState(e.target.value) }))
                    }
                    className="w-full p-1.5 text-xs bg-linen-50 border border-linen-300 rounded-xl font-mono"
                  >
                    <option value="">Unknown / Not Provided</option>
                    <option value="false">No — Confirmed No Stable Brain Mets</option>
                    <option value="true">Yes — Treated & Radiographically Stable</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="autoimmune-select" className="text-[11px] text-charcoal-700 block">
                    Active Autoimmune Disease
                  </label>
                  <select
                    id="autoimmune-select"
                    value={triStateToSelectValue(profile.has_active_autoimmune)}
                    onChange={(e) =>
                      updateProfile((p) => ({ ...p, has_active_autoimmune: selectValueToTriState(e.target.value) }))
                    }
                    className="w-full p-1.5 text-xs bg-linen-50 border border-linen-300 rounded-xl font-mono"
                  >
                    <option value="">Unknown / Not Provided</option>
                    <option value="false">No — Confirmed No Active Autoimmune</option>
                    <option value="true">Yes — Active Autoimmune Disease</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="egfr-mut-select" className="text-[11px] text-charcoal-700 block">
                    EGFR Sensitizing Mutation (Ex19del / L858R)
                  </label>
                  <select
                    id="egfr-mut-select"
                    value={triStateToSelectValue(profile.has_egfr_sensitizing_mutation)}
                    onChange={(e) =>
                      updateProfile((p) => ({
                        ...p,
                        has_egfr_sensitizing_mutation: selectValueToTriState(e.target.value),
                      }))
                    }
                    className="w-full p-1.5 text-xs bg-linen-50 border border-linen-300 rounded-xl font-mono"
                  >
                    <option value="">Unknown / Not Provided</option>
                    <option value="false">No — Confirmed Negative (Wild-Type)</option>
                    <option value="true">Yes — Confirmed EGFR Mutation Positive</option>
                  </select>
                </div>
              </div>

              {/* Advanced Lab Biomarkers Accordion */}
              <div className="pt-2 border-t border-linen-200">
                <button
                  type="button"
                  onClick={() => setShowAdvancedLabs(!showAdvancedLabs)}
                  className="w-full flex items-center justify-between text-xs text-charcoal-600 font-medium hover:text-charcoal-900 cursor-pointer"
                >
                  <span>Additional Clinical Labs & History (Optional)</span>
                  {showAdvancedLabs ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>

                {showAdvancedLabs && (
                  <div className="pt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-charcoal-500 block">ANC (cells/µL)</label>
                        <input
                          type="number"
                          placeholder="Not provided"
                          value={profile.anc !== null && Number.isFinite(profile.anc) ? profile.anc : ''}
                          onChange={(e) => updateProfile((p) => ({ ...p, anc: parseNullableNumber(e.target.value) }))}
                          className="w-full p-1.5 text-xs bg-linen-50 border border-linen-300 rounded-lg font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-charcoal-500 block">Platelets (x10³/µL)</label>
                        <input
                          type="number"
                          placeholder="Not provided"
                          value={profile.platelets !== null && Number.isFinite(profile.platelets) ? profile.platelets : ''}
                          onChange={(e) => updateProfile((p) => ({ ...p, platelets: parseNullableNumber(e.target.value) }))}
                          className="w-full p-1.5 text-xs bg-linen-50 border border-linen-300 rounded-lg font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-charcoal-500 block">Hemoglobin (g/dL)</label>
                        <input
                          type="number"
                          step="0.1"
                          placeholder="Not provided"
                          value={profile.hemoglobin !== null && Number.isFinite(profile.hemoglobin) ? profile.hemoglobin : ''}
                          onChange={(e) => updateProfile((p) => ({ ...p, hemoglobin: parseNullableNumber(e.target.value) }))}
                          className="w-full p-1.5 text-xs bg-linen-50 border border-linen-300 rounded-lg font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-charcoal-500 block">Bilirubin (mg/dL)</label>
                        <input
                          type="number"
                          step="0.1"
                          placeholder="Not provided"
                          value={profile.total_bilirubin !== null && Number.isFinite(profile.total_bilirubin) ? profile.total_bilirubin : ''}
                          onChange={(e) => updateProfile((p) => ({ ...p, total_bilirubin: parseNullableNumber(e.target.value) }))}
                          className="w-full p-1.5 text-xs bg-linen-50 border border-linen-300 rounded-lg font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] text-charcoal-500 block">ALT (U/L)</label>
                        <input
                          type="number"
                          placeholder="Not provided"
                          value={profile.alt_u_l !== null && Number.isFinite(profile.alt_u_l) ? profile.alt_u_l : ''}
                          onChange={(e) => updateProfile((p) => ({ ...p, alt_u_l: parseNullableNumber(e.target.value) }))}
                          className="w-full p-1.5 text-xs bg-linen-50 border border-linen-300 rounded-lg font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-charcoal-500 block">Prior Lines</label>
                        <input
                          type="number"
                          min="0"
                          max="10"
                          placeholder="Not provided"
                          value={profile.prior_lines !== null && Number.isFinite(profile.prior_lines) ? profile.prior_lines : ''}
                          onChange={(e) => updateProfile((p) => ({ ...p, prior_lines: parseNullableNumber(e.target.value) }))}
                          className="w-full p-1.5 text-xs bg-linen-50 border border-linen-300 rounded-lg font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-charcoal-500 block">PD-L1 TPS %</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          placeholder="Optional"
                          value={profile.pdl1_tps_percent !== null && Number.isFinite(profile.pdl1_tps_percent) ? profile.pdl1_tps_percent : ''}
                          onChange={(e) => updateProfile((p) => ({ ...p, pdl1_tps_percent: parseNullableNumber(e.target.value) }))}
                          className="w-full p-1.5 text-xs bg-linen-50 border border-linen-300 rounded-lg font-mono"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {missingOptionalFields.length > 0 && (
                <div className="p-2.5 rounded-xl bg-linen-100 border border-linen-200 text-[10px] text-charcoal-600 font-mono">
                  <strong className="text-charcoal-800">Unprovided optional fields:</strong>{' '}
                  {missingOptionalFields.join(', ')}. These will be evaluated as Unknown / Investigator Review Required.
                </div>
              )}

              {/* Primary Action Button */}
              <button
                type="button"
                onClick={handleRunScreening}
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Evaluating Protocol Eligibility…</span>
                  </>
                ) : (
                  <>
                    <FileCheck2 className="h-4 w-4" />
                    <span>Run Eligibility Screening</span>
                  </>
                )}
              </button>

            </div>
          </div>

          {/* Right Column: Trial Match Results Cards */}
          <div className="lg:col-span-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="font-serif font-bold text-lg text-charcoal-900">
                  Evaluated Trial Portfolio
                </h2>
                <p className="text-xs text-charcoal-500 font-mono mt-0.5">
                  {summary || 'Complete required clinical parameters on the left to screen trials.'}
                </p>
              </div>
              {provenanceInfo && (
                <span className={`px-3 py-1 rounded-full text-[10px] font-mono font-bold border self-start ${provenanceInfo.badgeClass}`}>
                  {provenanceInfo.label}
                </span>
              )}
            </div>

            {provenanceInfo && provenanceInfo.isUnverified && (
              <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200 text-[11px] text-amber-900 flex items-start space-x-2">
                <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Data Provenance Notice ({provenanceInfo.label}):</strong> {provenanceInfo.description}
                </span>
              </div>
            )}

            {isResultStale && matches !== null && (
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-300 text-xs text-amber-900 flex items-center justify-between">
                <span>Clinical parameters were modified after this evaluation. Re-run screening to refresh results.</span>
                <button
                  type="button"
                  onClick={handleRunScreening}
                  className="px-3 py-1 rounded-lg bg-amber-700 text-white text-[11px] font-semibold hover:bg-amber-800 cursor-pointer ml-3 shrink-0"
                >
                  Re-run Now
                </button>
              </div>
            )}

            {interestError && (
              <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center justify-between">
                <span>{interestError}</span>
                <button
                  type="button"
                  onClick={() => setInterestError(null)}
                  className="text-red-600 font-semibold ml-3 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Error Banner */}
            {screeningError && (
              <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-800 space-y-2">
                <div className="flex items-center space-x-2 font-semibold">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <span>Screening Service Error</span>
                </div>
                <p className="text-red-700">{screeningError}</p>
                <button
                  type="button"
                  onClick={handleRunScreening}
                  className="px-3 py-1 bg-red-600 text-white text-[11px] rounded-lg font-semibold hover:bg-red-700 cursor-pointer"
                >
                  Retry Screening
                </button>
              </div>
            )}

            {/* Loading State */}
            {isLoading && (
              <div className="bg-white rounded-3xl border border-linen-300 p-12 text-center space-y-3 shadow-xs">
                <RefreshCw className="h-7 w-7 text-blue-600 animate-spin mx-auto" />
                <h3 className="font-serif font-bold text-base text-charcoal-900">
                  Evaluating Clinical Phenotype Against Active Protocols
                </h3>
                <p className="text-xs text-charcoal-500 max-w-md mx-auto">
                  Performing deterministic 4-state criterion matching against canonical oncology protocols and uploaded clinical trial documents.
                </p>
              </div>
            )}

            {/* Empty State before screening */}
            {!isLoading && !screeningError && matches === null && (
              <div className="bg-white rounded-3xl border border-linen-300 p-12 text-center space-y-4 shadow-xs">
                <div className="h-12 w-12 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center mx-auto">
                  <Sliders className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-serif font-bold text-base text-charcoal-900">
                    No Screening Performed Yet
                  </h3>
                  <p className="text-xs text-charcoal-500 max-w-md mx-auto leading-relaxed">
                    Provide patient parameters (Age, Cancer Stage, ECOG score, and Kidney eGFR) on the left panel, or click <strong>"Load Demo Patient Profile"</strong> to evaluate a synthetic scenario.
                  </p>
                </div>
              </div>
            )}

            {/* Evaluated Matches List */}
            {!isLoading && matches !== null && (
              <div className="space-y-5">
                {matches.map((trial) => {
                  const isEligible = trial.match_status === 'POTENTIALLY_ELIGIBLE' || trial.match_status === 'ELIGIBLE';
                  const isBorderline = trial.match_status === 'REQUIRES_REVIEW' || trial.match_status === 'BORDERLINE';
                  const isEnrolled = enrolledTrialIds.has(trial.protocol_id);
                  const isSubmittingThis = submittingInterestId === trial.protocol_id;

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
                            {isEligible ? '✓ Potentially Eligible' : isBorderline ? '⚡ Needs Investigator Review' : '✕ Not Eligible'}
                          </span>
                        </div>
                      </div>

                      {/* Criteria Status Breakdown */}
                      <div className="space-y-2">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-400 block">
                          Eligibility Criteria Breakdown ({trial.passed_criteria_count} of {trial.total_criteria_count} confirmed passed)
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {trial.criteria_breakdown.map((c, idx) => {
                            const status = c.status || (c.passed ? 'PASS' : 'FAIL');
                            const isPass = status === 'PASS';
                            const isFail = status === 'FAIL';
                            const cardStyle = isPass
                              ? 'bg-sage-50/50 border-sage-200 text-sage-900'
                              : isFail
                              ? 'bg-red-50/70 border-red-200 text-red-900'
                              : 'bg-amber-50/60 border-amber-200 text-amber-900';

                            const statusLabel = isPass
                              ? 'Confirmed Pass'
                              : isFail
                              ? c.is_hard_rule ? 'Hard Exclusion' : 'Confirmed Fail'
                              : status === 'UNKNOWN'
                              ? 'Unknown / Not Provided'
                              : 'Review Required';

                            return (
                              <div
                                key={`${c.criterion}-${idx}`}
                                className={`p-2.5 rounded-xl border text-xs flex items-start space-x-2.5 ${cardStyle}`}
                              >
                                {isPass ? (
                                  <CheckCircle2 className="h-4 w-4 text-sage-600 shrink-0 mt-0.5" />
                                ) : isFail ? (
                                  <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                                ) : (
                                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-semibold truncate">{c.criterion}</span>
                                    <span className="text-[9px] font-mono font-bold uppercase shrink-0 opacity-85">
                                      {statusLabel}
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-mono opacity-80 block">
                                    Patient value: {c.patient_value} (Required: {c.required_threshold})
                                  </span>
                                  <p className="text-[10px] mt-0.5 opacity-90 leading-tight">{c.impact_note}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Recruitment Modernization Box */}
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
                          <span className="text-[9px] text-charcoal-500 block">
                            {trial.patient_burden_summary.study_duration_weeks ?? 52} Study Weeks
                          </span>
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
                            {trial.patient_burden_summary.travel_distance_miles !== null &&
                            trial.patient_burden_summary.travel_distance_miles !== undefined
                              ? `${trial.patient_burden_summary.travel_distance_miles} mi`
                              : 'Not provided'}
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
                      <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <span className="text-[11px] text-charcoal-500 font-mono">
                          {isEligible
                            ? '✓ Preliminary eligibility met — clinical coordinator contact available'
                            : isBorderline
                            ? '⚡ Investigator review required for missing or borderline criteria'
                            : 'Confirmed exclusion criterion applies for this protocol'}
                        </span>

                        {isEnrolled ? (
                          <span className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-sage-600 text-white shadow-xs">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Interest Registered with Site Coordinator</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleExpressInterest(trial.protocol_id)}
                            className={`inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                              isEligible || isBorderline
                                ? 'bg-charcoal-900 hover:bg-charcoal-800 text-white shadow-xs'
                                : 'bg-linen-200 text-charcoal-400 cursor-not-allowed'
                            }`}
                            disabled={(!isEligible && !isBorderline) || isSubmittingThis}
                          >
                            <span>{isSubmittingThis ? 'Submitting…' : 'Express Interest in Study'}</span>
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
            )}

          </div>

        </div>

      </div>
    </div>
  );
};
