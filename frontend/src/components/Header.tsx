import type { FC } from 'react';
import { ShieldCheck, Download, Activity } from 'lucide-react';

interface HeaderProps {
  protocolId: string;
  protocolTitle: string;
  phase: string;
  totalCohortSize: number;
  onExportAudit: () => void;
}

export const Header: FC<HeaderProps> = ({
  protocolId,
  protocolTitle,
  phase,
  totalCohortSize,
  onExportAudit
}) => {
  return (
    <header className="bg-clinical-900 border-b border-clinical-800 text-white sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Identity */}
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-lg bg-brand-700 flex items-center justify-center text-white shadow-sm ring-1 ring-white/10">
              <ShieldCheck className="h-6 w-6 text-brand-100" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-lg tracking-tight text-white">ProtocolShield</span>
                <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-clinical-800 text-brand-200 border border-clinical-700">
                  ENTERPRISE
                </span>
              </div>
              <p className="text-xs text-clinical-400">Clinical Feasibility & Patient Attrition Synthesizer</p>
            </div>
          </div>

          {/* Active Study Pill */}
          <div className="hidden md:flex items-center space-x-3 bg-clinical-800/80 px-3.5 py-1.5 rounded-md border border-clinical-700">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <div className="text-left">
              <div className="flex items-center space-x-2">
                <span className="font-mono text-xs font-semibold text-white">{protocolId}</span>
                <span className="text-xs px-1.5 py-0.2 rounded bg-clinical-700 text-clinical-300 font-medium">{phase}</span>
              </div>
              <p className="text-[11px] text-clinical-400 truncate max-w-xs">{protocolTitle}</p>
            </div>
          </div>

          {/* Status & Actions */}
          <div className="flex items-center space-x-3">
            <div className="hidden sm:flex items-center space-x-1.5 text-xs text-clinical-300 bg-clinical-800/40 px-2.5 py-1.5 rounded border border-clinical-700/60">
              <Activity className="h-3.5 w-3.5 text-brand-400" />
              <span>DuckDB Cohort:</span>
              <strong className="text-white font-mono">{totalCohortSize.toLocaleString()} pts</strong>
            </div>

            <button
              onClick={onExportAudit}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-brand-600 hover:bg-brand-500 text-white shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-clinical-900"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export Audit PDF</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
