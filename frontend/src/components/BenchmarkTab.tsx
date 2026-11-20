import { useState } from 'react';
import type { FC } from 'react';
import type { BenchmarkTrial } from '../types/protocol';
import { CheckCircle2, XCircle, Search, ExternalLink } from 'lucide-react';

interface BenchmarkTabProps {
  benchmarks: BenchmarkTrial[];
}

export const BenchmarkTab: FC<BenchmarkTabProps> = ({ benchmarks }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = benchmarks.filter(t => 
    t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.nct_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Benchmark Header */}
      <div className="bg-white rounded-xl border border-clinical-200 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-clinical-900">Historical Protocol Verification & Benchmarks</h2>
          <p className="text-xs text-clinical-500 mt-0.5">
            Empirical validation testing ProtocolShield against real-world completed vs terminated Phase III trials from ClinicalTrials.gov.
          </p>
        </div>

        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-2.5 text-clinical-400" />
          <input
            type="text"
            placeholder="Search NCT ID or title..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-4 py-1.5 text-xs rounded-md border border-clinical-300 focus:outline-none focus:ring-1 focus:ring-brand-500 w-64"
          />
        </div>
      </div>

      {/* Trial Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filtered.map((trial) => {
          const isCompleted = trial.actual_status === 'COMPLETED';

          return (
            <div 
              key={trial.nct_id}
              className={`bg-white rounded-xl border p-5 shadow-xs transition-shadow hover:shadow-sm flex flex-col justify-between ${
                isCompleted ? 'border-clinical-200' : 'border-rose-200 bg-rose-50/10'
              }`}
            >
              <div>
                {/* Status Badges */}
                <div className="flex items-center justify-between pb-3 border-b border-clinical-100">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs font-bold text-clinical-800 bg-clinical-100 px-2 py-0.5 rounded">
                      {trial.nct_id}
                    </span>
                    <span className="text-xs text-clinical-500 font-medium">{trial.phase}</span>
                  </div>

                  <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                    isCompleted 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                      : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}>
                    {isCompleted ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    <span>{trial.actual_status}</span>
                  </span>
                </div>

                {/* Title */}
                <h3 className="text-sm font-semibold text-clinical-900 mt-3 line-clamp-2 leading-snug">
                  {trial.title}
                </h3>

                {trial.termination_reason && (
                  <div className="mt-3 p-2.5 bg-rose-50 border border-rose-200 rounded text-xs text-rose-900">
                    <strong className="block text-[11px] uppercase tracking-wider text-rose-700 font-semibold mb-0.5">
                      Clinical Termination Reason:
                    </strong>
                    {trial.termination_reason}
                  </div>
                )}

                {/* Model Predictions */}
                <div className="mt-4 pt-3 border-t border-clinical-100 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-clinical-400 block text-[11px]">ProtocolShield PBI:</span>
                    <strong className={`font-mono text-sm ${trial.predicted_pbi > 70 ? 'text-rose-700' : 'text-clinical-800'}`}>
                      {trial.predicted_pbi} / 100 ({trial.burden_tier})
                    </strong>
                  </div>
                  <div>
                    <span className="text-clinical-400 block text-[11px]">Enrolled / Target:</span>
                    <strong className="font-mono text-clinical-800">
                      {trial.enrolled_patients} {trial.target_enrollment ? `/ ${trial.target_enrollment}` : 'pts'}
                    </strong>
                  </div>
                </div>

                {/* Complexity Flags */}
                <div className="mt-4">
                  <span className="text-[11px] uppercase tracking-wider text-clinical-400 font-semibold block mb-1.5">
                    Protocol Complexity Drivers:
                  </span>
                  <ul className="space-y-1 text-xs text-clinical-600">
                    {trial.protocol_complexity_flags.map((flag, idx) => (
                      <li key={idx} className="flex items-start space-x-1.5">
                        <span className="h-1 w-1 rounded-full bg-clinical-400 mt-1.5 shrink-0" />
                        <span>{flag}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Card Footer Link */}
              <div className="mt-5 pt-3 border-t border-clinical-100 flex items-center justify-between text-xs text-clinical-500">
                <span>Predicted: <strong className="text-clinical-800 font-medium">{trial.termination_risk_predicted}</strong></span>
                <a
                  href={`https://clinicaltrials.gov/study/${trial.nct_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center space-x-1 text-brand-600 hover:text-brand-700 font-medium"
                >
                  <span>ClinicalTrials.gov</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
