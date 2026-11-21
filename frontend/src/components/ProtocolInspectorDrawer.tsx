import type { FC } from 'react';
import type { Visit, Procedure } from '../types/protocol';
import { 
  X, 
  FileText,
  Clock
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
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white border-l border-linen-300 shadow-2xl flex flex-col select-none animate-in slide-in-from-right duration-200">
      
      {/* ── Drawer Header ─────────────────────────────────────────────────── */}
      <div className="p-4 border-b border-linen-200 bg-charcoal-950 text-white flex items-center justify-between">
        <div className="flex items-center space-x-2 font-mono font-bold uppercase tracking-wider text-xs text-terracotta-300">
          <FileText className="h-4 w-4" />
          <span>Clinical Protocol Inspector</span>
        </div>
        <button
          onClick={onClose}
          className="text-charcoal-400 hover:text-white p-1 rounded-lg transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── Drawer Content ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
        
        {/* VIEW A: Procedure Detail */}
        {selectedProcedure ? (
          <div className="space-y-4">
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-terracotta-100 text-terracotta-800 border border-terracotta-200">
              PROCEDURAL METRIC
            </span>
            
            <div>
              <h3 className="font-serif font-bold text-charcoal-900 text-base leading-snug">
                {selectedProcedure.name}
              </h3>
              <p className="text-[11px] text-charcoal-500 font-mono mt-0.5">
                Standard Tufts CSDD assessment categorization
              </p>
            </div>

            <div className="space-y-2.5 border-t border-linen-200 pt-3">
              <div className="flex justify-between items-center py-1 border-b border-linen-100">
                <span className="text-charcoal-600">Invasiveness Tier:</span>
                <span className="font-semibold text-charcoal-900 capitalize font-mono text-[11px]">
                  {selectedProcedure.category.replace('_', ' ')}
                </span>
              </div>
              
              <div className="flex justify-between items-center py-1 border-b border-linen-100">
                <span className="text-charcoal-600">Tufts Invasiveness Wt:</span>
                <span className="font-mono font-bold text-terracotta-600 text-xs">
                  {selectedProcedure.invasiveness_weight} pts
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-linen-100">
                <span className="text-charcoal-600">Estimated Clinic Dwell:</span>
                <span className="font-mono font-bold text-charcoal-900 text-xs flex items-center space-x-1">
                  <Clock className="h-3 w-3 text-charcoal-400" />
                  <span>{selectedProcedure.estimated_duration_minutes} minutes</span>
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-linen-100">
                <span className="text-charcoal-600">Fasting Mandate:</span>
                <span className={`font-semibold font-mono text-[11px] ${
                  selectedProcedure.fasting_required ? 'text-amber-700' : 'text-charcoal-500'
                }`}>
                  {selectedProcedure.fasting_required ? 'Mandatory (8-12 hrs)' : 'None'}
                </span>
              </div>

              <div className="flex justify-between items-center py-1">
                <span className="text-charcoal-600">Post-Sedation Recovery:</span>
                <span className={`font-semibold font-mono text-[11px] ${
                  selectedProcedure.sedation_or_recovery_required ? 'text-terracotta-700' : 'text-charcoal-500'
                }`}>
                  {selectedProcedure.sedation_or_recovery_required ? 'Required (Recovery Bay)' : 'None'}
                </span>
              </div>
            </div>

            <div className="p-3.5 bg-linen-50 border border-linen-200 rounded-xl text-[11px] text-charcoal-700 leading-relaxed font-serif">
              <strong className="block text-charcoal-900 font-sans font-semibold mb-1">
                Operational Feasibility Note:
              </strong>
              This procedure carries an empirical invasiveness weight of {selectedProcedure.invasiveness_weight}. In multi-site oncology trials, assessments requiring sedation or extensive recovery directly compound patient travel reluctance and increase site clinic congestion.
            </div>
          </div>
        ) : selectedVisit ? (
          
          /* VIEW B: Visit Detail */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-sage-100 text-sage-800 border border-sage-200">
                VISIT {selectedVisit.visit_id}
              </span>
              <span className="text-charcoal-500 font-mono text-[11px]">
                {selectedVisit.week_number < 0 ? `Week ${selectedVisit.week_number}` : `Week +${selectedVisit.week_number}`}
              </span>
            </div>

            <div>
              <h3 className="font-serif font-bold text-charcoal-900 text-base leading-snug">
                {selectedVisit.visit_name}
              </h3>
              <p className="text-[11px] text-charcoal-500 font-mono mt-0.5">
                Visit Epoch & Assessment Cluster
              </p>
            </div>

            <div className="space-y-2.5 border-t border-linen-200 pt-3">
              <div className="flex justify-between items-center py-1 border-b border-linen-100">
                <span className="text-charcoal-600">Total Procedures:</span>
                <span className="font-mono font-bold text-charcoal-900">{selectedVisit.procedures.length}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-linen-100">
                <span className="text-charcoal-600">Total Clinic Dwell:</span>
                <span className="font-mono text-charcoal-900 font-bold">
                  {Math.floor(selectedVisit.procedures.reduce((acc, p) => acc + p.estimated_duration_minutes, 0) / 60)}h{' '}
                  {selectedVisit.procedures.reduce((acc, p) => acc + p.estimated_duration_minutes, 0) % 60}m
                </span>
              </div>

              <div className="flex justify-between items-center py-1">
                <span className="text-charcoal-600">Cumulative Invasiveness:</span>
                <span className="font-mono text-terracotta-600 font-bold text-xs">
                  {selectedVisit.procedures.reduce((acc, p) => acc + p.invasiveness_weight, 0).toFixed(1)} pts
                </span>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-500 block">
                Scheduled Tests ({selectedVisit.procedures.length})
              </span>
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {selectedVisit.procedures.map((p, idx) => (
                  <div key={idx} className="p-2.5 bg-linen-50 rounded-xl border border-linen-200 text-[11px] flex items-center justify-between">
                    <span className="font-medium text-charcoal-900 truncate max-w-[200px]">{p.name}</span>
                    <span className="font-mono text-charcoal-500 text-[10px] flex-shrink-0">{p.estimated_duration_minutes}m</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Drawer Footer ─────────────────────────────────────────────────── */}
      <div className="p-3 bg-linen-50 border-t border-linen-200 flex justify-end">
        <button
          onClick={onClose}
          className="px-4 py-1.5 text-xs font-semibold rounded-full bg-charcoal-900 text-white hover:bg-charcoal-800 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};
