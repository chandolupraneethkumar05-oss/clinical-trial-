import { useState } from 'react';
import type { FC } from 'react';
import type { BenchmarkTrial } from '../types/protocol';
import { CheckCircle2, XCircle, Search, ExternalLink } from 'lucide-react';

interface BenchmarkGridProps {
  benchmarks: BenchmarkTrial[];
}

export const BenchmarkGrid: FC<BenchmarkGridProps> = ({ benchmarks }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLETED' | 'TERMINATED'>('ALL');

  const filtered = benchmarks.filter(t => {
    const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          t.nct_id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || t.actual_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="bg-white border border-[#d8dee4] rounded shadow-xs select-none">
      {/* Table Header & Controls Bar */}
      <div className="p-3 border-b border-[#d8dee4] bg-[#f8fafc] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
        <div>
          <h2 className="font-semibold text-slate-900 text-sm">
            Empirical Historical Benchmark Portfolio
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Validation of ProtocolShield predictive burden models against real-world completed vs terminated Phase III trials from ClinicalTrials.gov.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Status Segmented Filter */}
          <div className="flex bg-slate-200 p-0.5 rounded text-[11px] font-medium text-slate-700">
            {(['ALL', 'COMPLETED', 'TERMINATED'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setStatusFilter(mode)}
                className={`px-2 py-0.5 rounded transition-colors ${
                  statusFilter === mode ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'hover:text-slate-900'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-2 text-slate-400" />
            <input
              type="text"
              placeholder="Filter by NCT ID or title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1 text-xs rounded border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 w-56 bg-white"
            />
          </div>
        </div>
      </div>

      {/* Veeva Clinical Grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#f1f5f9] border-b border-[#d8dee4] text-slate-700 text-[11px] uppercase font-bold tracking-wider">
              <th className="py-2.5 px-3">NCT Identifier</th>
              <th className="py-2.5 px-3 min-w-[280px]">Official Study Title & Phase</th>
              <th className="py-2.5 px-3">Trial Status</th>
              <th className="py-2.5 px-3 font-mono text-right">Enrolled / Target</th>
              <th className="py-2.5 px-3 font-mono">Predicted PBI</th>
              <th className="py-2.5 px-3">Predictive Verdict</th>
              <th className="py-2.5 px-3">Identified Friction Drivers</th>
              <th className="py-2.5 px-3 text-right">Registry</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef2f6]">
            {filtered.map((trial) => {
              const isCompleted = trial.actual_status === 'COMPLETED';

              return (
                <tr key={trial.nct_id} className="hover:bg-slate-50 transition-colors">
                  {/* NCT ID */}
                  <td className="py-2.5 px-3 font-mono font-bold text-blue-700 text-[11px]">
                    {trial.nct_id}
                  </td>

                  {/* Title & Phase */}
                  <td className="py-2.5 px-3">
                    <span className="font-semibold text-slate-900 block leading-tight">{trial.title}</span>
                    <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">{trial.phase}</span>
                    {trial.termination_reason && (
                      <span className="text-[10px] text-rose-700 font-medium block mt-1 bg-rose-50 p-1 rounded border border-rose-200">
                        Termination Note: {trial.termination_reason}
                      </span>
                    )}
                  </td>

                  {/* Status Badge */}
                  <td className="py-2.5 px-3">
                    <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                      isCompleted 
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                        : 'bg-rose-50 text-rose-800 border-rose-200'
                    }`}>
                      {isCompleted ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : <XCircle className="h-3 w-3 text-rose-600" />}
                      <span>{trial.actual_status}</span>
                    </span>
                  </td>

                  {/* Accrual */}
                  <td className="py-2.5 px-3 font-mono text-slate-800 text-right text-[11px]">
                    {trial.enrolled_patients} {trial.target_enrollment ? `/ ${trial.target_enrollment}` : ''}
                  </td>

                  {/* PBI Score */}
                  <td className="py-2.5 px-3 font-mono text-[11px]">
                    <span className={`font-bold ${trial.predicted_pbi > 70 ? 'text-rose-700' : 'text-slate-800'}`}>
                      {trial.predicted_pbi}
                    </span>
                    <span className="text-[10px] text-slate-500 block">({trial.burden_tier})</span>
                  </td>

                  {/* Verdict */}
                  <td className="py-2.5 px-3 text-[11px]">
                    <span className="font-medium text-slate-800 block">
                      {trial.termination_risk_predicted}
                    </span>
                  </td>

                  {/* Complexity Flags */}
                  <td className="py-2.5 px-3 text-[10px] text-slate-600">
                    <ul className="space-y-0.5">
                      {trial.protocol_complexity_flags.slice(0, 2).map((fl, idx) => (
                        <li key={idx} className="flex items-center space-x-1 truncate max-w-xs" title={fl}>
                          <span>•</span>
                          <span className="truncate">{fl}</span>
                        </li>
                      ))}
                    </ul>
                  </td>

                  {/* External Link */}
                  <td className="py-2.5 px-3 text-right">
                    <a
                      href={`https://clinicaltrials.gov/study/${trial.nct_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center space-x-1 text-blue-600 hover:text-blue-800 font-medium text-[11px]"
                    >
                      <span>Record</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Grid Footer Summary */}
      <div className="p-3 bg-[#f8fafc] border-t border-[#d8dee4] text-[11px] text-slate-500 flex justify-between items-center">
        <span>Showing {filtered.length} of {benchmarks.length} historical trial protocols</span>
        <span className="font-mono text-[10px]">Data extracted from ClinicalTrials.gov API v2</span>
      </div>
    </div>
  );
};
