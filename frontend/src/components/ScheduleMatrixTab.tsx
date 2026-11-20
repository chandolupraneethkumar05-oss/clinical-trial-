import { useState } from 'react';
import type { FC } from 'react';
import type { Visit } from '../types/protocol';
import { Filter } from 'lucide-react';

interface ScheduleMatrixTabProps {
  visits: Visit[];
  peakWeeks: number[];
}

export const ScheduleMatrixTab: FC<ScheduleMatrixTabProps> = ({ visits, peakWeeks }) => {
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(visits[0] || null);
  const [filterHeavyOnly, setFilterHeavyOnly] = useState(false);

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'highly_invasive':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'moderately_invasive':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'minimally_invasive':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      default:
        return 'bg-clinical-50 text-clinical-600 border-clinical-200';
    }
  };

  const displayedVisits = filterHeavyOnly
    ? visits.filter(v => peakWeeks.includes(v.week_number))
    : visits;

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="bg-white rounded-xl border border-clinical-200 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-clinical-900">Schedule of Assessments (SoA) Matrix</h2>
          <p className="text-xs text-clinical-500 mt-0.5">
            Protocol timeline mapping clinical dwell times, procedure invasiveness, and restaging milestones.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setFilterHeavyOnly(!filterHeavyOnly)}
            className={`inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
              filterHeavyOnly
                ? 'bg-amber-50 border-amber-300 text-amber-800'
                : 'bg-white border-clinical-300 text-clinical-700 hover:bg-clinical-50'
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            <span>{filterHeavyOnly ? 'Showing Peak Burden Weeks Only' : 'Show All Visits'}</span>
          </button>
        </div>
      </div>

      {/* Split Grid: Visits Timeline Table (Left) + Detailed Visit Inspector (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Table of Visits */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-clinical-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-clinical-50 border-b border-clinical-200 text-clinical-500 uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4">Visit ID</th>
                  <th className="py-3 px-4">Study Week</th>
                  <th className="py-3 px-4">Visit Title</th>
                  <th className="py-3 px-4">Procedures</th>
                  <th className="py-3 px-4">Clinic Dwell</th>
                  <th className="py-3 px-4 text-right">Friction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-clinical-100">
                {displayedVisits.map((visit) => {
                  const isPeak = peakWeeks.includes(visit.week_number);
                  const isSelected = selectedVisit?.visit_id === visit.visit_id;
                  const totalMins = visit.procedures.reduce((acc, p) => acc + p.estimated_duration_minutes, 0);

                  return (
                    <tr
                      key={visit.visit_id}
                      onClick={() => setSelectedVisit(visit)}
                      className={`cursor-pointer transition-colors ${
                        isSelected 
                          ? 'bg-brand-50/60 font-medium' 
                          : 'hover:bg-clinical-50/80'
                      }`}
                    >
                      <td className="py-3 px-4 font-mono font-medium text-clinical-900">
                        {visit.visit_id}
                      </td>
                      <td className="py-3 px-4 font-mono text-clinical-600">
                        {visit.week_number < 0 ? `Wk ${visit.week_number}` : `Wk +${visit.week_number}`}
                      </td>
                      <td className="py-3 px-4 font-medium text-clinical-800">
                        {visit.visit_name}
                      </td>
                      <td className="py-3 px-4 text-clinical-600">
                        {visit.procedures.length} tests
                      </td>
                      <td className="py-3 px-4 text-clinical-700 font-mono">
                        {Math.floor(totalMins / 60)}h {totalMins % 60}m
                      </td>
                      <td className="py-3 px-4 text-right">
                        {isPeak ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
                            High Burden
                          </span>
                        ) : (
                          <span className="text-[11px] text-clinical-400 font-normal">
                            Routine
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Visit Inspector Card */}
        <div className="bg-white rounded-xl border border-clinical-200 p-6 shadow-xs flex flex-col justify-between">
          {selectedVisit ? (
            <div>
              <div className="pb-4 border-b border-clinical-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded">
                    {selectedVisit.visit_id}
                  </span>
                  <span className="text-xs text-clinical-500 font-mono">
                    Study Week {selectedVisit.week_number}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-clinical-900 mt-2">
                  {selectedVisit.visit_name}
                </h3>
              </div>

              {/* Procedures Breakdown */}
              <div className="mt-4">
                <h4 className="text-xs font-semibold text-clinical-500 uppercase tracking-wider mb-3">
                  Protocol Procedures ({selectedVisit.procedures.length})
                </h4>
                <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                  {selectedVisit.procedures.map((p, idx) => (
                    <div 
                      key={idx}
                      className="p-3 bg-clinical-50 rounded-lg border border-clinical-100 text-xs flex flex-col space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-clinical-900">{p.name}</span>
                        <span className="font-mono text-clinical-500 text-[11px]">
                          {p.estimated_duration_minutes}m
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium border ${getCategoryBadge(p.category)}`}>
                          {p.category.replace('_', ' ')}
                        </span>
                        {p.fasting_required && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            Fasting Required
                          </span>
                        )}
                        {p.sedation_or_recovery_required && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded font-medium bg-rose-50 text-rose-700 border border-rose-200">
                            Sedation / Recovery
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-clinical-400 text-xs">
              Select a visit from the table to inspect procedures.
            </div>
          )}

          {selectedVisit && (
            <div className="mt-6 pt-4 border-t border-clinical-100 text-xs text-clinical-600 flex items-center justify-between">
              <span>Total Estimated Dwell:</span>
              <strong className="text-clinical-900 font-mono text-sm">
                {selectedVisit.procedures.reduce((acc, p) => acc + p.estimated_duration_minutes, 0)} minutes
              </strong>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
