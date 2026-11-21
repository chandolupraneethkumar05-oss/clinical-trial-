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
import { ScheduleOfEventsMatrix } from './ScheduleOfEventsMatrix';
import { BurdenOverviewTab } from './BurdenOverviewTab';
import { WhatIfSensitivityConsole } from './WhatIfSensitivityConsole';
import { BenchmarkGrid } from './BenchmarkGrid';
import { AuditTrailView } from './AuditTrailView';
import type { AuditEvent } from './AuditTrailView';
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
} from 'lucide-react';

export type StudioTab = 'sandbox' | 'soe' | 'overview' | 'benchmarks' | 'audit';

interface StudioWorkspaceProps {
  protocol: ClinicalProtocol;
  totalCohortSize: number;
  funnelData: FunnelSimulationResult;
  retentionCurve: RetentionPoint[];
  benchmarks: BenchmarkTrial[];
  user: AuthUser | null;
  activeTab?: StudioTab;
  onTabChange?: (tab: StudioTab) => void;
  onBackToLanding: () => void;
  onSimulateFunnel: (criteria: Record<string, unknown>) => Promise<FunnelSimulationResult>;
  onCalculateRetention: (enrolled: number, pbi: number) => Promise<RetentionPoint[]>;
  onOpenUpload: () => void;
  onOpenAuth: () => void;
  onSignOut: () => void;
  onSwitchPersona: () => void;
  onSwitchTemplate: (type: 'nsclc' | 'tnbc' | 'myeloma') => void;
  onUploadFile?: (file: File) => void;
  onApplyAmendment?: (amendmentId: string) => Promise<void>;
  appliedAmendmentIds?: string[];
  auditEvents?: AuditEvent[];
}

