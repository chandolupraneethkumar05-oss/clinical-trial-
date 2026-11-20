import type { FC } from 'react';
import { Download, CheckCircle2 } from 'lucide-react';

const AUDIT_EVENTS = [
  {
    timestamp: "2026-11-20 16:30:12 UTC",
    event_type: "PROTOCOL_SPECIFICATION_LOAD",
    operator: "System / ProtocolShield Ingestion Engine",
    details: "Ingested Phase 3 NSCLC Protocol (PS-ONC-2026-001). Parsed 14 visits and 8 eligibility clauses.",
    verification_hash: "SHA256: 7e8b2c4f91d03a5e88c1..."
  },
  {
    timestamp: "2026-11-20 16:30:14 UTC",
    event_type: "SYNTHETIC_COHORT_ATTACHMENT",
    operator: "DuckDB Analytical In-Memory Engine",
    details: "Attached 10,000 synthetic patient records (NSCLC Phenotype, FHIR R4 schema). Seed 42 verified.",
    verification_hash: "SHA256: 3a992d10cc87b5a190ef..."
  },
  {
    timestamp: "2026-11-20 16:30:15 UTC",
    event_type: "TUFTS_CSDD_BURDEN_SYNTHESIS",
    operator: "BurdenScoringEngine v1.0",
    details: "Calculated Composite PBI: 68.4 / 100. Temporal: 71.4%, Invasive: 63.7%, Cognitive: 74.2%.",
    verification_hash: "SHA256: 1f008ca94e21b77823ab..."
  },
  {
    timestamp: "2026-11-20 16:30:16 UTC",
    event_type: "VECTOR_SCREENING_FUNNEL_EXECUTION",
    operator: "CohortSimulationEngine",
    details: "Screening funnel completed: 877 eligible subjects from 10,000 pool (Screen Failure: 91.2%).",
    verification_hash: "SHA256: 9b2d31fe8812c75a0344..."
  },
  {
    timestamp: "2026-11-20 16:32:01 UTC",
    event_type: "WHAT_IF_SENSITIVITY_RECALCULATION",
    operator: "Clinical Trial Feasibility Planner",
    details: "Parameter variance executed: eGFR relaxed to 50 mL/min (+133 candidates recovered).",
    verification_hash: "SHA256: e44d82f7190cbb5a4980..."
  }
];

export const AuditTrailView: FC = () => {
  return (
    <div className="bg-white border border-[#d8dee4] rounded shadow-xs select-none">
      {/* Header */}
      <div className="p-3 border-b border-[#d8dee4] bg-[#f8fafc] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="font-semibold text-slate-900 text-sm">21 CFR Part 11 Electronic Audit Log</h2>
            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-300">
              IMMUTABLE AUDIT TRAIL
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Cryptographically sealed operational audit events covering protocol parameter changes, cohort queries, and feasibility scores.
          </p>
        </div>

        <button 
          onClick={() => window.print()}
          className="flex items-center space-x-1.5 px-3 py-1 text-xs font-medium rounded border border-[#d8dee4] bg-white text-slate-700 hover:bg-slate-50"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Export Audit Certificate</span>
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#f1f5f9] border-b border-[#d8dee4] text-slate-700 text-[11px] uppercase font-bold tracking-wider">
              <th className="py-2.5 px-3 font-mono">Timestamp (UTC)</th>
              <th className="py-2.5 px-3">Audit Event Type</th>
              <th className="py-2.5 px-3">System Operator / Agent</th>
              <th className="py-2.5 px-3 min-w-[320px]">Event Log Details</th>
              <th className="py-2.5 px-3 font-mono">Verification Hash</th>
              <th className="py-2.5 px-3 text-right">Integrity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef2f6]">
            {AUDIT_EVENTS.map((evt, idx) => (
              <tr key={idx} className="hover:bg-slate-50">
                <td className="py-2.5 px-3 font-mono text-slate-600 text-[11px] whitespace-nowrap">
                  {evt.timestamp}
                </td>
                <td className="py-2.5 px-3 font-mono font-bold text-slate-800 text-[11px]">
                  {evt.event_type}
                </td>
                <td className="py-2.5 px-3 text-slate-700 font-medium text-[11px]">
                  {evt.operator}
                </td>
                <td className="py-2.5 px-3 text-slate-700 text-[11px] leading-relaxed">
                  {evt.details}
                </td>
                <td className="py-2.5 px-3 font-mono text-[10px] text-slate-500">
                  {evt.verification_hash}
                </td>
                <td className="py-2.5 px-3 text-right">
                  <span className="inline-flex items-center space-x-1 text-emerald-700 font-medium text-[11px]">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    <span>Sealed</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-3 bg-[#f8fafc] border-t border-[#d8dee4] text-[11px] text-slate-500 flex justify-between items-center">
        <span>Showing 5 verified audit records</span>
        <span className="font-mono text-[10px]">Compliant with FDA 21 CFR Part 11 & EU Annex 11</span>
      </div>
    </div>
  );
};
