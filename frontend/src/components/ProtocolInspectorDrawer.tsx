import type { FC } from 'react';
import type { Visit, Procedure } from '../types/protocol';
import { 
  X, 
  FileText 
} from 'lucide-react';

interface ProtocolInspectorDrawerProps {
  selectedVisit: Visit | null;
  selectedProcedure: Procedure | null;
  onClose: () => void;
}

export const ProtocolInspectorDrawer: FC<ProtocolInspectorDrawerProps> = ({
  selectedVisit,
  selectedProcedure,
  onClose
}) => {
  if (!selectedVisit && !selectedProcedure) return null;

  return (
    <div className="w-80 bg-white border-l border-[#d8dee4] flex flex-col shrink-0 text-xs shadow-xs select-none">
      {/* Drawer Header */}
      <div className="p-3 border-b border-[#d8dee4] bg-[#f8fafc] flex items-center justify-between">
        <div className="flex items-center space-x-1.5 font-bold uppercase tracking-wider text-slate-700 text-[11px]">
          <FileText className="h-3.5 w-3.5 text-blue-600" />
          <span>Clinical Inspector</span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700 p-0.5 rounded"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Drawer Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {selectedProcedure ? (
          <div>
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
              PROCEDURE DETAIL
            </span>
            <h3 className="font-bold text-slate-900 text-sm mt-1.5">
              {selectedProcedure.name}
            </h3>

            <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
              <div className="flex justify-between">
                <span className="text-slate-500">Invasiveness Tier:</span>
                <span className="font-semibold text-slate-800 capitalize font-mono">
                  {selectedProcedure.category.replace('_', ' ')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tufts Invasiveness Wt:</span>
                <span className="font-mono font-bold text-slate-900">
                  {selectedProcedure.invasiveness_weight} pts
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Clinical Dwell:</span>
                <span className="font-mono text-slate-800">
                  {selectedProcedure.estimated_duration_minutes} minutes
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Fasting Mandate:</span>
                <span className={`font-medium ${selectedProcedure.fasting_required ? 'text-amber-700' : 'text-slate-600'}`}>
                  {selectedProcedure.fasting_required ? 'Mandatory (8-12 hrs)' : 'None'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Post-Procedure Sedation:</span>
                <span className={`font-medium ${selectedProcedure.sedation_or_recovery_required ? 'text-rose-700' : 'text-slate-600'}`}>
                  {selectedProcedure.sedation_or_recovery_required ? 'Required (Recovery Room)' : 'None'}
                </span>
              </div>
            </div>

            <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-600 leading-relaxed">
              <strong className="block text-slate-800 font-semibold mb-0.5">Regulatory Feasibility Impact:</strong>
              This procedure carries an empirical invasiveness rating of {selectedProcedure.invasiveness_weight}. In oncology trials, procedures with recovery observation demand prior transportation arrangement and dedicated site nurse allocation.
            </div>
          </div>
        ) : selectedVisit ? (
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                VISIT {selectedVisit.visit_id}
              </span>
              <span className="text-slate-500 font-mono text-[11px]">
                {selectedVisit.week_number < 0 ? `Week ${selectedVisit.week_number}` : `Week +${selectedVisit.week_number}`}
              </span>
            </div>

            <h3 className="font-bold text-slate-900 text-sm mt-1.5">
              {selectedVisit.visit_name}
            </h3>

            <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
              <div className="flex justify-between">
                <span className="text-slate-500">Total Procedures:</span>
                <span className="font-mono font-bold text-slate-900">{selectedVisit.procedures.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Clinic Dwell:</span>
                <span className="font-mono text-slate-800 font-bold">
                  {Math.floor(selectedVisit.procedures.reduce((acc, p) => acc + p.estimated_duration_minutes, 0) / 60)}h{' '}
                  {selectedVisit.procedures.reduce((acc, p) => acc + p.estimated_duration_minutes, 0) % 60}m
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Invasiveness Points:</span>
                <span className="font-mono text-slate-900 font-bold">
                  {selectedVisit.procedures.reduce((acc, p) => acc + p.invasiveness_weight, 0).toFixed(1)} pts
                </span>
              </div>
            </div>

            <div className="mt-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
                Scheduled Tests ({selectedVisit.procedures.length})
              </span>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {selectedVisit.procedures.map((p, idx) => (
                  <div key={idx} className="p-2 bg-slate-50 rounded border border-slate-200 text-[11px]">
                    <div className="flex justify-between font-medium text-slate-900">
                      <span>{p.name}</span>
                      <span className="font-mono text-slate-500 text-[10px]">{p.estimated_duration_minutes}m</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Drawer Footer */}
      <div className="p-3 border-t border-[#d8dee4] bg-[#f8fafc] text-[10px] text-slate-500 flex items-center justify-between">
        <span>Veeva Vault Clinical Inspector</span>
        <span className="font-mono">ICH GCP E6</span>
      </div>
    </div>
  );
};