export const StudioWorkspace: FC<StudioWorkspaceProps> = ({
  protocol,
  totalCohortSize,
  funnelData,
  retentionCurve,
  benchmarks,
  user,
  activeTab,
  onTabChange,
  onBackToLanding,
  onSimulateFunnel,
  onCalculateRetention,
  onOpenUpload,
  onOpenAuth,
  onSignOut,
  onSwitchPersona,
  onSwitchTemplate,
  onUploadFile,
  onApplyAmendment,
  appliedAmendmentIds = [],
  auditEvents,
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
  const [showOptimizerModal, setShowOptimizerModal] = useState<boolean>(false);
  const [activeLinkedClause, setActiveLinkedClause] = useState<string | null>('inc-0');
  const [isHeaderDragging, setIsHeaderDragging] = useState<boolean>(false);

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
    if (file && file.type === 'application/pdf' && onUploadFile) {
      onUploadFile(file);
    } else {
      onOpenUpload();
    }
  }, [onUploadFile, onOpenUpload]);

  return (
    <div className="min-h-screen bg-linen-100 flex flex-col font-sans text-charcoal-900 selection:bg-terracotta-100 selection:text-terracotta-700">
      
      {/* ─────────────────────────────────────────────────────────────
          STUDIO TOP NAVIGATION BAR
         ───────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-linen-100/90 backdrop-blur-md border-b border-linen-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={onBackToLanding}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-charcoal-700 bg-white border border-linen-300 hover:bg-linen-200 transition-colors shadow-2xs"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Overview</span>
            </button>

            <div className="flex items-center space-x-2 border-l border-linen-300 pl-3">
              <span className="font-serif font-bold text-sm text-charcoal-900 tracking-tight">
                {protocol.protocol_id}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-linen-200 text-charcoal-700 border border-linen-300">
                {protocol.phase}
              </span>
              {protocol.source_filename && (
                <span className="hidden md:inline-flex items-center space-x-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-sage-100 text-sage-800 border border-sage-200">
                  <FileText className="h-2.5 w-2.5 text-sage-600" />
                  <span>{protocol.extracted_page_count ? `PDF · ${protocol.extracted_page_count}pp` : 'PDF'}</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* DuckDB In-Memory Cohort Status */}
            <div className="hidden md:flex items-center space-x-1.5 text-xs text-charcoal-700 bg-white px-3 py-1.5 rounded-full border border-linen-300 shadow-2xs">
              <Database className="h-3.5 w-3.5 text-sage-600" />
              <span>DuckDB In-Memory:</span>
              <strong className="font-mono text-charcoal-900">{totalCohortSize.toLocaleString()} patients</strong>
            </div>

            {/* AI Protocol Optimizer Trigger */}
            <button
              onClick={() => setShowOptimizerModal(true)}
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-full bg-gradient-to-r from-terracotta-600 via-amber-600 to-terracotta-500 hover:brightness-110 text-white shadow-xs transition-all cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5 text-white animate-pulse" />
              <span>AI Optimizer ({Math.max(0, 4 - appliedAmendmentIds.length)} Opps)</span>
            </button>

            {/* Export Feasibility Dossier */}
            <button
              onClick={() => setShowExportModal(true)}
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-full bg-charcoal-900 hover:bg-charcoal-800 text-white shadow-xs transition-colors"
            >
              <Download className="h-3.5 w-3.5 text-terracotta-200" />
              <span>Export Dossier</span>
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

        {/* ─────────────────────────────────────────────────────────────
            HERO PROTOCOL COMMAND BAR & INGESTION DROPZONE (Never Hidden)
           ───────────────────────────────────────────────────────────── */}
        <div className="bg-charcoal-950 text-white border-t border-charcoal-800 px-4 sm:px-6 lg:px-8 py-2.5">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            
            {/* Template Quick-Switcher */}
            <div className="flex items-center space-x-2 overflow-x-auto py-0.5">
              <span className="text-[10px] font-mono uppercase tracking-widest text-charcoal-400 flex items-center space-x-1 flex-shrink-0 mr-1">
                <Sparkles className="h-3 w-3 text-terracotta-400" />
                <span>Protocol:</span>
              </span>

              <button
                onClick={() => onSwitchTemplate('nsclc')}
                className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  currentTemplateType === 'nsclc'
                    ? 'bg-terracotta-600 text-white shadow-sm ring-1 ring-terracotta-400 font-semibold'
                    : 'bg-charcoal-900 text-charcoal-300 hover:bg-charcoal-800 hover:text-white border border-charcoal-700'
                }`}
              >
                <Zap className="h-3 w-3" />
                <span>Phase III NSCLC</span>
              </button>

              <button
                onClick={() => onSwitchTemplate('tnbc')}
                className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  currentTemplateType === 'tnbc'
                    ? 'bg-sage-600 text-white shadow-sm ring-1 ring-sage-400 font-semibold'
                    : 'bg-charcoal-900 text-charcoal-300 hover:bg-charcoal-800 hover:text-white border border-charcoal-700'
                }`}
              >
                <FlaskConical className="h-3 w-3" />
                <span>Phase II TNBC</span>
              </button>

              <button
                onClick={() => onSwitchTemplate('myeloma')}
                className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  currentTemplateType === 'myeloma'
                    ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-400 font-semibold'
                    : 'bg-charcoal-900 text-charcoal-300 hover:bg-charcoal-800 hover:text-white border border-charcoal-700'
                }`}
              >
                <Dna className="h-3 w-3" />
                <span>Phase III Myeloma</span>
              </button>
            </div>

            {/* Drag & Drop PDF Dropzone Strip */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={onOpenUpload}
              className={`flex items-center justify-between px-3.5 py-1.5 rounded-xl border border-dashed transition-all cursor-pointer ${
                isHeaderDragging
                  ? 'bg-terracotta-900/60 border-terracotta-400 text-white scale-[1.01]'
                  : 'bg-charcoal-900 hover:bg-charcoal-850 border-charcoal-700 hover:border-terracotta-500/80 text-charcoal-200'
              }`}
            >
              <div className="flex items-center space-x-2 text-xs">
                <Upload className="h-3.5 w-3.5 text-terracotta-400 animate-pulse" />
                <span className="font-mono text-[11px]">
                  Drop protocol PDF here to parse live
                </span>
              </div>
              <span className="ml-3 text-[10px] font-mono px-2 py-0.5 rounded bg-terracotta-600/30 text-terracotta-300 border border-terracotta-500/30">
                Browse PDF
              </span>
            </div>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            INTERACTIVE FEATURE SHOWCASE RIBBON (Instant Feature Discovery)
           ───────────────────────────────────────────────────────────── */}
        <div className="bg-white border-t border-linen-200 px-4 sm:px-6 lg:px-8 py-2">
          <div className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-2">
            
            {/* Feature 1: What-If Sandbox */}
            <button
              onClick={() => handleSetTab('sandbox')}
              className={`p-2.5 rounded-xl text-left transition-all border ${
                currentTab === 'sandbox'
                  ? 'bg-charcoal-950 text-white border-charcoal-900 shadow-sm'
                  : 'bg-linen-50 hover:bg-linen-100 text-charcoal-800 border-linen-200'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider flex items-center space-x-1 text-terracotta-500">
                  <SlidersHorizontal className="h-3 w-3" />
                  <span>Sensitivity Sandbox</span>
                </span>
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-terracotta-500/20 text-terracotta-400">
                  {funnelData.final_eligible_count} Eligible
                </span>
              </div>
              <p className={`text-xs font-semibold truncate ${currentTab === 'sandbox' ? 'text-white' : 'text-charcoal-900'}`}>
                10k Cohort Funnel Simulation
              </p>
            </button>

            {/* Feature 2: Schedule of Events Matrix */}
            <button
              onClick={() => handleSetTab('soe')}
              className={`p-2.5 rounded-xl text-left transition-all border ${
                currentTab === 'soe'
                  ? 'bg-charcoal-950 text-white border-charcoal-900 shadow-sm'
                  : 'bg-linen-50 hover:bg-linen-100 text-charcoal-800 border-linen-200'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider flex items-center space-x-1 text-sage-600">
                  <Calendar className="h-3 w-3" />
                  <span>Schedule of Assessments</span>
                </span>
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-sage-500/20 text-sage-600">
                  {protocol.visits.length} Visits
                </span>
              </div>
              <p className={`text-xs font-semibold truncate ${currentTab === 'soe' ? 'text-white' : 'text-charcoal-900'}`}>
                {protocol.study_duration_weeks}-Week Procedure Matrix
              </p>
            </button>

            {/* Feature 3: Tufts CSDD Burden Decomposition */}
            <button
              onClick={() => handleSetTab('overview')}
              className={`p-2.5 rounded-xl text-left transition-all border ${
                currentTab === 'overview'
                  ? 'bg-charcoal-950 text-white border-charcoal-900 shadow-sm'
                  : 'bg-linen-50 hover:bg-linen-100 text-charcoal-800 border-linen-200'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider flex items-center space-x-1 text-indigo-500">
                  <Activity className="h-3 w-3" />
                  <span>Tufts CSDD Burden</span>
                </span>
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-indigo-500/20 text-indigo-400">
                  PBI {protocol.burden.composite_pbi_score}
                </span>
              </div>
              <p className={`text-xs font-semibold truncate ${currentTab === 'overview' ? 'text-white' : 'text-charcoal-900'}`}>
                {protocol.burden.attrition_risk_tier} Risk Decomposition
              </p>
            </button>

            {/* Feature 4: Regulatory Audit Trail */}
            <button
              onClick={() => handleSetTab('audit')}
              className={`p-2.5 rounded-xl text-left transition-all border ${
                currentTab === 'audit'
                  ? 'bg-charcoal-950 text-white border-charcoal-900 shadow-sm'
                  : 'bg-linen-50 hover:bg-linen-100 text-charcoal-800 border-linen-200'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider flex items-center space-x-1 text-amber-500">
                  <ShieldCheck className="h-3 w-3" />
                  <span>21 CFR Part 11 Audit</span>
                </span>
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-400">
                  SHA-256
                </span>
              </div>
              <p className={`text-xs font-semibold truncate ${activeTab === 'audit' ? 'text-white' : 'text-charcoal-900'}`}>
                Regulatory Integrity Trail
              </p>
            </button>
          </div>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────
          MAIN STUDIO BODY: DYNAMIC PROTOCOL GROUND TRUTH + CONSOLE
         ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: Dynamic Ground-Truth Protocol Deconstruction (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
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
                    <span className="text-[10px] font-mono uppercase text-terracotta-300 block font-bold tracking-wider">
                      Extracted Ingestion Filters (Active in DuckDB)
                    </span>
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
                      {appliedAmendmentIds.length}/4 Applied
                    </span>
                  </div>
                  <p className="text-xs font-serif font-bold text-linen-100 group-hover:text-white leading-snug">
                    4 Calibrated Protocol Redlines
                  </p>
                  <p className="text-[11px] text-charcoal-300 font-sans mt-0.5">
                    Recover +317 patients and reduce Tufts CSDD burden by -28.9 pts.
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

          {/* Right Column: Precision Intelligence Console (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            
            {currentTab === 'sandbox' && (
              <WhatIfSensitivityConsole
                initialFunnel={funnelData}
                initialRetention={retentionCurve}
                onSimulateFunnel={onSimulateFunnel}
                onCalculateRetention={onCalculateRetention}
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
                screenFailureRate={funnelData.screen_failure_rate}
                finalEligibleCount={funnelData.final_eligible_count}
              />
            )}

            {currentTab === 'benchmarks' && (
              <BenchmarkGrid benchmarks={benchmarks} />
            )}

            {currentTab === 'audit' && (
              <AuditTrailView events={auditEvents} />
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
                  <strong className="text-terracotta-600">{funnelData.screen_failure_rate}%</strong>
                </div>
                <div className="flex justify-between border-b border-linen-200 pb-1">
                  <span className="text-charcoal-600">Eligible Candidate Pool:</span>
                  <strong className="text-sage-700">{funnelData.final_eligible_count} / {totalCohortSize} patients</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-charcoal-600">Estimated Accrual Delay Penalty:</span>
                  <strong className="text-charcoal-900">4.2 Months ($2.4M saved if optimized)</strong>
                </div>
              </div>

              <p className="text-charcoal-600 text-[11px] leading-relaxed">
                This document compiles the schedule of assessments deconstruction, sensitivity analysis, and regulatory feasibility amendments for institutional review board submission.
              </p>
            </div>

            <div className="p-4 bg-linen-100 border-t border-linen-300 flex items-center justify-end space-x-2">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 text-xs font-medium rounded-full border border-linen-300 bg-white text-charcoal-700 hover:bg-linen-200 transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="px-5 py-2 text-xs font-semibold rounded-full bg-charcoal-900 text-white hover:bg-charcoal-800 shadow-sm flex items-center space-x-1.5 transition-colors"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Print Dossier</span>
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
        />
      )}
    </div>
  );
};
