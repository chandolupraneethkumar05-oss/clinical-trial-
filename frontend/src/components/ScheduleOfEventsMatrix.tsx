import React, { useState } from 'react';
import type { FC } from 'react';
import type { Visit, Procedure } from '../types/protocol';
import { Check } from 'lucide-react';

interface ScheduleOfEventsMatrixProps {
  visits: Visit[];
  peakWeeks: number[];
  onSelectVisit: (visit: Visit) => void;
  onSelectProcedure: (procedure: Procedure, visit: Visit) => void;
}

// Grouped procedure definitions for authentic Veeva cross-tab display
interface ProcedureRowDef {
  key: string;
  name: string;
  category: string;
  invasiveness_weight: number;
  duration_minutes: number;
}

const PROCEDURE_ROWS: { section: string; procedures: ProcedureRowDef[] }[] = [
  {
    section: "1. Diagnostic Imaging & RECIST v1.1",
    procedures: [
      { key: "ct", name: "Contrast CT (Chest / Abdomen / Pelvis)", category: "highly_invasive", invasiveness_weight: 8.5, duration_minutes: 60 },
      { key: "mri", name: "Brain MRI with Gadolinium Contrast", category: "highly_invasive", invasiveness_weight: 9.0, duration_minutes: 60 },
    ]
  },
  {
    section: "2. Interventional & Tissue Biopsies",
    procedures: [
      { key: "biopsy", name: "Mandatory Core Needle Tumor Biopsy", category: "highly_invasive", invasiveness_weight: 16.0, duration_minutes: 120 },
      { key: "infusion", name: "Intravenous Investigational Product Infusion", category: "moderately_invasive", invasiveness_weight: 6.0, duration_minutes: 180 },
    ]
  },
  {
    section: "3. Pharmacokinetics & Laboratory Safety",
    procedures: [
      { key: "pk", name: "Serial PK Blood Sampling (Dense 6-Hour)", category: "moderately_invasive", invasiveness_weight: 7.5, duration_minutes: 360 },
      { key: "labs", name: "Routine Safety Bloods (CBC, CMP, Coagulation)", category: "minimally_invasive", invasiveness_weight: 2.5, duration_minutes: 15 },
    ]
  },
  {
    section: "4. Clinical Safety & Physical Monitoring",
    procedures: [
      { key: "vitals", name: "Vital Signs & ECOG Performance Status", category: "non_invasive", invasiveness_weight: 1.0, duration_minutes: 15 },
      { key: "ecg", name: "12-Lead Electrocardiogram (ECG)", category: "non_invasive", invasiveness_weight: 2.0, duration_minutes: 20 },
    ]
  },
  {
    section: "5. Patient-Reported Outcomes (ePRO)",
    procedures: [
      { key: "pro", name: "EORTC QLQ-C30 Health Quality Survey", category: "non_invasive", invasiveness_weight: 1.5, duration_minutes: 25 },
    ]
  }
];

