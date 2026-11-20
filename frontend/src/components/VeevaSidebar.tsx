import type { FC } from 'react';
import { 
  FileText, 
  Table2, 
  Filter, 
  SlidersHorizontal, 
  History, 
  FileCheck,
  ChevronDown,
  Layers
} from 'lucide-react';

export type VeevaViewMode = 'soe' | 'overview' | 'funnel' | 'sensitivity' | 'benchmarks' | 'audit';

interface VeevaSidebarProps {
  currentView: VeevaViewMode;
  onSelectView: (view: VeevaViewMode) => void;
  visitCount: number;
  benchmarkCount: number;
}

export const VeevaSidebar: FC<VeevaSidebarProps> = ({
  currentView,
  onSelectView,
  visitCount,
  benchmarkCount
}) => {
  return (
    <aside className="w-64 bg-[#f8fafc] border-r border-[#d8dee4] flex flex-col shrink-0 select-none">
      {/* Sidebar Header */}
      <div className="p-3 border-b border-[#d8dee4] bg-[#f1f5f9] flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center space-x-1.5">
          <Layers className="h-3.5 w-3.5 text-slate-500" />
          <span>Protocol Explorer</span>
        </span>
        <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 rounded bg-slate-200 text-slate-700">
          v1.4
        </span>
      </div>

      {/* Navigation Tree */}
      <div className="flex-1 overflow-y-auto p-2 space-y-4 text-xs">
        {/* Group 1: Study Protocol Architecture */}
        <div>
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Study Structure</span>
            <ChevronDown className="h-3 w-3 text-slate-400" />
          </div>
          <div className="mt-1 space-y-0.5">
            <button
              onClick={() => onSelectView('soe')}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded text-left transition-colors ${
                currentView === 'soe'
                  ? 'bg-[#e2e8f0] text-[#0f2440] font-semibold border-l-3 border-[#0066b2]'
                  : 'text-slate-700 hover:bg-[#eef2f6]'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Table2 className="h-3.5 w-3.5 text-slate-500" />
                <span>Schedule of Events (SoE)</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-200 text-slate-600 font-medium">
                {visitCount} vsts
              </span>
            </button>

            <button
              onClick={() => onSelectView('overview')}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded text-left transition-colors ${
                currentView === 'overview'
                  ? 'bg-[#e2e8f0] text-[#0f2440] font-semibold border-l-3 border-[#0066b2]'
                  : 'text-slate-700 hover:bg-[#eef2f6]'
              }`}
            >
              <div className="flex items-center space-x-2">
                <FileText className="h-3.5 w-3.5 text-slate-500" />
                <span>Tufts CSDD Burden Audit</span>
              </div>
            </button>
          </div>
        </div>

        {/* Group 2: Subject Accrual & Sensitivity */}
        <div>
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Analytical Synthesis</span>
            <ChevronDown className="h-3 w-3 text-slate-400" />
          </div>
          <div className="mt-1 space-y-0.5">
            <button
              onClick={() => onSelectView('sensitivity')}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded text-left transition-colors ${
                currentView === 'sensitivity'
                  ? 'bg-[#e2e8f0] text-[#0f2440] font-semibold border-l-3 border-[#0066b2]'
                  : 'text-slate-700 hover:bg-[#eef2f6]'
              }`}
            >
              <div className="flex items-center space-x-2">
                <SlidersHorizontal className="h-3.5 w-3.5 text-blue-600" />
                <span>What-If Criteria Optimizer</span>
              </div>
              <span className="text-[9px] font-mono font-bold px-1 rounded bg-blue-100 text-blue-700 border border-blue-200">
                LIVE
              </span>
            </button>

            <button
              onClick={() => onSelectView('funnel')}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded text-left transition-colors ${
                currentView === 'funnel'
                  ? 'bg-[#e2e8f0] text-[#0f2440] font-semibold border-l-3 border-[#0066b2]'
                  : 'text-slate-700 hover:bg-[#eef2f6]'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Filter className="h-3.5 w-3.5 text-slate-500" />
                <span>Eligibility Screening Funnel</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-200 text-slate-600 font-medium">
                10k pts
              </span>
            </button>
          </div>
        </div>

        {/* Group 3: Benchmarks & Regulatory */}
        <div>
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Compliance & Historical</span>
            <ChevronDown className="h-3 w-3 text-slate-400" />
          </div>
          <div className="mt-1 space-y-0.5">
            <button
              onClick={() => onSelectView('benchmarks')}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded text-left transition-colors ${
                currentView === 'benchmarks'
                  ? 'bg-[#e2e8f0] text-[#0f2440] font-semibold border-l-3 border-[#0066b2]'
                  : 'text-slate-700 hover:bg-[#eef2f6]'
              }`}
            >
              <div className="flex items-center space-x-2">
                <History className="h-3.5 w-3.5 text-slate-500" />
                <span>ClinicalTrials.gov Benchmarks</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-200 text-slate-600 font-medium">
                {benchmarkCount}
              </span>
            </button>

            <button
              onClick={() => onSelectView('audit')}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded text-left transition-colors ${
                currentView === 'audit'
                  ? 'bg-[#e2e8f0] text-[#0f2440] font-semibold border-l-3 border-[#0066b2]'
                  : 'text-slate-700 hover:bg-[#eef2f6]'
              }`}
            >
              <div className="flex items-center space-x-2">
                <FileCheck className="h-3.5 w-3.5 text-slate-500" />
                <span>21 CFR Part 11 Audit Trail</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Sidebar Footer: System Status */}
      <div className="p-3 border-t border-[#d8dee4] bg-[#f1f5f9] text-[11px] text-slate-500 space-y-1">
        <div className="flex justify-between">
          <span>OLAP Engine:</span>
          <strong className="text-slate-700 font-mono">DuckDB In-Memory</strong>
        </div>
        <div className="flex justify-between">
          <span>Latency:</span>
          <span className="text-emerald-700 font-mono font-medium">sub-5ms</span>
        </div>
      </div>
    </aside>
  );
};
