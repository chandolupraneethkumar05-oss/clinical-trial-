import { useState } from 'react';
import type { FC } from 'react';
import type { 
  ClinicalProtocol, 
  FunnelSimulationResult, 
  RetentionPoint, 
  BenchmarkTrial,
  Visit,
  Procedure
} from '../types/protocol';
import { ScheduleOfEventsMatrix } from './ScheduleOfEventsMatrix';
import { BurdenOverviewTab } from './BurdenOverviewTab';
import { WhatIfSensitivityConsole } from './WhatIfSensitivityConsole';
import { BenchmarkGrid } from './BenchmarkGrid';
import { AuditTrailView } from './AuditTrailView';
import { ProtocolInspectorDrawer } from './ProtocolInspectorDrawer';
import { 
  ArrowLeft, 
  Download, 
  Database, 
  FileText, 
  FileCheck2,
  Printer,
  Upload,
  X
} from 'lucide-react';

interface StudioWorkspaceProps {
  protocol: ClinicalProtocol;
  totalCohortSize: number;
  funnelData: FunnelSimulationResult;
  retentionCurve: RetentionPoint[];
  benchmarks: BenchmarkTrial[];
  onBackToLanding: () => void;
  onSimulateFunnel: (criteria: Record<string, unknown>) => Promise<FunnelSimulationResult>;
  onOpenUpload: () => void;
  onCalculateRetention: (enrolled: number, pbi: number) => Promise<RetentionPoint[]>;
}

