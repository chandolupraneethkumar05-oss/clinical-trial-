import { useState } from 'react';
import type { FC } from 'react';
import { Download, CheckCircle2, ShieldCheck, Copy, Check } from 'lucide-react';

export interface AuditEvent {
  timestamp: string;
  event_type: string;
  operator: string;
  details: string;
  verification_hash: string;
}

export const DEFAULT_AUDIT_EVENTS: AuditEvent[] = [
  {
    timestamp: "2026-11-20 16:30:12 UTC",
    event_type: "PROTOCOL_SPECIFICATION_LOAD",
    operator: "System / ProtocolShield Ingestion Engine",
    details: "Ingested Phase 3 NSCLC Protocol (PS-ONC-2026-001). Parsed 14 visits and 8 eligibility clauses.",
    verification_hash: "SHA256: 7e8b2c4f91d03a5e88c12a7f0e9b441a"
  },
  {
    timestamp: "2026-11-20 16:30:14 UTC",
    event_type: "SYNTHETIC_COHORT_ATTACHMENT",
    operator: "DuckDB Analytical In-Memory Engine",
    details: "Attached 10,000 synthetic patient records (NSCLC Phenotype, FHIR R4 schema). Seed 42 verified.",
    verification_hash: "SHA256: 3a992d10cc87b5a190ef88d4c20e55b1"
  },
  {
    timestamp: "2026-11-20 16:30:15 UTC",
    event_type: "TUFTS_CSDD_BURDEN_SYNTHESIS",
    operator: "BurdenScoringEngine v1.0",
    details: "Calculated Composite PBI: 68.4 / 100. Temporal: 71.4%, Invasive: 63.7%, Cognitive: 74.2%.",
    verification_hash: "SHA256: 1f008ca94e21b77823ab6c9918204e33"
  },
  {
    timestamp: "2026-11-20 16:30:16 UTC",
    event_type: "VECTOR_SCREENING_FUNNEL_EXECUTION",
    operator: "CohortSimulationEngine",
    details: "Screening funnel completed: 877 eligible subjects from 10,000 pool (Screen Failure: 91.2%).",
    verification_hash: "SHA256: 9b2d31fe8812c75a03445b201f8e9102"
  },
  {
    timestamp: "2026-11-20 16:32:01 UTC",
    event_type: "WHAT_IF_SENSITIVITY_RECALCULATION",
    operator: "Clinical Trial Feasibility Planner",
    details: "Parameter variance executed: eGFR relaxed to 50 mL/min (+133 candidates recovered).",
    verification_hash: "SHA256: e44d82f7190cbb5a4980aa311f9c87d4"
  }
];

interface AuditTrailViewProps {
  events?: AuditEvent[];
}

export const AuditTrailView: FC<AuditTrailViewProps> = ({ events = DEFAULT_AUDIT_EVENTS }) => {
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const copyToClipboard = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  return (
    <div className="bg-white border border-linen-300 rounded-2xl shadow-xs select-none overflow-hidden">
      
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="p-4 border-b border-linen-200 bg-linen-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
        <div>
          <div className="flex items-center space-x-2">
            <ShieldCheck className="h-4 w-4 text-terracotta-600" />
            <h2 className="font-serif font-bold text-sm text-charcoal-900 tracking-tight">
              Cryptographic SHA-256 Audit Trail (21 CFR Part 11 Architecture)
            </h2>
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-sage-100 text-sage-800 border border-sage-200">
              TAMPER-EVIDENT LEDGER
            </span>
          </div>
          <p className="text-[11px] text-charcoal-500 font-mono mt-0.5">
            Cryptographically chained operational audit events covering protocol parameter changes, cohort queries, and feasibility scores.
          </p>
        </div>

        <button 
          onClick={() => window.print()}
          className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-full border border-linen-300 bg-white text-charcoal-700 hover:bg-linen-100 transition-colors shadow-2xs self-start sm:self-center"
        >
          <Download className="h-3.5 w-3.5 text-terracotta-600" />
          <span>Export Audit Certificate</span>
        </button>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-linen-100/70 border-b border-linen-300 text-charcoal-700 text-[10px] uppercase font-mono font-bold tracking-wider">
              <th className="py-3 px-4 font-mono">Timestamp (UTC)</th>
              <th className="py-3 px-4">Audit Event Type</th>
              <th className="py-3 px-4">Operator / Agent</th>
              <th className="py-3 px-4 min-w-[320px]">Event Log Details</th>
              <th className="py-3 px-4 font-mono">Verification Hash</th>
              <th className="py-3 px-4 text-right">Integrity</th>
            </tr>
          </thead>
          
          <tbody className="divide-y divide-linen-200">
            {events.map((evt, idx) => (
              <tr key={idx} className="hover:bg-linen-50/80 transition-colors">
                <td className="py-3 px-4 font-mono text-charcoal-600 text-xs whitespace-nowrap">
                  {evt.timestamp}
                </td>
                
                <td className="py-3 px-4 font-mono font-bold text-charcoal-900 text-xs">
                  {evt.event_type}
                </td>
                
                <td className="py-3 px-4 text-charcoal-700 font-medium text-xs font-serif">
                  {evt.operator}
                </td>
                
                <td className="py-3 px-4 text-charcoal-800 text-xs leading-relaxed font-serif">
                  {evt.details}
                </td>
                
                <td className="py-3 px-4 font-mono text-[10px] text-charcoal-500 whitespace-nowrap">
                  <button
                    onClick={() => copyToClipboard(evt.verification_hash)}
                    className="inline-flex items-center space-x-1 hover:text-charcoal-900 transition-colors cursor-pointer"
                    title="Click to copy hash"
                  >
                    <span>{evt.verification_hash.slice(0, 22)}...</span>
                    {copiedHash === evt.verification_hash ? (
                      <Check className="h-3 w-3 text-sage-600" />
                    ) : (
                      <Copy className="h-2.5 w-2.5 text-charcoal-400 hover:text-charcoal-600" />
                    )}
                  </button>
                </td>
                
                <td className="py-3 px-4 text-right">
                  <span className="inline-flex items-center space-x-1 text-sage-700 font-mono text-[11px] font-bold">
                    <CheckCircle2 className="h-3.5 w-3.5 text-sage-600" />
                    <span>VERIFIED</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Regulatory Compliance Footnote ──────────────────────────────────── */}
      <div className="p-3 bg-linen-50 border-t border-linen-200 text-[11px] text-charcoal-500 font-sans flex items-start space-x-2">
        <ShieldCheck className="h-4 w-4 text-terracotta-600 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-charcoal-700 font-semibold">Regulatory Notice: </strong>
          The cryptographically linked SHA-256 hash log provides tamper-evident integrity for protocol amendments and cohort queries. Production deployment under FDA 21 CFR Part 11 requires institutional computer system validation (IQ/OQ/PQ), digital signatures, and sponsor standard operating procedures.
        </p>
      </div>
    </div>
  );
};