export const ScheduleOfEventsMatrix: FC<ScheduleOfEventsMatrixProps> = ({
  visits,
  peakWeeks,
  onSelectVisit,
  onSelectProcedure
}) => {
  const [highlightPeaksOnly, setHighlightPeaksOnly] = useState(false);

  // Helper to check if a procedure is scheduled for a visit
  const hasProcedure = (visit: Visit, procKey: string): Procedure | undefined => {
    return visit.procedures.find(p => {
      const pName = p.name.toLowerCase();
      if (procKey === "ct") return pName.includes("ct");
      if (procKey === "mri") return pName.includes("mri");
      if (procKey === "biopsy") return pName.includes("biopsy");
      if (procKey === "infusion") return pName.includes("infusion");
      if (procKey === "pk") return pName.includes("pk");
      if (procKey === "labs") return pName.includes("blood") || pName.includes("labs");
      if (procKey === "vitals") return pName.includes("vital");
      if (procKey === "ecg") return pName.includes("ecg");
      if (procKey === "pro") return pName.includes("survey") || pName.includes("outcome");
      return false;
    });
  };

  return (
    <div className="bg-white border border-[#d8dee4] rounded shadow-xs flex flex-col select-none">
      {/* Matrix Sub-Header Bar */}
      <div className="p-3 border-b border-[#d8dee4] bg-[#f8fafc] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="font-semibold text-slate-900 text-sm">Schedule of Events (SoE) Protocol Cross-Tab</h2>
            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
              ICH E6(R2) & CDISC compliant
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Cross-tabulation of scheduled protocol assessments across all study epochs, clinic dwell hours, and procedural invasiveness.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <label className="flex items-center space-x-1.5 cursor-pointer text-slate-700 bg-white px-2.5 py-1 rounded border border-[#d8dee4] hover:bg-slate-50">
            <input
              type="checkbox"
              checked={highlightPeaksOnly}
              onChange={(e) => setHighlightPeaksOnly(e.target.checked)}
              className="h-3.5 w-3.5 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
            />
            <span className="text-[11px] font-medium">Highlight Attrition Spike Weeks</span>
          </label>
        </div>
      </div>

      {/* Veeva Matrix Scroll Container */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs font-sans">
          {/* Table Header: Visits */}
          <thead>
            <tr className="bg-[#f1f5f9] border-b border-[#d8dee4] text-slate-700">
              <th className="py-2.5 px-3 font-semibold text-[11px] uppercase tracking-wider sticky left-0 bg-[#f1f5f9] z-20 border-r border-[#d8dee4] min-w-[280px]">
                Protocol Assessment / Procedure
              </th>
              {visits.map((v) => {
                const isPeak = peakWeeks.includes(v.week_number);
                return (
                  <th
                    key={v.visit_id}
                    onClick={() => onSelectVisit(v)}
                    className={`py-2 px-2 text-center border-r border-[#e2e8f0] cursor-pointer min-w-[90px] transition-colors ${
                      isPeak && highlightPeaksOnly 
                        ? 'bg-rose-50/90 text-rose-900 font-bold' 
                        : 'hover:bg-blue-50/60'
                    }`}
                  >
                    <div className="font-mono text-[11px] font-bold text-slate-900">{v.visit_id}</div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      {v.week_number < 0 ? `Wk ${v.week_number}` : `Wk +${v.week_number}`}
                    </div>
                    {isPeak && (
                      <span className="inline-block mt-0.5 px-1 py-0.2 rounded text-[9px] font-mono font-semibold bg-rose-100 text-rose-700 border border-rose-200">
                        PEAK
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Matrix Body: Grouped Rows */}
          <tbody className="divide-y divide-[#e5e9ee]">
            {PROCEDURE_ROWS.map((group) => (
              <React.Fragment key={group.section}>
                {/* Section Header Row */}
                <tr className="bg-[#f8fafc] border-y border-[#d8dee4]">
                  <td
                    colSpan={visits.length + 1}
                    className="py-1.5 px-3 font-bold text-[11px] text-slate-700 uppercase tracking-wider bg-[#f4f6f9]"
                  >
                    {group.section}
                  </td>
                </tr>

                {/* Individual Procedure Rows */}
                {group.procedures.map((procDef) => (
                  <tr key={procDef.key} className="hover:bg-slate-50/80 transition-colors">
                    {/* Left Sticky Column: Procedure Name & Weight */}
                    <td className="py-2 px-3 font-medium text-slate-800 sticky left-0 bg-white z-10 border-r border-[#d8dee4] text-[11px] flex items-center justify-between">
                      <span className="truncate max-w-[200px]" title={procDef.name}>
                        {procDef.name}
                      </span>
                      <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                        wt {procDef.invasiveness_weight}
                      </span>
                    </td>

                    {/* Visit Matrix Check Cells */}
                    {visits.map((v) => {
                      const matchedProc = hasProcedure(v, procDef.key);
                      const isPeak = peakWeeks.includes(v.week_number);

                      return (
                        <td
                          key={v.visit_id}
                          onClick={() => {
                            if (matchedProc) onSelectProcedure(matchedProc, v);
                            else onSelectVisit(v);
                          }}
                          className={`py-2 px-2 text-center border-r border-[#e5e9ee] cursor-pointer transition-colors ${
                            matchedProc 
                              ? (isPeak && highlightPeaksOnly ? 'bg-rose-50/50' : 'bg-blue-50/20 hover:bg-blue-100/40') 
                              : 'hover:bg-slate-100/50'
                          }`}
                        >
                          {matchedProc ? (
                            <span 
                              className="inline-flex items-center justify-center h-5 w-5 rounded bg-[#0066b2] text-white shadow-2xs mx-auto"
                              title={`${matchedProc.name} (${matchedProc.estimated_duration_minutes}m)`}
                            >
                              <Check className="h-3 w-3 stroke-[3]" />
                            </span>
                          ) : (
                            <span className="text-slate-300 font-mono text-[10px]">•</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}

            {/* Matrix Summary Rows */}
            {/* Row 1: Estimated Dwell Time */}
            <tr className="bg-[#f8fafc] font-semibold border-t-2 border-[#cbd5e1] text-[11px]">
              <td className="py-2.5 px-3 text-slate-900 sticky left-0 bg-[#f8fafc] z-10 border-r border-[#d8dee4]">
                Total Clinic Dwell Time
              </td>
              {visits.map((v) => {
                const totalMins = v.procedures.reduce((acc, p) => acc + p.estimated_duration_minutes, 0);
                const hrs = Math.floor(totalMins / 60);
                const mins = totalMins % 60;
                return (
                  <td key={v.visit_id} className="py-2.5 px-2 text-center font-mono text-slate-800 border-r border-[#e5e9ee]">
                    {hrs > 0 ? `${hrs}h ${mins > 0 ? `${mins}m` : ''}` : `${mins}m`}
                  </td>
                );
              })}
            </tr>

            {/* Row 2: Procedural Invasiveness Points */}
            <tr className="bg-[#f8fafc] font-semibold text-[11px]">
              <td className="py-2.5 px-3 text-slate-900 sticky left-0 bg-[#f8fafc] z-10 border-r border-[#d8dee4]">
                Invasiveness Weight Points (Tufts)
              </td>
              {visits.map((v) => {
                const totalWt = v.procedures.reduce((acc, p) => acc + p.invasiveness_weight, 0);
                const isPeak = peakWeeks.includes(v.week_number);
                return (
                  <td 
                    key={v.visit_id} 
                    className={`py-2.5 px-2 text-center font-mono border-r border-[#e5e9ee] ${
                      isPeak ? 'text-rose-700 font-bold bg-rose-50/60' : 'text-slate-700'
                    }`}
                  >
                    {totalWt.toFixed(1)}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Matrix Footer Notes */}
      <div className="p-3 bg-[#f1f5f9] border-t border-[#d8dee4] text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-3">
          <span className="flex items-center space-x-1">
            <span className="h-3 w-3 rounded bg-[#0066b2] inline-block" />
            <span>Mandatory Procedure</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="h-3 w-3 rounded bg-rose-200 border border-rose-400 inline-block" />
            <span>High Burden Restaging Spike (Peak Fatigue)</span>
          </span>
        </div>
        <div className="text-slate-500 font-mono text-[10px]">
          Click any column header or checkmark to inspect regulatory dwell parameters.
        </div>
      </div>
    </div>
  );
};
