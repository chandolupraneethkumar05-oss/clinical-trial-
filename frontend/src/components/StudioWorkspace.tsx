import { useState, useCallback } from 'react';
import type { FC, DragEvent } from 'react';
import type { 
  ClinicalProtocol, 
  FunnelSimulationResult, 
  RetentionPoint, 
  BenchmarkTrial,
  Visit,
  Procedure
} from '../types/protocol';
import type { AuthUser } from '../types/auth';
import { apiUrl, extractApiErrorMessage, getStoredAuthToken, parseJsonSafe } from '../lib/api';
import { ScheduleOfEventsMatrix } from './ScheduleOfEventsMatrix';
import { BurdenOverviewTab } from './BurdenOverviewTab';
import { WhatIfSensitivityConsole } from './WhatIfSensitivityConsole';
import { BenchmarkGrid } from './BenchmarkGrid';
import { AuditTrailView } from './AuditTrailView';
import type {
  AuditEvent,
  AuditVerificationStatus,
  ManagedUserAccount,
  PatientInterestSummary,
  PatientScreeningRecord,
} from '../types/audit';
import { ProtocolInspectorDrawer } from './ProtocolInspectorDrawer';
import { AIOptimizerModal } from './AIOptimizerModal';
import { UserMenu } from './UserMenu';
import { 
  ArrowLeft, 
  Download, 
  Database, 
  FileText, 
  FileCheck2,
  Printer,
  Upload,
  X,
  SlidersHorizontal,
  Calendar,
  Activity,
  ShieldCheck,
  Sparkles,
  Zap,
  FlaskConical,
  Dna,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Settings2,
} from 'lucide-react';

export type StudioTab = 'sandbox' | 'soe' | 'overview' | 'benchmarks' | 'audit';

interface StudioWorkspaceProps {
  protocol: ClinicalProtocol;
  totalCohortSize: number;
  funnelData: FunnelSimulationResult | null;
  retentionCurve: RetentionPoint[];
  benchmarks: BenchmarkTrial[];
  benchmarksDisclaimer?: string | null;
  benchmarksError?: string | null;
  onRetryBenchmarks?: () => void;
  simulationError?: string | null;
  user: AuthUser | null;
  activeTab?: StudioTab;
  onTabChange?: (tab: StudioTab) => void;
  onBackToLanding: () => void;
  onSimulateFunnel: (criteria: Record<string, unknown>, signal?: AbortSignal) => Promise<FunnelSimulationResult>;
  onCalculateRetention: (
    enrolled: number,
    pbi: number,
    durationWeeks?: number,
    peakWeeks?: number[],
    signal?: AbortSignal
  ) => Promise<RetentionPoint[]>;
  onSimulationUpdated?: (funnel: FunnelSimulationResult, retention: RetentionPoint[]) => void;
  onOpenUpload: () => void;
  onOpenAuth: () => void;
  onSignOut: () => void;
  onSwitchPersona: () => void;
  onSwitchTemplate: (type: 'nsclc' | 'tnbc' | 'myeloma') => void;
  onUploadFile?: (file: File) => void;
  onApplyAmendment?: (amendmentId: string) => Promise<void>;
  onUnauthorized?: () => void;
  appliedAmendmentIds?: string[];
  auditEvents?: AuditEvent[];
  auditLoading?: boolean;
  auditError?: string | null;
  onRetryAudit?: () => void;
  auditVerification?: AuditVerificationStatus | null;
  patientScreenings?: PatientScreeningRecord[];
  verifyingScreeningId?: string | null;
  screeningVerifyError?: string | null;
  onVerifyScreening?: (screeningId: string) => Promise<void>;
  patientInterests?: PatientInterestSummary[];
  adminUsers?: ManagedUserAccount[];
  promotingUserId?: string | null;
  userPromoteError?: string | null;
  onPromoteUser?: (userId: string, targetRole: 'doctor' | 'admin') => Promise<void>;
  onBackToAdmin?: () => void;
}

