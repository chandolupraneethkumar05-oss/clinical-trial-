import React, { useState, useMemo } from 'react';
import type { FC } from 'react';
import type { Visit, Procedure } from '../types/protocol';
import { Check, AlertTriangle } from 'lucide-react';

interface ScheduleOfEventsMatrixProps {
  visits: Visit[];
  peakWeeks: number[];
  onSelectVisit: (visit: Visit) => void;
  onSelectProcedure: (procedure: Procedure, visit: Visit) => void;
}

interface ProcedureRowDef {
  key: string;
  name: string;
  category: string;
  invasiveness_weight: number;
  duration_minutes: number;
  color: string;
}

const DEFAULT_PROCEDURE_SECTIONS: { section: string; procedures: ProcedureRowDef[] }[] = [
  {
    section: "1. Diagnostic Imaging & RECIST v1.1",
    procedures: [
      { key: "ct", name: "Contrast CT (Chest / Abdomen / Pelvis)", category: "highly_invasive", invasiveness_weight: 8.5, duration_minutes: 60, color: "text-amber-700 bg-amber-50" },
      { key: "mri", name: "Brain MRI with Gadolinium Contrast", category: "highly_invasive", invasiveness_weight: 9.0, duration_minutes: 60, color: "text-amber-700 bg-amber-50" },
    ]
  },
  {
    section: "2. Interventional & Tissue Biopsies",
    procedures: [
      { key: "biopsy", name: "Mandatory Core Needle Tumor Biopsy", category: "highly_invasive", invasiveness_weight: 16.0, duration_minutes: 120, color: "text-terracotta-700 bg-terracotta-50" },
      { key: "bone_marrow", name: "Bone Marrow Biopsy & Aspirate", category: "highly_invasive", invasiveness_weight: 18.0, duration_minutes: 150, color: "text-terracotta-700 bg-terracotta-50" },
      { key: "infusion", name: "Intravenous Investigational Product Infusion", category: "moderately_invasive", invasiveness_weight: 6.0, duration_minutes: 180, color: "text-indigo-700 bg-indigo-50" },
    ]
  },
  {
    section: "3. Pharmacokinetics & Laboratory Safety",
    procedures: [
      { key: "pk", name: "Serial PK Blood Sampling (Dense 6-Hour)", category: "moderately_invasive", invasiveness_weight: 7.5, duration_minutes: 360, color: "text-indigo-700 bg-indigo-50" },
      { key: "labs", name: "Routine Safety Bloods (CBC, CMP, Coagulation)", category: "minimally_invasive", invasiveness_weight: 2.5, duration_minutes: 15, color: "text-sage-700 bg-sage-50" },
    ]
  },
  {
    section: "4. Clinical Safety & Physical Monitoring",
    procedures: [
      { key: "vitals", name: "Vital Signs & ECOG Performance Status", category: "non_invasive", invasiveness_weight: 1.0, duration_minutes: 15, color: "text-charcoal-700 bg-linen-200" },
      { key: "ecg", name: "12-Lead Electrocardiogram (ECG)", category: "non_invasive", invasiveness_weight: 2.0, duration_minutes: 20, color: "text-charcoal-700 bg-linen-200" },
    ]
  },
  {
    section: "5. Patient-Reported Outcomes (ePRO)",
    procedures: [
      { key: "pro", name: "EORTC QLQ-C30 Health Quality Survey", category: "non_invasive", invasiveness_weight: 1.5, duration_minutes: 25, color: "text-sage-700 bg-sage-50" },
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
      if (procKey === "biopsy") return pName.includes("biopsy") && !pName.includes("bone marrow");
      if (procKey === "bone_marrow") return pName.includes("bone marrow");
      if (procKey === "infusion") return pName.includes("infusion");
      if (procKey === "pk") return pName.includes("pk");
      if (procKey === "labs") return pName.includes("blood") || pName.includes("labs");
      if (procKey === "vitals") return pName.includes("vital");
      if (procKey === "ecg") return pName.includes("ecg");
      if (procKey === "pro") return pName.includes("survey") || pName.includes("outcome");
      return false;
    });
  };

  // Filter sections that actually have procedures in this trial
  const activeSections = useMemo(() => {
    return DEFAULT_PROCEDURE_SECTIONS.map(sec => ({
      ...sec,
      procedures: sec.procedures.filter(p => visits.some(v => hasProcedure(v, p.key) !== undefined))
    })).filter(sec => sec.procedures.length > 0);
  }, [visits]);

  return (
    <div className="bg-white border border-linen-300 rounded-2xl shadow-xs flex flex-col select-none overflow-hidden">
      
      {/* ── Matrix Sub-Header Bar ──────────────────────────────────────────── */}
      <div className="p-4 border-b border-linen-200 bg-linen-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="font-serif font-bold text-sm text-charcoal-900 tracking-tight">
              Schedule of Assessments (SoA) Protocol Cross-Tab
            </h2>
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-sage-100 text-sage-800 border border-sage-200">
              ICH E6(R2) & CDISC
            </span>
          </div>
          <p className="text-[11px] text-charcoal-500 font-mono mt-0.5">
            Cross-tabulation of scheduled protocol assessments across all study epochs, clinic dwell hours, and procedural invasiveness.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <label className="inline-flex items-center space-x-1.5 cursor-pointer text-charcoal-700 bg-white px-3 py-1.5 rounded-full border border-linen-300 hover:bg-linen-100 transition-colors shadow-2xs">
            <input
              type="checkbox"
              checked={highlightPeaksOnly}
              onChange={(e) => setHighlightPeaksOnly(e.target.checked)}
              className="h-3.5 w-3.5 rounded text-terracotta-600 focus:ring-terracotta-500 border-linen-300"
            />
            <span className="text-xs font-semibold">Highlight Attrition Spikes</span>
          </label>
        </div>
      </div>

      {/* ── Scrollable Cross-Tab Matrix ────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs font-sans">
          
          {/* Table Header: Visits Timeline */}
          <thead>
            <tr className="bg-linen-100/80 border-b border-linen-300 text-charcoal-800">
              <th className="py-3 px-4 font-mono font-bold text-[10px] uppercase tracking-wider sticky left-0 bg-linen-100 z-20 border-r border-linen-300 min-w-[280px]">
                Protocol Assessment / Procedure
              </th>
              
              {visits.map((v) => {
                const isPeak = peakWeeks.includes(v.week_number);
                return (
                  <th
                    key={v.visit_id}
                    onClick={() => onSelectVisit(v)}
                    className={`py-2 px-2 text-center border-r border-linen-200 cursor-pointer min-w-[90px] transition-colors ${
                      isPeak && highlightPeaksOnly 
                        ? 'bg-terracotta-50/90 text-terracotta-900 font-bold' 
                        : 'hover:bg-linen-200/60'
                    }`}
                  >
                    <div className="font-mono text-xs font-bold text-charcoal-900">{v.visit_id}</div>
                    <div className="text-[10px] text-charcoal-500 font-mono">
                      {v.week_number < 0 ? `Wk ${v.week_number}` : `Wk +${v.week_number}`}
                    </div>
                    {isPeak && (
                      <span className="inline-flex items-center space-x-0.5 mt-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold bg-terracotta-100 text-terracotta-700 border border-terracotta-200">
                        <AlertTriangle className="h-2.5 w-2.5 text-terracotta-600" />
                        <span>PEAK</span>
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Matrix Body: Grouped Rows */}
          <tbody className="divide-y divide-linen-200">
            {activeSections.map((group) => (
              <React.Fragment key={group.section}>
                
                {/* Section Group Header Row */}
                <tr className="bg-linen-50 border-y border-linen-200">
                  <td
                    colSpan={visits.length + 1}
                    className="py-1.5 px-4 font-mono font-bold text-[10px] text-charcoal-700 uppercase tracking-wider bg-linen-100/50"
                  >
                    {group.section}
                  </td>
                </tr>

                {/* Individual Procedure Rows */}
                {group.procedures.map((procDef) => (
                  <tr key={procDef.key} className="hover:bg-linen-50/80 transition-colors">
                    
                    {/* Left Sticky Column: Procedure Name & Invasiveness Badge */}
                    <td className="py-2.5 px-4 font-medium text-charcoal-900 sticky left-0 bg-white z-10 border-r border-linen-200 text-xs flex items-center justify-between">
                      <span className="truncate max-w-[210px] font-medium" title={procDef.name}>
                        {procDef.name}
                      </span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full border border-linen-200 ${procDef.color} font-semibold flex-shrink-0 ml-2`}>
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
                          className={`py-2 px-2 text-center border-r border-linen-200 cursor-pointer transition-colors ${
                            matchedProc 
                              ? (isPeak && highlightPeaksOnly ? 'bg-terracotta-50/50' : 'bg-linen-50/40 hover:bg-terracotta-50/30') 
                              : 'hover:bg-linen-100/50'
                          }`}
                        >
                          {matchedProc ? (
                            <span 
                              className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-charcoal-900 text-white shadow-2xs mx-auto hover:scale-110 transition-transform"
                              title={`${matchedProc.name} (${matchedProc.estimated_duration_minutes} min)`}
                            >
                              <Check className="h-3 w-3 stroke-[3] text-terracotta-300" />
                            </span>
                          ) : (
                            <span className="text-linen-300 text-[10px]">•</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Matrix Legend Footer ───────────────────────────────────────────── */}
      <div className="p-3 bg-linen-50 border-t border-linen-200 flex flex-wrap items-center justify-between gap-3 text-[10px] font-mono text-charcoal-600">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1">
            <span className="h-4 w-4 rounded-full bg-charcoal-900 text-white flex items-center justify-center text-[9px]">✓</span>
            <span>Scheduled Assessment</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="px-1.5 py-0.2 rounded-full bg-terracotta-100 text-terracotta-700 font-bold border border-terracotta-200">PEAK</span>
            <span>Friction Spike Week (Biopsy / Multi-hour Stays)</span>
          </div>
        </div>

        <span className="text-charcoal-400">
          Click any column or checkmark to inspect visit dwell time & recovery rules
        </span>
      </div>
    </div>
  );
};