export const StudioWorkspace: FC<StudioWorkspaceProps> = ({
  protocol,
  totalCohortSize,
  funnelData,
  retentionCurve,
  benchmarks,
  onBackToLanding,
  onSimulateFunnel,
  onCalculateRetention,
  onOpenUpload
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'soe' | 'sandbox' | 'benchmarks' | 'audit'>('sandbox');
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
  const [selectedProcedure, setSelectedProcedure] = useState<Procedure | null>(null);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [activeLinkedClause, setActiveLinkedClause] = useState<string | null>('egfr');

  return (
    <div className="min-h-screen bg-linen-100 flex flex-col font-sans text-charcoal-900 selection:bg-terracotta-100 selection:text-terracotta-700">
      {/* Studio Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-linen-100/90 backdrop-blur-md border-b border-linen-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={onBackToLanding}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-charcoal-700 bg-white border border-linen-300 hover:bg-linen-200 transition-colors shadow-2xs"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Overview</span>
            </button>

            <div className="flex items-center space-x-2 border-l border-linen-300 pl-4">
              <span className="font-serif font-bold text-sm text-charcoal-900 tracking-tight">
                {protocol.protocol_id}
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-linen-200 text-charcoal-700 border border-linen-300">
                {protocol.phase}
              </span>
              <span className="hidden md:inline-block text-xs text-charcoal-500 max-w-xs truncate">
                {protocol.title}
              </span>
              {protocol.source_filename && (
                <span className="hidden lg:inline-flex items-center space-x-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-sage-100 text-sage-700 border border-sage-200">
                  <FileText className="h-2.5 w-2.5" />
                  <span>{protocol.extracted_page_count ? `PDF · ${protocol.extracted_page_count}pp` : "PDF"}</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="hidden sm:flex items-center space-x-1.5 text-xs text-charcoal-700 bg-white px-3 py-1.5 rounded-full border border-linen-300">
              <Database className="h-3.5 w-3.5 text-sage-600" />
              <span>DuckDB In-Memory:</span>
              <strong className="font-mono text-charcoal-900">{totalCohortSize.toLocaleString()} records</strong>
            </div>

            <button
              onClick={onOpenUpload}
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-full bg-terracotta-600 hover:bg-terracotta-500 text-white shadow-xs transition-colors"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Load Protocol</span>
            </button>

            <button
              onClick={() => setShowExportModal(true)}
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-full bg-charcoal-900 hover:bg-charcoal-800 text-white shadow-xs transition-colors"
            >
              <Download className="h-3.5 w-3.5 text-terracotta-200" />
              <span>Export Dossier</span>
            </button>
          </div>
        </div>

        {/* Studio Sub-Header Tabs */}
        <div className="bg-white border-t border-linen-200 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <nav className="flex space-x-2 py-2 overflow-x-auto">
              <button
                onClick={() => setActiveTab('sandbox')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  activeTab === 'sandbox'
                    ? 'bg-charcoal-900 text-white shadow-xs'
                    : 'text-charcoal-600 hover:bg-linen-100'
                }`}
              >
                What-If Sensitivity Sandbox
              </button>

              <button
                onClick={() => setActiveTab('soe')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  activeTab === 'soe'
                    ? 'bg-charcoal-900 text-white shadow-xs'
                    : 'text-charcoal-600 hover:bg-linen-100'
                }`}
              >
                Schedule of Assessments (SoA)
              </button>

              <button
                onClick={() => setActiveTab('overview')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  activeTab === 'overview'
                    ? 'bg-charcoal-900 text-white shadow-xs'
                    : 'text-charcoal-600 hover:bg-linen-100'
                }`}
              >
                Tufts CSDD Burden Decomposition
              </button>

              <button
                onClick={() => setActiveTab('benchmarks')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  activeTab === 'benchmarks'
                    ? 'bg-charcoal-900 text-white shadow-xs'
                    : 'text-charcoal-600 hover:bg-linen-100'
                }`}
              >
                Historical Benchmarks ({benchmarks.length})
              </button>

              <button
                onClick={() => setActiveTab('audit')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  activeTab === 'audit'
                    ? 'bg-charcoal-900 text-white shadow-xs'
                    : 'text-charcoal-600 hover:bg-linen-100'
                }`}
              >
                21 CFR Part 11 Audit Trail
              </button>
            </nav>

            <div className="hidden lg:flex items-center space-x-3 text-xs font-mono">
              <span className="text-charcoal-500">Screen Failure: <strong className="text-terracotta-600">{funnelData.screen_failure_rate}%</strong></span>
              <span className="text-linen-400">|</span>
              <span className="text-charcoal-500">PBI Index: <strong className="text-charcoal-900">{protocol.burden.composite_pbi_score}/100</strong></span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Studio Body: Document (Left) + Intelligence (Right) */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Interactive Ground-Truth Protocol Reader (5 cols) */}
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
                  protocol.source_filename?.startsWith('PS-') || !protocol.extracted_page_count
                    ? 'bg-linen-200 text-charcoal-700'
                    : 'bg-sage-100 text-sage-700'
                }`}>
                  {protocol.extracted_page_count ? 'PDF EXTRACTED' : 'LINKED EVIDENCE'}
                </span>
              </div>

              <div className="mt-3 space-y-3 text-xs text-charcoal-800 font-serif leading-relaxed max-h-[600px] overflow-y-auto pr-1">
                <div className="p-3 bg-linen-50 rounded-xl border border-linen-200">
                  <span className="text-[10px] font-mono uppercase text-charcoal-500 block mb-1">
                    Protocol Title
                  </span>
                  <p className="font-bold text-charcoal-900 text-xs">
                    {protocol.title}
                  </p>
                </div>

                {/* Criterion: eGFR */}
                <div
                  onClick={() => setActiveLinkedClause('egfr')}
                  className={`p-3 rounded-xl cursor-pointer transition-all ${
                    activeLinkedClause === 'egfr'
                      ? 'bg-terracotta-50 border-2 border-terracotta-500 shadow-2xs'
                      : 'bg-white border border-linen-300 hover:bg-linen-50'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono font-bold text-terracotta-700 mb-1">
                    <span>SECTION 4.2.1 â€” RENAL EXCLUSION</span>
                    <span className="px-1.5 py-0.2 rounded bg-terracotta-100 text-terracotta-800">
                      RISK ATTRITION
                    </span>
                  </div>
                  <p className="text-charcoal-900 text-xs">
                    "Adequate renal clearance: Serum creatinine â‰¤ 1.5 x ULN or <strong>eGFR â‰¥ 60 mL/min/1.73mÂ²</strong>."
                  </p>
                  <span className="text-[10px] font-sans text-charcoal-500 mt-1 block">
                    Eliminates 18.4% of eligible subjects due to mild age-related renal variance.
                  </span>
                </div>

                {/* Criterion: Biopsy */}
                <div
                  onClick={() => setActiveLinkedClause('biopsy')}
                  className={`p-3 rounded-xl cursor-pointer transition-all ${
                    activeLinkedClause === 'biopsy'
                      ? 'bg-terracotta-50 border-2 border-terracotta-500 shadow-2xs'
                      : 'bg-white border border-linen-300 hover:bg-linen-50'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono font-bold text-terracotta-700 mb-1">
                    <span>SECTION 4.3 â€” RE-BIOPSY MANDATE</span>
                    <span className="px-1.5 py-0.2 rounded bg-terracotta-100 text-terracotta-800">
                      PEAK BURDEN
                    </span>
                  </div>
                  <p className="text-charcoal-900 text-xs">
                    "At Week 12 (Cycle 5), subject must consent to <strong>mandatory core needle tumor re-biopsy</strong> concurrent with RECIST CT imaging."
                  </p>
                  <span className="text-[10px] font-sans text-charcoal-500 mt-1 block">
                    Clusters 6.5 hours of clinic dwell and post-sedation recovery.
                  </span>
                </div>

                {/* Criterion: CNS Metastases */}
                <div
                  onClick={() => setActiveLinkedClause('cns')}
                  className={`p-3 rounded-xl cursor-pointer transition-all ${
                    activeLinkedClause === 'cns'
                      ? 'bg-terracotta-50 border-2 border-terracotta-500 shadow-2xs'
                      : 'bg-white border border-linen-300 hover:bg-linen-50'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono font-bold text-terracotta-700 mb-1">
                    <span>SECTION 4.2.2 â€” CNS EXCLUSION</span>
                    <span className="px-1.5 py-0.2 rounded bg-terracotta-100 text-terracotta-800">
                      POPULATION DROPOUT
                    </span>
                  </div>
                  <p className="text-charcoal-900 text-xs">
                    "Exclusion: Presence of any untreated or <strong>prior treated asymptomatic central nervous system metastases</strong>."
                  </p>
                  <span className="text-[10px] font-sans text-charcoal-500 mt-1 block">
                    Disqualifies 24% of all metastatic Stage IV lung cancer candidates.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Precision Intelligence Console (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            {activeTab === 'sandbox' && (
              <WhatIfSensitivityConsole
                initialFunnel={funnelData}
                initialRetention={retentionCurve}
                onSimulateFunnel={onSimulateFunnel}
                onCalculateRetention={onCalculateRetention}
              />
            )}

            {activeTab === 'soe' && (
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

            {activeTab === 'overview' && (
              <BurdenOverviewTab
                protocol={protocol}
                screenFailureRate={funnelData.screen_failure_rate}
                finalEligibleCount={funnelData.final_eligible_count}
              />
            )}

            {activeTab === 'benchmarks' && (
              <BenchmarkGrid benchmarks={benchmarks} />
            )}

            {activeTab === 'audit' && (
              <AuditTrailView />
            )}
          </div>
        </div>
      </div>

      {/* Contextual Inspector Drawer */}
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
        <div className="fixed inset-0 bg-charcoal-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-linen-300 max-w-xl w-full rounded-2xl shadow-xl overflow-hidden space-y-4">
            <div className="p-4 bg-charcoal-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FileCheck2 className="h-5 w-5 text-terracotta-200" />
                <div>
                  <h3 className="font-serif font-bold text-sm">Trial Feasibility & Attrition Dossier</h3>
                  <p className="text-[11px] text-charcoal-200">Executive Protocol Review Board Submission</p>
                </div>
              </div>
              <button 
                onClick={() => setShowExportModal(false)}
                className="text-charcoal-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-3 text-xs text-charcoal-800">
              <p>
                <strong>Study:</strong> {protocol.protocol_id} â€” {protocol.title}
              </p>
              <div className="p-3 bg-linen-100 rounded-xl border border-linen-300 space-y-1 font-mono text-[11px]">
                <div><strong>Composite Patient Burden Index:</strong> {protocol.burden.composite_pbi_score} / 100 ({protocol.burden.attrition_risk_tier})</div>
                <div><strong>Screen Failure Projection:</strong> {funnelData.screen_failure_rate}%</div>
                <div><strong>Eligible Candidate Pool:</strong> {funnelData.final_eligible_count} / {totalCohortSize} patients</div>
                <div><strong>Estimated Delay Penalty:</strong> 4.2 Months ($2.4M saved if optimized)</div>
              </div>
              <p className="text-charcoal-600 text-[11px] leading-relaxed">
                This document compiles the schedule of assessments deconstruction, sensitivity analysis, and regulatory feasibility amendments for protocol steering committee review.
              </p>
            </div>

            <div className="p-4 bg-linen-100 border-t border-linen-300 flex items-center justify-end space-x-2">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-3.5 py-1.5 text-xs font-medium rounded-full border border-linen-300 bg-white text-charcoal-700 hover:bg-linen-200"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-1.5 text-xs font-semibold rounded-full bg-charcoal-900 text-white hover:bg-charcoal-800 shadow-2xs flex items-center space-x-1.5"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Print Dossier</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};