export const StudioWorkspace: FC<StudioWorkspaceProps> = ({
  protocol,
  totalCohortSize,
  funnelData,
  retentionCurve,
  benchmarks,
  benchmarksDisclaimer = null,
  benchmarksError = null,
  onRetryBenchmarks,
  simulationError = null,
  user,
  activeTab,
  onTabChange,
  onBackToLanding,
  onSimulateFunnel,
  onCalculateRetention,
  onSimulationUpdated,
  onOpenUpload,
  onOpenAuth,
  onSignOut,
  onSwitchPersona,
  onSwitchTemplate,
  onUploadFile,
  onApplyAmendment,
  onUnauthorized,
  appliedAmendmentIds = [],
  auditEvents = [],
  auditLoading = false,
  auditError = null,
  onRetryAudit,
  auditVerification = null,
  patientScreenings = [],
  verifyingScreeningId = null,
  screeningVerifyError = null,
  onVerifyScreening,
  patientInterests = [],
  adminUsers = [],
  promotingUserId = null,
  userPromoteError = null,
  onPromoteUser,
  onBackToAdmin,
}) => {
  const [internalTab, setInternalTab] = useState<StudioTab>('sandbox');
  const currentTab = activeTab ?? internalTab;
  const handleSetTab = (tab: StudioTab) => {
    setInternalTab(tab);
    onTabChange?.(tab);
  };

  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
  const [selectedProcedure, setSelectedProcedure] = useState<Procedure | null>(null);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportPdfLoading, setExportPdfLoading] = useState<boolean>(false);
  const [exportPdfError, setExportPdfError] = useState<string | null>(null);
  const [showOptimizerModal, setShowOptimizerModal] = useState<boolean>(false);

  const handleDownloadPdfDossier = async () => {
    setExportPdfLoading(true);
    setExportPdfError(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = getStoredAuthToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(apiUrl('/api/v1/protocol/export-dossier'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          protocol,
          funnel_data: funnelData,
          total_cohort_size: totalCohortSize,
          applied_amendment_ids: appliedAmendmentIds,
        }),
      });
      if (res.status === 401) {
        onUnauthorized?.();
        return;
      }
      if (!res.ok) {
        const errData = await parseJsonSafe(res);
        throw new Error(extractApiErrorMessage(errData, `Failed to generate PDF dossier (HTTP ${res.status}).`));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${protocol.protocol_id || 'protocol'}_feasibility_dossier.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setExportPdfError(err instanceof Error ? err.message : 'Unable to download PDF dossier.');
    } finally {
      setExportPdfLoading(false);
    }
  };

  const handleDownloadJsonDossier = () => {
    const packet = {
      exported_at: new Date().toISOString(),
      protocol,
      funnel_simulation: funnelData,
      applied_amendment_ids: appliedAmendmentIds,
      cohort_size: totalCohortSize,
    };
    const blob = new Blob([JSON.stringify(packet, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${protocol.protocol_id || 'protocol'}_feasibility_dossier.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  const [activeLinkedClause, setActiveLinkedClause] = useState<string | null>('inc-0');
  const [isHeaderDragging, setIsHeaderDragging] = useState<boolean>(false);
  const [sandboxShowGroundTruth, setSandboxShowGroundTruth] = useState<boolean>(true);
  const [wideTabShowGroundTruth, setWideTabShowGroundTruth] = useState<boolean>(false);
  const isGroundTruthVisible = currentTab === 'sandbox' ? sandboxShowGroundTruth : wideTabShowGroundTruth;
  const toggleGroundTruth = () => {
    if (currentTab === 'sandbox') {
      setSandboxShowGroundTruth((v) => !v);
    } else {
      setWideTabShowGroundTruth((v) => !v);
    }
  };

  // Determine active template type if matching
  const currentTemplateType = protocol.protocol_id.includes('002') 
    ? 'tnbc' 
    : protocol.protocol_id.includes('003') 
    ? 'myeloma' 
    : 'nsclc';

  // Inline Drag and Drop Handler
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsHeaderDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsHeaderDragging(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsHeaderDragging(false);
    const file = e.dataTransfer.files[0];
    const isPdf = file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
    if (isPdf && onUploadFile) {
      onUploadFile(file);
    } else {
      onOpenUpload();
    }
  }, [onUploadFile, onOpenUpload]);

  return (
    <div className="min-h-screen bg-linen-100 flex flex-col font-sans text-charcoal-900 selection:bg-terracotta-100 selection:text-terracotta-700">
      
      {/* ─────────────────────────────────────────────────────────────
          SLIM STUDIO TOP HEADER & NAVIGATION TABS
         ───────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-linen-50/95 backdrop-blur-md border-b border-linen-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onBackToLanding}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-charcoal-700 bg-white border border-linen-300 hover:bg-linen-200 transition-colors shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Overview</span>
            </button>

            {onBackToAdmin && (
              <button
                type="button"
                onClick={onBackToAdmin}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-300 hover:bg-amber-100 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Settings2 className="h-3.5 w-3.5" />
                <span>Admin Console</span>
              </button>
            )}

            <div className="flex items-center gap-2 border-l border-linen-300 pl-2.5 min-w-0">
              <span className="font-serif font-bold text-sm text-charcoal-900 tracking-tight whitespace-nowrap truncate">
                {protocol.protocol_id}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-linen-200 text-charcoal-700 border border-linen-300 whitespace-nowrap shrink-0">
                {protocol.phase}
              </span>
              {protocol.source_filename && (
                <span className="hidden md:inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-sage-100 text-sage-800 border border-sage-200 whitespace-nowrap shrink-0">
                  <FileText className="h-2.5 w-2.5 text-sage-600" />
                  <span>{protocol.extracted_page_count ? `PDF · ${protocol.extracted_page_count}pp` : 'PDF'}</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* DuckDB Cohort Counter */}
            <div className="hidden lg:flex items-center gap-1.5 text-xs text-charcoal-700 bg-white px-2.5 py-1.5 rounded-lg border border-linen-300 whitespace-nowrap">
              <Database className="h-3.5 w-3.5 text-sage-600 shrink-0" />
              <strong className="font-mono text-charcoal-900">{totalCohortSize.toLocaleString()}</strong>
              <span className="text-[11px] text-charcoal-500">patients</span>
            </div>

            {/* AI Protocol Optimizer Trigger */}
            <button
              type="button"
              onClick={() => setShowOptimizerModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-terracotta-600 to-amber-600 hover:brightness-110 text-white shadow-2xs transition-all cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="h-3.5 w-3.5 text-white" />
              <span>
                AI Optimizer{appliedAmendmentIds.length > 0 ? ` (${appliedAmendmentIds.length})` : ''}
              </span>
            </button>

            {/* Export Feasibility Dossier */}
            <button
              type="button"
              onClick={() => setShowExportModal(true)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-charcoal-900 hover:bg-charcoal-800 text-white shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5 text-terracotta-200" />
              <span>Export</span>
            </button>

            {/* User Profile / Auth Menu */}
            <UserMenu
              user={user}
              onOpenAuth={onOpenAuth}
              onSignOut={onSignOut}
              onSwitchPersona={onSwitchPersona}
            />
          </div>
        </div>

        {/* ── Clean Slim Tab Navigation Bar ───────────────────────────────── */}
        <div className="border-t border-linen-200 bg-white/85">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-1 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => handleSetTab('sandbox')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                currentTab === 'sandbox'
                  ? 'border-terracotta-600 text-charcoal-950 font-semibold'
                  : 'border-transparent text-charcoal-500 hover:text-charcoal-900 hover:bg-linen-100/60'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-terracotta-600 shrink-0" />
              <span>Sensitivity Sandbox</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-terracotta-50 text-terracotta-700 border border-terracotta-200">
                {funnelData ? `${funnelData.final_eligible_count}` : '…'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSetTab('soe')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                currentTab === 'soe'
                  ? 'border-sage-600 text-charcoal-950 font-semibold'
                  : 'border-transparent text-charcoal-500 hover:text-charcoal-900 hover:bg-linen-100/60'
              }`}
            >
              <Calendar className="h-3.5 w-3.5 text-sage-600 shrink-0" />
              <span>Schedule of Assessments</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-sage-50 text-sage-700 border border-sage-200">
                {protocol.visits.length} visits
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSetTab('overview')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                currentTab === 'overview'
                  ? 'border-indigo-600 text-charcoal-950 font-semibold'
                  : 'border-transparent text-charcoal-500 hover:text-charcoal-900 hover:bg-linen-100/60'
              }`}
            >
              <Activity className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
              <span>Burden &amp; Equity</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                PBI {protocol.burden.composite_pbi_score}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSetTab('benchmarks')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                currentTab === 'benchmarks'
                  ? 'border-teal-600 text-charcoal-950 font-semibold'
                  : 'border-transparent text-charcoal-500 hover:text-charcoal-900 hover:bg-linen-100/60'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5 text-teal-600 shrink-0" />
              <span>Peer Benchmarks</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                {benchmarks.length} Trials
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSetTab('audit')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                currentTab === 'audit'
                  ? 'border-amber-600 text-charcoal-950 font-semibold'
                  : 'border-transparent text-charcoal-500 hover:text-charcoal-900 hover:bg-linen-100/60'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <span>Audit Trail</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                SHA-256
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────
          MAIN STUDIO BODY: STREAMLINED TOOLBAR + ADAPTIVE WORKSPACE
         ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-4">
        {/* Scrollable Protocol Template & PDF Drop Strip */}
        <div className="bg-white rounded-2xl border border-linen-300 px-4 py-3 shadow-2xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-charcoal-500 mr-1">
              Protocol:
            </span>
            <button
              type="button"
              onClick={() => onSwitchTemplate('nsclc')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                currentTemplateType === 'nsclc'
                  ? 'bg-terracotta-600 text-white shadow-2xs font-semibold'
                  : 'bg-linen-100 text-charcoal-700 hover:bg-linen-200 border border-linen-200'
              }`}
            >
              <Zap className="h-3 w-3" />
              <span>Phase III NSCLC</span>
            </button>

            <button
              type="button"
              onClick={() => onSwitchTemplate('tnbc')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                currentTemplateType === 'tnbc'
                  ? 'bg-sage-600 text-white shadow-2xs font-semibold'
                  : 'bg-linen-100 text-charcoal-700 hover:bg-linen-200 border border-linen-200'
              }`}
            >
              <FlaskConical className="h-3 w-3" />
              <span>Phase II TNBC</span>
            </button>

            <button
              type="button"
              onClick={() => onSwitchTemplate('myeloma')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                currentTemplateType === 'myeloma'
                  ? 'bg-indigo-600 text-white shadow-2xs font-semibold'
                  : 'bg-linen-100 text-charcoal-700 hover:bg-linen-200 border border-linen-200'
              }`}
            >
              <Dna className="h-3 w-3" />
              <span>Phase III Myeloma</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 justify-between lg:justify-end">
            {currentTab === 'sandbox' && (
              <button
                type="button"
                onClick={toggleGroundTruth}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-linen-100 hover:bg-linen-200 text-charcoal-700 border border-linen-300 cursor-pointer whitespace-nowrap"
              >
                <FileText className="h-3.5 w-3.5 text-terracotta-600" />
                <span>{isGroundTruthVisible ? 'Hide Protocol Text' : 'Show Protocol Text'}</span>
                {isGroundTruthVisible ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            )}

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={onOpenUpload}
              className={`flex items-center justify-between px-3 py-1.5 rounded-xl border border-dashed transition-all cursor-pointer ${
                isHeaderDragging
                  ? 'bg-terracotta-50 border-terracotta-500 text-terracotta-900'
                  : 'bg-linen-50 hover:bg-linen-100 border-linen-300 hover:border-terracotta-400 text-charcoal-700'
              }`}
            >
              <div className="flex items-center gap-2 text-xs">
                <Upload className="h-3.5 w-3.5 text-terracotta-600 shrink-0" />
                <span className="font-mono text-[11px] whitespace-nowrap">
                  Drop / Upload Protocol PDF
                </span>
              </div>
              <span className="ml-2.5 text-[10px] font-mono px-2 py-0.5 rounded bg-charcoal-900 text-white whitespace-nowrap">
                Browse
              </span>
            </div>
          </div>
        </div>

        {/* Full-Width Protocol Summary Strip on Matrix / Burden / Benchmarks / Audit Views */}
        {currentTab !== 'sandbox' && (
          <div className="bg-white/90 rounded-xl border border-linen-300 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="font-serif font-bold text-charcoal-900 truncate max-w-xl">
                {protocol.title}
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-linen-100 border border-linen-200 text-charcoal-700 whitespace-nowrap">
                {protocol.indication}
              </span>
              <span className="text-[11px] font-mono text-charcoal-500 whitespace-nowrap">
                Target N={protocol.target_enrollment} • {protocol.study_duration_weeks} weeks
              </span>
            </div>
            <button
              type="button"
              onClick={toggleGroundTruth}
              className="text-[11px] font-mono text-terracotta-700 hover:underline cursor-pointer whitespace-nowrap"
            >
              {isGroundTruthVisible ? 'Hide Eligibility Clauses' : 'Inspect Eligibility Clauses'}
            </button>
          </div>
        )}
        {protocol.extraction_status === 'heuristic_fallback' && (
          <div className="mb-4 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start space-x-3 text-xs text-amber-900 shadow-2xs">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-serif font-bold text-xs text-amber-950 block">
                Heuristic Oncology Baseline Active
              </span>
              <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed font-sans">
                {protocol.extraction_notes || 'The uploaded protocol yielded sparse schedule tables. Standard Phase II/III oncology baseline parameters were applied so you can immediately conduct sensitivity simulations and modify visits.'}
              </p>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-200/60 text-amber-900 font-semibold uppercase">
              Baseline Mode
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Ground-Truth Protocol Deconstruction Column (shown alongside Sandbox, or toggled on wide views) */}
          {isGroundTruthVisible && (
            <div className={currentTab === 'sandbox' ? 'lg:col-span-5 space-y-4' : 'lg:col-span-4 space-y-4'}>
            <div className="bg-white rounded-2xl border border-linen-300 p-5 shadow-xs">
              
              <div className="flex items-center justify-between pb-3 border-b border-linen-200">
                <div className="flex items-center space-x-2">
                  <FileText className="h-4 w-4 text-terracotta-600" />
                  <h3 className="font-serif font-bold text-sm text-charcoal-900">
                    Protocol Ground Truth
                  </h3>
                </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                  protocol.extracted_page_count
                    ? 'bg-sage-100 text-sage-800 border border-sage-200 font-bold'
                    : 'bg-linen-200 text-charcoal-700'
                }`}>
                  {protocol.extracted_page_count ? 'PARSED FROM PDF' : 'LINKED EVIDENCE'}
                </span>
              </div>

              <div className="mt-3 space-y-3 text-xs text-charcoal-800 font-serif leading-relaxed max-h-[640px] overflow-y-auto pr-1">
                
                {/* Protocol Meta Card */}
                <div className="p-3 bg-linen-50 rounded-xl border border-linen-200">
                  <span className="text-[10px] font-mono uppercase text-charcoal-500 block mb-1">
                    Official Protocol Title
                  </span>
                  <p className="font-bold text-charcoal-900 text-xs leading-snug">
                    {protocol.title}
                  </p>
                  
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white text-charcoal-800 border border-linen-300 font-semibold">
                      {protocol.indication}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white text-charcoal-700 border border-linen-300">
                      N={protocol.target_enrollment} Target
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white text-charcoal-700 border border-linen-300">
                      {protocol.study_duration_weeks} Weeks
                    </span>
                  </div>
                </div>

                {/* Extracted Structured Biomarker Filters */}
                {protocol.eligibility?.structured_filters && (
                  <div className="p-3 bg-charcoal-950 text-white rounded-xl space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono uppercase text-terracotta-300 font-bold tracking-wider">
                        Extracted Ingestion Filters (Active in DuckDB)
                      </span>
                      {protocol.eligibility.criteria && protocol.eligibility.criteria.length > 0 && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-charcoal-800 text-sage-300 border border-charcoal-700">
                          {protocol.eligibility.criteria.filter((c) => c.validation_status === 'VALIDATED').length}/
                          {protocol.eligibility.criteria.length} text-verified
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                      {protocol.eligibility.structured_filters.min_egfr !== undefined && (
                        <div className="p-1.5 rounded bg-charcoal-900 border border-charcoal-800">
                          <span className="text-charcoal-400 block text-[9px]">eGFR THRESHOLD:</span>
                          <strong className="text-terracotta-400">≥ {protocol.eligibility.structured_filters.min_egfr} mL/min</strong>
                        </div>
                      )}
                      {protocol.eligibility.structured_filters.max_ecog !== undefined && (
                        <div className="p-1.5 rounded bg-charcoal-900 border border-charcoal-800">
                          <span className="text-charcoal-400 block text-[9px]">PERFORMANCE STATUS:</span>
                          <strong className="text-sage-400">ECOG ≤ {protocol.eligibility.structured_filters.max_ecog}</strong>
                        </div>
                      )}
                      {protocol.eligibility.structured_filters.min_age !== undefined && (
                        <div className="p-1.5 rounded bg-charcoal-900 border border-charcoal-800">
                          <span className="text-charcoal-400 block text-[9px]">MINIMUM AGE:</span>
                          <span className="text-white">≥ {protocol.eligibility.structured_filters.min_age} Yrs</span>
                        </div>
                      )}
                      {protocol.eligibility.structured_filters.max_prior_lines !== undefined && (
                        <div className="p-1.5 rounded bg-charcoal-900 border border-charcoal-800">
                          <span className="text-charcoal-400 block text-[9px]">PRIOR THERAPY LINES:</span>
                          <span className="text-white">≤ {protocol.eligibility.structured_filters.max_prior_lines}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* AI Optimizer Interactive Callout Banner */}
                <div
                  onClick={() => setShowOptimizerModal(true)}
                  className="p-3.5 bg-gradient-to-br from-charcoal-950 via-charcoal-900 to-terracotta-950 text-white rounded-xl border border-terracotta-500/40 shadow-xs cursor-pointer hover:border-terracotta-400 transition-all group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-terracotta-400 font-bold flex items-center space-x-1">
                      <Sparkles className="h-3 w-3 text-terracotta-400" />
                      <span>AI Protocol Optimizer</span>
                    </span>
                    <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-terracotta-500/20 text-terracotta-300 border border-terracotta-500/40 font-bold">
                      {appliedAmendmentIds.length} Applied
                    </span>
                  </div>
                  <p className="text-xs font-serif font-bold text-linen-100 group-hover:text-white leading-snug">
                    FDA-Aligned Protocol Redline Advisor
                  </p>
                  <p className="text-[11px] text-charcoal-300 font-sans mt-0.5">
                    Evaluate eGFR, CNS, biopsy, and PK burden amendments in real time against the {totalCohortSize.toLocaleString()}-patient cohort.
                  </p>
                  <div className="mt-2 flex items-center space-x-1 text-[11px] text-terracotta-400 font-mono font-bold group-hover:translate-x-0.5 transition-transform">
                    <span>Inspect Redline Diff & 1-Click Apply</span>
                    <span>→</span>
                  </div>
                </div>

                {/* Dynamic Inclusion Criteria */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[10px] font-mono text-sage-800 font-bold uppercase tracking-wider">
                    <span>Inclusion Criteria ({protocol.eligibility?.inclusion_criteria?.length ?? 0})</span>
                    <span className="text-charcoal-400 font-normal">Click to Inspect</span>
                  </div>

                  {(protocol.eligibility?.inclusion_criteria ?? []).slice(0, 6).map((criterion, i) => {
                    const clauseId = `inc-${i}`;
                    const isSelected = activeLinkedClause === clauseId;
                    return (
                      <div
                        key={clauseId}
                        onClick={() => setActiveLinkedClause(clauseId)}
                        className={`p-2.5 rounded-xl cursor-pointer transition-all border ${
                          isSelected
                            ? 'bg-sage-50 border-2 border-sage-500 shadow-2xs'
                            : 'bg-white border-linen-300 hover:bg-linen-50'
                        }`}
                      >
                        <div className="flex items-start space-x-2">
                          <CheckCircle2 className="h-3.5 w-3.5 text-sage-600 mt-0.5 flex-shrink-0" />
                          <p className="text-charcoal-900 text-xs leading-snug">
                            {criterion}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Dynamic Exclusion Criteria */}
                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between text-[10px] font-mono text-terracotta-700 font-bold uppercase tracking-wider">
                    <span>Exclusion Bottlenecks ({protocol.eligibility?.exclusion_criteria?.length ?? 0})</span>
                    <span className="text-charcoal-400 font-normal">Risk Points</span>
                  </div>

                  {(protocol.eligibility?.exclusion_criteria ?? []).slice(0, 5).map((criterion, i) => {
                    const clauseId = `exc-${i}`;
                    const isSelected = activeLinkedClause === clauseId;
                    return (
                      <div
                        key={clauseId}
                        onClick={() => setActiveLinkedClause(clauseId)}
                        className={`p-2.5 rounded-xl cursor-pointer transition-all border ${
                          isSelected
                            ? 'bg-terracotta-50 border-2 border-terracotta-500 shadow-2xs'
                            : 'bg-white border-linen-300 hover:bg-linen-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="flex items-start space-x-2">
                            <AlertTriangle className="h-3.5 w-3.5 text-terracotta-600 mt-0.5 flex-shrink-0" />
                            <p className="text-charcoal-900 text-xs leading-snug">
                              {criterion}
                            </p>
                          </div>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-terracotta-100 text-terracotta-800 font-bold flex-shrink-0">
                            EXCL
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          )}

          {/* Main Intelligence Workspace Column (Adaptive Full-Width on Matrix / Benchmarks / Audit) */}
          <div
            className={
              isGroundTruthVisible
                ? currentTab === 'sandbox'
                  ? 'lg:col-span-7 space-y-4'
                  : 'lg:col-span-8 space-y-4'
                : 'lg:col-span-12 space-y-4'
            }
          >
            
            {currentTab === 'sandbox' && (
              <WhatIfSensitivityConsole
                protocol={protocol}
                initialFunnel={funnelData}
                initialRetention={retentionCurve}
                simulationError={simulationError}
                onSimulateFunnel={onSimulateFunnel}
                onCalculateRetention={onCalculateRetention}
                onSimulationUpdated={onSimulationUpdated}
              />
            )}

            {currentTab === 'soe' && (
              <ScheduleOfEventsMatrix
                visits={protocol.visits}
                peakWeeks={protocol.burden.peak_burden_weeks}
                onSelectVisit={(v) => {
                  setSelectedVisit(v);
                  setSelectedProcedure(null);
                }}
                onSelectProcedure={(p, v) => {
                  setSelectedProcedure(p);
                  setSelectedVisit(v);
                }}
              />
            )}

            {currentTab === 'overview' && (
              <BurdenOverviewTab
                protocol={protocol}
                screenFailureRate={funnelData?.screen_failure_rate ?? 0}
                finalEligibleCount={funnelData?.final_eligible_count ?? 0}
                totalCohortSize={totalCohortSize}
                endOfStudyRetention={
                  retentionCurve.length > 0
                    ? retentionCurve[retentionCurve.length - 1]?.retained_percentage ?? null
                    : null
                }
              />
            )}

            {currentTab === 'benchmarks' && (
              <BenchmarkGrid
                benchmarks={benchmarks}
                disclaimer={benchmarksDisclaimer}
                error={benchmarksError}
                onRetry={onRetryBenchmarks}
                onUnauthorized={onUnauthorized}
                defaultNctId={protocol.nct_id}
                activeProtocol={protocol}
              />
            )}

            {currentTab === 'audit' && (
              <AuditTrailView 
                events={auditEvents}
                isLoading={auditLoading}
                error={auditError}
                onRetry={onRetryAudit}
                verificationStatus={auditVerification}
                patientScreenings={patientScreenings}
                verifyingScreeningId={verifyingScreeningId}
                screeningVerifyError={screeningVerifyError}
                onVerifyScreening={onVerifyScreening}
                patientInterests={patientInterests}
                userRole={user?.role}
                adminUsers={adminUsers}
                promotingUserId={promotingUserId}
                userPromoteError={userPromoteError}
                onPromoteUser={onPromoteUser}
              />
            )}
          </div>
        </div>
      </div>

      {/* Contextual Inspector Drawer */}
      {(selectedVisit || selectedProcedure) && (
        <div 
          className="fixed inset-0 bg-charcoal-950/40 backdrop-blur-2xs z-40 transition-opacity"
          onClick={() => {
            setSelectedVisit(null);
            setSelectedProcedure(null);
          }}
        />
      )}
      <ProtocolInspectorDrawer
        selectedVisit={selectedVisit}
        selectedProcedure={selectedProcedure}
        onClose={() => {
          setSelectedVisit(null);
          setSelectedProcedure(null);
        }}
      />

      {/* Export Feasibility Dossier Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-charcoal-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-linen-300 max-w-xl w-full rounded-3xl shadow-2xl overflow-hidden space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 bg-charcoal-950 text-white flex items-center justify-between border-b border-charcoal-800">
              <div className="flex items-center space-x-2.5">
                <FileCheck2 className="h-5 w-5 text-terracotta-300" />
                <div>
                  <h3 className="font-serif font-bold text-sm">Trial Feasibility & Attrition Dossier</h3>
                  <p className="text-[11px] text-charcoal-400 font-mono">Executive Protocol Review Board Submission</p>
                </div>
              </div>
              <button 
                onClick={() => setShowExportModal(false)}
                className="text-charcoal-400 hover:text-white p-1 rounded-lg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-charcoal-800">
              <div>
                <span className="text-[10px] font-mono text-charcoal-500 uppercase tracking-widest block">Study ID</span>
                <p className="font-bold text-sm text-charcoal-900">{protocol.protocol_id} — {protocol.title}</p>
              </div>

              <div className="p-4 bg-linen-50 rounded-2xl border border-linen-300 space-y-2 font-mono text-xs">
                <div className="flex justify-between border-b border-linen-200 pb-1">
                  <span className="text-charcoal-600">Composite Patient Burden Index:</span>
                  <strong className="text-charcoal-900">{protocol.burden.composite_pbi_score} / 100 ({protocol.burden.attrition_risk_tier})</strong>
                </div>
                <div className="flex justify-between border-b border-linen-200 pb-1">
                  <span className="text-charcoal-600">Projected Screen Failure:</span>
                  <strong className="text-terracotta-600">
                    {funnelData ? `${funnelData.screen_failure_rate}%` : 'Pending simulation'}
                  </strong>
                </div>
                <div className="flex justify-between border-b border-linen-200 pb-1">
                  <span className="text-charcoal-600">Eligible Candidate Pool:</span>
                  <strong className="text-sage-700">
                    {funnelData ? `${funnelData.final_eligible_count} / ${totalCohortSize} patients` : 'Pending simulation'}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-charcoal-600">Burden Risk Tier:</span>
                  <strong className="text-charcoal-900">{protocol.burden.attrition_risk_tier} Friction</strong>
                </div>
              </div>

              <p className="text-charcoal-600 text-[11px] leading-relaxed">
                This dossier compiles the schedule of assessments deconstruction, synthetic DuckDB funnel yields, applied amendments, and PBI analytics into a downloadable PDF or JSON snapshot.
              </p>

              {exportPdfError && (
                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 font-mono text-[11px]">
                  {exportPdfError}
                </div>
              )}
            </div>

            <div className="p-4 bg-linen-100 border-t border-linen-300 flex flex-wrap items-center justify-end gap-2">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 text-xs font-medium rounded-full border border-linen-300 bg-white text-charcoal-700 hover:bg-linen-200 transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleDownloadJsonDossier}
                className="px-4 py-2 text-xs font-medium rounded-full border border-linen-300 bg-white text-charcoal-800 hover:bg-linen-200 flex items-center space-x-1.5 transition-colors cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>JSON</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 text-xs font-medium rounded-full border border-linen-300 bg-white text-charcoal-800 hover:bg-linen-200 flex items-center space-x-1.5 transition-colors cursor-pointer"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Print</span>
              </button>
              <button
                type="button"
                disabled={exportPdfLoading}
                onClick={() => void handleDownloadPdfDossier()}
                className="px-5 py-2 text-xs font-semibold rounded-full bg-charcoal-900 text-white hover:bg-charcoal-800 disabled:opacity-50 shadow-sm flex items-center space-x-1.5 transition-colors cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{exportPdfLoading ? 'Generating PDF…' : 'Download PDF Dossier'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* AI Protocol Amendment & Optimization Advisor Modal */}
      {showOptimizerModal && (
        <AIOptimizerModal
          isOpen={showOptimizerModal}
          onClose={() => setShowOptimizerModal(false)}
          protocol={protocol}
          onApplyAmendment={onApplyAmendment || (async () => {})}
          appliedAmendmentIds={appliedAmendmentIds}
          onUnauthorized={onUnauthorized}
        />
      )}
    </div>
  );
};
