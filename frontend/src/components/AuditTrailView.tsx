import { useState } from 'react';
import type { FC } from 'react';
import { 
  Download, 
  CheckCircle2, 
  ShieldCheck, 
  Copy, 
  Check, 
  AlertTriangle, 
  RefreshCw, 
  Database,
  Lock,
  XCircle
} from 'lucide-react';
import type { AuditEvent, AuditVerificationStatus } from '../types/audit';

interface AuditTrailViewProps {
  events?: AuditEvent[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  verificationStatus?: AuditVerificationStatus | null;
  isDemoMode?: boolean;
  onToggleDemoMode?: () => void;
}

export const AuditTrailView: FC<AuditTrailViewProps> = ({ 
  events = [],
  isLoading = false,
  error = null,
  onRetry,
  verificationStatus = null,
  isDemoMode = false,
  onToggleDemoMode,
}) => {
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const copyToClipboard = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const isGloballyVerified = verificationStatus?.valid === true;

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
            {isDemoMode ? (
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                SYNTHETIC DEMO RECORDS
              </span>
            ) : isGloballyVerified ? (
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-sage-100 text-sage-800 border border-sage-200 flex items-center space-x-1">
                <CheckCircle2 className="h-3 w-3 text-sage-600" />
                <span>CHAIN VERIFIED ({verificationStatus?.total_records_verified ?? events.length} BLOCKS)</span>
              </span>
            ) : (
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-linen-200 text-charcoal-700 border border-linen-300">
                IMMUTABLE LEDGER
              </span>
            )}
          </div>
          <p className="text-[11px] text-charcoal-500 font-mono mt-0.5">
            Cryptographically chained operational events linking protocol parameter modifications, cohort screening queries, and feasibility scores.
          </p>
        </div>

        <div className="flex items-center space-x-2 self-start sm:self-center">
          {onToggleDemoMode && (
            <button
              onClick={onToggleDemoMode}
              className={`px-3 py-1.5 text-xs font-mono font-semibold rounded-full border transition-colors cursor-pointer ${
                isDemoMode
                  ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                  : 'bg-white text-charcoal-600 border-linen-300 hover:bg-linen-100'
              }`}
            >
              {isDemoMode ? 'Exit Demo Fixture' : 'Preview Demo Fixture'}
            </button>
          )}

          {onRetry && (
            <button
              onClick={onRetry}
              disabled={isLoading}
              className="p-1.5 rounded-full border border-linen-300 bg-white text-charcoal-600 hover:bg-linen-100 transition-colors disabled:opacity-50 cursor-pointer"
              title="Refresh Audit Trail"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          )}

          <button 
            onClick={() => window.print()}
            className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-full border border-linen-300 bg-white text-charcoal-700 hover:bg-linen-100 transition-colors shadow-2xs cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-terracotta-600" />
            <span>Export Certificate</span>
          </button>
        </div>
      </div>

      {/* ── Demo Mode Warning Notice ────────────────────────────────────────── */}
      {isDemoMode && (
        <div className="p-3 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 flex items-start space-x-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong className="font-semibold">Synthetic Demonstration Fixture: </strong>
            You are viewing pre-computed demonstration records for illustration. These events are not connected to the live DuckDB blockchain ledger and are never marked as authentic verified records.
          </p>
        </div>
      )}

      {/* ── Error Banner State ──────────────────────────────────────────────── */}
      {error && !isLoading && (
        <div className="p-6 text-center space-y-3 bg-red-50/50">
          <div className="h-10 w-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
            <XCircle className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h3 className="font-serif font-bold text-sm text-red-900">Unable to Load Audit Trail</h3>
            <p className="text-xs text-red-700 max-w-md mx-auto">{error}</p>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center space-x-1.5 px-4 py-1.5 rounded-full text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors shadow-xs cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry Connection</span>
            </button>
          )}
        </div>
      )}

      {/* ── Loading Skeleton State ──────────────────────────────────────────── */}
      {isLoading && (
        <div className="p-12 text-center space-y-3">
          <RefreshCw className="h-6 w-6 text-terracotta-600 animate-spin mx-auto" />
          <p className="text-xs font-mono text-charcoal-500">
            Traversing SHA-256 cryptographic ledger and verifying block signatures…
          </p>
        </div>
      )}

      {/* ── Empty State ─────────────────────────────────────────────────────── */}
      {!isLoading && !error && events.length === 0 && (
        <div className="p-12 text-center space-y-3">
          <div className="h-12 w-12 rounded-2xl bg-linen-100 border border-linen-200 text-charcoal-400 flex items-center justify-center mx-auto">
            <Database className="h-6 w-6 text-charcoal-400" />
          </div>
          <div className="space-y-1">
            <h3 className="font-serif font-bold text-base text-charcoal-900">No Audit Events Recorded Yet</h3>
            <p className="text-xs text-charcoal-500 max-w-md mx-auto leading-relaxed">
              Audit events will appear here in chronological order when protocols are parsed, sensitivity parameters are adjusted, or cohort screening funnels are executed.
            </p>
          </div>
        </div>
      )}

      {/* ── Table (Rendered only when events exist) ─────────────────────────── */}
      {!isLoading && !error && events.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-linen-100/70 border-b border-linen-300 text-charcoal-700 text-[10px] uppercase font-mono font-bold tracking-wider">
                <th className="py-3 px-4 font-mono">Timestamp (UTC)</th>
                <th className="py-3 px-4">Audit Event Type</th>
                <th className="py-3 px-4">Operator / Agent</th>
                <th className="py-3 px-4 min-w-[320px]">Event Log Details</th>
                <th className="py-3 px-4 font-mono">SHA-256 Hash</th>
                <th className="py-3 px-4 text-right">Integrity Status</th>
              </tr>
            </thead>
            
            <tbody className="divide-y divide-linen-200">
              {events.map((evt, idx) => {
                const isItemVerified = !isDemoMode && (isGloballyVerified || evt.is_verified === true);

                return (
                  <tr key={evt.id || idx} className="hover:bg-linen-50/80 transition-colors">
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
                        title="Click to copy full SHA-256 hash"
                      >
                        <span>{evt.verification_hash.slice(0, 16)}…{evt.verification_hash.slice(-8)}</span>
                        {copiedHash === evt.verification_hash ? (
                          <Check className="h-3 w-3 text-sage-600" />
                        ) : (
                          <Copy className="h-2.5 w-2.5 text-charcoal-400 hover:text-charcoal-600" />
                        )}
                      </button>
                    </td>
                    
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {isDemoMode ? (
                        <span className="inline-flex items-center space-x-1 text-amber-700 font-mono text-[10px] font-semibold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                          <Lock className="h-3 w-3 text-amber-500" />
                          <span>SYNTHETIC DEMO</span>
                        </span>
                      ) : isItemVerified ? (
                        <span className="inline-flex items-center space-x-1 text-sage-700 font-mono text-[11px] font-bold">
                          <CheckCircle2 className="h-3.5 w-3.5 text-sage-600" />
                          <span>VERIFIED</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 text-charcoal-500 font-mono text-[10px] font-medium bg-linen-100 px-2 py-0.5 rounded-full border border-linen-200">
                          <span>Not yet verified</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
