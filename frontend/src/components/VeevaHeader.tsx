import type { FC } from 'react';
import { 
  Building2, 
  Download, 
  Database, 
  ChevronRight, 
  AlertCircle
} from 'lucide-react';

interface VeevaHeaderProps {
  protocolId: string;
  protocolTitle: string;
  phase: string;
  totalCohortSize: number;
  screenFailureRate: number;
  compositePbi: number;
  onExportAudit: () => void;
}

export const VeevaHeader: FC<VeevaHeaderProps> = ({
  protocolId,
  protocolTitle,
  phase,
  totalCohortSize,
  screenFailureRate,
  compositePbi,
  onExportAudit
}) => {
  return (
    <header className="bg-[#162842] text-white border-b border-[#243d60] sticky top-0 z-40 select-none">
      {/* Top System Bar */}
      <div className="px-4 py-2 border-b border-[#243d60] flex items-center justify-between text-xs">
        {/* Breadcrumb Hierarchy */}
        <div className="flex items-center space-x-2 text-slate-300">
          <div className="flex items-center space-x-1 font-semibold text-white tracking-wide">
            <Building2 className="h-4 w-4 text-blue-400" />
            <span className="font-mono text-sm">VAULT CLINICAL</span>
          </div>
          <span className="text-slate-500">/</span>
          <span className="text-slate-300 font-medium">Studies</span>
          <span className="text-slate-500">/</span>
          <span className="text-blue-300 font-mono font-medium">{protocolId}</span>
          <span className="text-slate-500">/</span>
          <span className="text-white font-medium">Feasibility & Patient Attrition Synthesizer</span>
        </div>

        {/* Global System Indicators & Actions */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1.5 text-[11px] text-slate-300 bg-[#0e1d32] px-2.5 py-1 rounded border border-[#243d60]">
            <Database className="h-3.5 w-3.5 text-emerald-400" />
            <span>DuckDB Cohort:</span>
            <strong className="text-white font-mono">{totalCohortSize.toLocaleString()} records</strong>
          </div>

          <div className="flex items-center space-x-1.5 text-[11px] text-slate-300 bg-[#0e1d32] px-2.5 py-1 rounded border border-[#243d60]">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono text-[10px] tracking-wider text-emerald-300 font-semibold">21 CFR PART 11 VALIDATED</span>
          </div>

          <button
            onClick={onExportAudit}
            className="flex items-center space-x-1.5 px-3 py-1 text-xs font-semibold rounded bg-[#0066b2] hover:bg-[#0077d2] text-white shadow-xs transition-colors border border-[#338cc7]"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Feasibility Dossier</span>
          </button>
        </div>
      </div>

      {/* Veeva Study Metadata & Lifecycle Ribbon */}
      <div className="px-4 py-2.5 bg-[#1b3252] flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex items-center space-x-3">
          <div className="border-r border-[#2d4d7a] pr-3">
            <div className="flex items-center space-x-2">
              <span className="font-mono font-bold text-sm text-white tracking-tight">{protocolId}</span>
              <span className="bg-[#24426d] text-blue-200 text-[11px] px-2 py-0.5 rounded font-medium border border-[#35588a]">
                {phase}
              </span>
              <span className="bg-amber-950/60 text-amber-300 text-[11px] px-2 py-0.5 rounded font-medium border border-amber-600/50 flex items-center space-x-1">
                <AlertCircle className="h-3 w-3" />
                <span>Feasibility Review (Pre-IND)</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5 max-w-xl truncate font-normal">
              {protocolTitle}
            </p>
          </div>

          {/* Quick Stats Strip */}
          <div className="flex items-center space-x-4 pl-2 text-[11px]">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Screen Failure Rate</span>
              <strong className="text-amber-300 font-mono text-xs">{screenFailureRate}%</strong>
            </div>
            <div className="border-l border-[#2d4d7a] pl-4">
              <span className="text-slate-400 block text-[10px] uppercase">Subject Burden Index</span>
              <strong className={`font-mono text-xs ${compositePbi > 65 ? 'text-rose-400' : 'text-amber-300'}`}>
                {compositePbi} / 100 ({compositePbi > 65 ? 'High Friction' : 'Moderate'})
              </strong>
            </div>
            <div className="border-l border-[#2d4d7a] pl-4">
              <span className="text-slate-400 block text-[10px] uppercase">Therapeutic Focus</span>
              <span className="text-slate-200 font-medium">Metastatic NSCLC</span>
            </div>
          </div>
        </div>

        {/* Veeva Governance Lifecycle Stepper */}
        <div className="hidden lg:flex items-center space-x-1 text-[11px] font-medium bg-[#112238] p-1 rounded border border-[#243d60]">
          <span className="px-2 py-0.5 rounded text-slate-400">1. Draft</span>
          <ChevronRight className="h-3 w-3 text-slate-600" />
          <span className="px-2.5 py-0.5 rounded bg-[#0066b2] text-white font-semibold shadow-xs">
            2. Feasibility Synthesis
          </span>
          <ChevronRight className="h-3 w-3 text-slate-600" />
          <span className="px-2 py-0.5 rounded text-slate-400">3. Protocol Review Board</span>
          <ChevronRight className="h-3 w-3 text-slate-600" />
          <span className="px-2 py-0.5 rounded text-slate-400">4. Final Sign-off</span>
        </div>
      </div>
    </header>
  );
};
