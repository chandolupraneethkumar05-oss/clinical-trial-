/**
 * ProtocolShield Audit Event Types & Verification Definitions
 */

export interface AuditEvent {
  id?: string;
  timestamp: string;
  event_type: string;
  operator: string;
  details: string;
  previous_hash?: string;
  verification_hash: string;
  is_verified?: boolean;
}

export interface AuditVerificationStatus {
  valid: boolean;
  total_records_verified: number;
  latest_head_hash?: string | null;
  tampered_event_id?: string | null;
  details: string;
}

export interface PatientScreeningRecord {
  screening_id: string;
  patient_id: string;
  submitted_by_user_id: string;
  submitted_by_role: string;
  data_provenance: string;
  is_synthetic_data: boolean;
  investigator_verified: boolean;
  verified_by?: string | null;
  verified_by_role?: string | null;
  verified_at?: string | null;
  verification_notes?: string | null;
  created_at: string;
  clinical_summary: {
    age?: number | null;
    cancer_stage?: string | null;
    ecog_score?: number | null;
    egfr_ml_min?: number | null;
  };
  matches: Array<{
    protocol_id: string;
    match_status: string;
    match_status_label?: string;
    is_investigator_verified?: boolean;
  }>;
}

export interface PatientInterestSummary {
  id: string;
  patient_id: string;
  protocol_id: string;
  patient_name?: string | null;
  patient_email?: string | null;
  status: string;
  submitted_at: string;
}

export interface ManagedUserAccount {
  id: string;
  name: string;
  email: string;
  role: 'patient' | 'doctor' | 'admin' | string;
  organization?: string | null;
  provider?: string;
  created_at?: string | null;
}

/**
 * Clearly labeled synthetic demo fixture for offline presentation.
 * NEVER mixed with live backend audit trails.
 */
export const SYNTHETIC_DEMO_AUDIT_FIXTURE: AuditEvent[] = [
  {
    id: "demo-aud-001",
    timestamp: "2026-11-20 16:30:12 UTC",
    event_type: "PROTOCOL_SPECIFICATION_LOAD",
    operator: "ProtocolShield Ingestion Engine (Demo)",
    details: "Ingested Phase 3 NSCLC Protocol (PS-ONC-2026-001). Parsed 14 visits and 8 eligibility clauses.",
    verification_hash: "7e8b2c4f91d03a5e88c12a7f0e9b441a3d90f23b61a7c8849b2c5e0d3f1a4e82",
    is_verified: false
  },
  {
    id: "demo-aud-002",
    timestamp: "2026-11-20 16:30:14 UTC",
    event_type: "SYNTHETIC_COHORT_ATTACHMENT",
    operator: "DuckDB In-Memory Engine (Demo)",
    details: "Attached 10,000 synthetic patient records (NSCLC Phenotype, FHIR R4 schema).",
    verification_hash: "3a992d10cc87b5a190ef88d4c20e55b18f0a1c3d4e5b6a7c8d9e0f1a2b3c4d5e",
    is_verified: false
  },
  {
    id: "demo-aud-003",
    timestamp: "2026-11-20 16:30:15 UTC",
    event_type: "TUFTS_CSDD_BURDEN_SYNTHESIS",
    operator: "BurdenScoringEngine (Demo)",
    details: "Calculated Composite PBI: 68.4 / 100. Temporal: 71.4%, Invasive: 63.7%, Cognitive: 74.2%.",
    verification_hash: "1f008ca94e21b77823ab6c9918204e339a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d",
    is_verified: false
  }
];
