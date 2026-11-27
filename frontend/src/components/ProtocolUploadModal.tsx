import { useState, useRef, useCallback, useEffect } from 'react';
import type { FC, DragEvent } from 'react';
import type { ClinicalProtocol } from '../types/protocol';
import { apiUrl, extractApiErrorMessage, getStoredAuthToken, parseJsonSafe } from '../lib/api';
import {
  X,
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Zap,
  FlaskConical,
  Dna,
} from 'lucide-react';

interface ProtocolUploadModalProps {
  onClose: () => void;
  onProtocolLoaded: (protocol: ClinicalProtocol) => void | Promise<void>;
  onUnauthorized?: () => void;
}

type UploadState = 'idle' | 'loading' | 'success' | 'error';

const LOADING_MESSAGES = [
  'Parsing PDF structure…',
  'Extracting Schedule of Assessments…',
  'Mapping eligibility criteria…',
  'Computing eGFR & ECOG thresholds…',
  'Running Tufts CSDD burden scoring…',
  'Calibrating patient retention model…',
  'Finalizing protocol intelligence…',
];

const SAMPLE_PROTOCOLS = [
  {
    type: 'nsclc',
    icon: Zap,
    label: 'Phase III · NSCLC',
    name: 'Anti-PD-1 + Chemotherapy',
    tags: ['14 Visits', '52 Weeks', 'Serial PK', 'RECIST'],
    color: 'terracotta',
  },
  {
    type: 'tnbc',
    icon: FlaskConical,
    label: 'Phase II · TNBC',
    name: 'ADC + IO Combination',
    tags: ['10 Visits', '42 Weeks', 'Dense PK', 'PRO'],
    color: 'sage',
  },
  {
    type: 'myeloma',
    icon: Dna,
    label: 'Phase III · Myeloma',
    name: 'BCMA Bispecific Antibody',
    tags: ['12 Visits', '60 Weeks', 'Step-Up Dosing', 'BM Biopsy'],
    color: 'indigo',
  },
] as const;

const colorMap = {
  terracotta: {
    icon: 'text-terracotta-600',
    bg: 'bg-terracotta-50',
    border: 'border-terracotta-200 hover:border-terracotta-400',
    tag: 'bg-terracotta-100 text-terracotta-700',
    selected: 'border-terracotta-500 bg-terracotta-50 ring-2 ring-terracotta-200',
  },
  sage: {
    icon: 'text-sage-600',
    bg: 'bg-sage-50',
    border: 'border-sage-200 hover:border-sage-400',
    tag: 'bg-sage-100 text-sage-700',
    selected: 'border-sage-500 bg-sage-50 ring-2 ring-sage-200',
  },
  indigo: {
    icon: 'text-indigo-600',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200 hover:border-indigo-400',
    tag: 'bg-indigo-100 text-indigo-700',
    selected: 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200',
  },
};

export const ProtocolUploadModal: FC<ProtocolUploadModalProps> = ({
  onClose,
  onProtocolLoaded,
  onUnauthorized,
}) => {
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [loadedProtocol, setLoadedProtocol] = useState<ClinicalProtocol | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedSample, setSelectedSample] = useState<string | null>(null);
  const [savedProtocols, setSavedProtocols] = useState<ClinicalProtocol[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    const controller = new AbortController();

    async function fetchSavedProtocols() {
      const token = getStoredAuthToken();
      if (!token) return;
      try {
        const res = await fetch(apiUrl('/api/v1/protocol/uploaded'), {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (res.status === 401) {
          onUnauthorized?.();
          return;
        }
        if (res.ok) {
          const parsed = await parseJsonSafe(res);
          if (isMountedRef.current && Array.isArray(parsed)) {
            setSavedProtocols(parsed as ClinicalProtocol[]);
          }
        }
      } catch {
        // Ignore non-fatal saved list fetch failures
      }
    }

    void fetchSavedProtocols();
    return () => {
      isMountedRef.current = false;
      controller.abort();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [onUnauthorized]);

  // Cycle through loading messages
  useEffect(() => {
    if (uploadState === 'loading') {
      intervalRef.current = setInterval(() => {
        setLoadingMsgIdx((i) => Math.min(i + 1, LOADING_MESSAGES.length - 1));
      }, 850);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [uploadState]);

  // ── Drag & Drop ───────────────────────────────────────────────────────────
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    const isPdf = file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
    if (isPdf) {
      setSelectedFile(file);
      setSelectedSample(null);
      setErrorMessage('');
    } else {
      setErrorMessage('Only PDF files are accepted.');
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setSelectedSample(null);
      setErrorMessage('');
    }
  };

  // ── Load Sample Protocol ──────────────────────────────────────────────────
  const handleLoadSample = async (protocolType: string) => {
    setSelectedSample(protocolType);
    setSelectedFile(null);
    setLoadingMsgIdx(0);
    setUploadState('loading');
    setErrorMessage('');

    try {
      const res = await fetch(apiUrl(`/api/v1/protocol/sample/${protocolType}`));
      const data = await parseJsonSafe(res);
      if (!isMountedRef.current) return;
      if (!res.ok) {
        throw new Error(extractApiErrorMessage(data, `Server returned HTTP ${res.status}.`));
      }
      const protocol = data as ClinicalProtocol;
      if (!protocol?.protocol_id) {
        throw new Error('Server returned an unexpected protocol payload.');
      }
      setLoadedProtocol(protocol);
      setUploadState('success');
      const delay = protocol.extraction_status === 'heuristic_fallback' ? 1200 : 600;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          void onProtocolLoaded(protocol);
        }
      }, delay);
    } catch (err) {
      if (!isMountedRef.current) return;
      setUploadState('error');
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load sample protocol.');
    }
  };

  // ── Upload PDF ────────────────────────────────────────────────────────────
  const handleUploadPDF = async () => {
    if (!selectedFile) return;
    setLoadingMsgIdx(0);
    setUploadState('loading');
    setErrorMessage('');

    try {
      const form = new FormData();
      form.append('file', selectedFile);

      const headers: Record<string, string> = {};
      const token = getStoredAuthToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(apiUrl('/api/v1/protocol/upload'), {
        method: 'POST',
        headers,
        body: form,
      });

      if (res.status === 401) {
        onUnauthorized?.();
        throw new Error('Your session has expired. Please sign in again.');
      }

      const data = await parseJsonSafe(res);
      if (!isMountedRef.current) return;

      if (!res.ok) {
        throw new Error(extractApiErrorMessage(data, `Server error ${res.status}`));
      }

      const protocol = data as ClinicalProtocol;
      if (!protocol?.protocol_id) {
        throw new Error('Server returned an unexpected protocol payload.');
      }
      setLoadedProtocol(protocol);
      setUploadState('success');
      const delay = protocol.extraction_status === 'heuristic_fallback' ? 1200 : 600;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          void onProtocolLoaded(protocol);
        }
      }, delay);
    } catch (err) {
      if (!isMountedRef.current) return;
      setUploadState('error');
      setErrorMessage(
        err instanceof Error ? err.message : 'PDF extraction failed. Please try again.'
      );
    }
  };

  const reset = () => {
    setUploadState('idle');
    setSelectedFile(null);
    setSelectedSample(null);
    setErrorMessage('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(15,15,20,0.72)', backdropFilter: 'blur(8px)' }}>
      <div
        className="relative bg-white rounded-2xl shadow-2xl border border-linen-200 w-full max-w-2xl overflow-hidden"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="sticky top-0 z-10 bg-charcoal-950 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-8 w-8 rounded-lg bg-terracotta-600/20 flex items-center justify-center">
              <Upload className="h-4 w-4 text-terracotta-300" />
            </div>
            <div>
              <h2 className="font-serif font-bold text-sm tracking-tight">Load Protocol</h2>
              <p className="text-[11px] text-charcoal-400 font-mono">
                Upload a PDF or select a built-in template
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-charcoal-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-charcoal-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Loading Overlay ──────────────────────────────────────────────── */}
        {uploadState === 'loading' && (
          <div className="absolute inset-0 z-20 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center space-y-4 px-6">
            <div className="relative">
              <div className="h-14 w-14 rounded-full border-[3px] border-linen-200 border-t-terracotta-600 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <FileText className="h-5 w-5 text-terracotta-600" />
              </div>
            </div>
            <div className="text-center space-y-1">
              <p className="font-serif font-bold text-sm text-charcoal-900">
                Extracting Protocol Intelligence
              </p>
              <p className="text-xs text-charcoal-500 font-mono min-h-[18px] transition-all">
                {LOADING_MESSAGES[loadingMsgIdx]}
              </p>
            </div>
            <div className="w-48 h-1 bg-linen-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-terracotta-500 rounded-full transition-all duration-700"
                style={{
                  width: `${Math.round(((loadingMsgIdx + 1) / LOADING_MESSAGES.length) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* ── Success Flash ────────────────────────────────────────────────── */}
        {uploadState === 'success' && (
          <div className="absolute inset-0 z-20 bg-white flex flex-col items-center justify-center space-y-3 px-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-sage-500 animate-pulse" />
            <p className="font-serif font-bold text-sm text-charcoal-900">
              {loadedProtocol?.extraction_status === 'heuristic_fallback'
                ? 'Protocol Initialized with Baseline Schedule'
                : 'Protocol Structure Extracted'}
            </p>
            <p className="text-xs text-charcoal-500">
              {loadedProtocol?.extraction_status === 'heuristic_fallback'
                ? 'Sparse tables detected. Standard Phase II/III oncology baseline parameters loaded.'
                : 'Loading interactive workspace…'}
            </p>
          </div>
        )}

        {/* ── Body ──────────────────────────────────────────────────────────── */}
        <div className="p-6 space-y-6">
          {/* Error banner */}
          {uploadState === 'error' && (
            <div className="flex items-start space-x-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <strong>Extraction failed:</strong> {errorMessage}
              </div>
              <button onClick={reset} className="text-red-500 hover:text-red-700 font-semibold">
                Retry
              </button>
            </div>
          )}

          {/* ── Section A: Built-in Sample Protocols ──────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-mono font-semibold text-charcoal-500 uppercase tracking-widest">
                Built-In Templates
              </span>
              <div className="flex-1 h-px bg-linen-200" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {SAMPLE_PROTOCOLS.map((sp) => {
                const Icon = sp.icon;
                const c = colorMap[sp.color];
                const isSelected = selectedSample === sp.type;
                return (
                  <button
                    key={sp.type}
                    onClick={() => handleLoadSample(sp.type)}
                    disabled={uploadState === 'loading'}
                    className={`text-left p-3.5 rounded-xl border transition-all duration-150 ${
                      isSelected ? c.selected : `bg-white ${c.border} border`
                    } disabled:opacity-50 disabled:cursor-not-allowed group`}
                  >
                    <div className={`h-8 w-8 rounded-lg ${c.bg} flex items-center justify-center mb-2.5`}>
                      <Icon className={`h-4 w-4 ${c.icon}`} />
                    </div>
                    <div className="space-y-0.5 mb-2">
                      <p className="text-[10px] font-mono text-charcoal-500">{sp.label}</p>
                      <p className="text-xs font-semibold text-charcoal-900 leading-tight">
                        {sp.name}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {sp.tags.map((tag) => (
                        <span key={tag} className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full ${c.tag}`}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center space-x-3">
            <div className="flex-1 h-px bg-linen-200" />
            <span className="text-[10px] font-mono text-charcoal-400 uppercase tracking-widest">
              or upload your own
            </span>
            <div className="flex-1 h-px bg-linen-200" />
          </div>

          {/* ── Section B: Drag-Drop PDF Upload ──────────────────────────── */}
          <div className="space-y-3">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-150 ${
                isDragging
                  ? 'border-terracotta-400 bg-terracotta-50 scale-[1.01]'
                  : selectedFile
                  ? 'border-sage-400 bg-sage-50'
                  : 'border-linen-300 hover:border-terracotta-300 hover:bg-linen-50 bg-white'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleFileSelect}
              />

              {selectedFile ? (
                <div className="flex items-center justify-center space-x-3">
                  <div className="h-10 w-10 rounded-xl bg-sage-100 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-sage-600" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-semibold text-charcoal-900 truncate max-w-xs">
                      {selectedFile.name}
                    </p>
                    <p className="text-[11px] text-charcoal-500 font-mono">
                      {(selectedFile.size / 1024).toFixed(1)} KB · PDF
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                    className="text-charcoal-400 hover:text-charcoal-700 ml-2"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="h-10 w-10 mx-auto rounded-xl bg-linen-200 flex items-center justify-center">
                    <Upload className="h-5 w-5 text-charcoal-500" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-charcoal-700">
                      Drop protocol PDF here
                    </p>
                    <p className="text-[11px] text-charcoal-400 font-mono">
                      or click to browse · .pdf only
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Upload action */}
            {selectedFile && (
              <button
                onClick={handleUploadPDF}
                disabled={uploadState === 'loading'}
                className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl bg-charcoal-900 hover:bg-charcoal-800 text-white text-xs font-semibold transition-colors disabled:opacity-50 shadow-sm"
              >
                {uploadState === 'loading' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5 text-terracotta-300" />
                )}
                <span>Extract & Analyze Protocol</span>
              </button>
            )}
          </div>

          {/* ── Saved Uploaded Protocols (from DuckDB) ───────────────────── */}
          {savedProtocols.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-mono font-semibold text-charcoal-500 uppercase tracking-widest">
                  Saved Institutional Uploads ({savedProtocols.length})
                </span>
                <div className="flex-1 h-px bg-linen-200" />
              </div>

              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {savedProtocols.map((saved) => (
                  <button
                    key={saved.protocol_id}
                    type="button"
                    onClick={() => void onProtocolLoaded(saved)}
                    className="w-full text-left px-3 py-2 rounded-xl border border-linen-200 bg-linen-50 hover:bg-linen-100 flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <span className="font-mono font-bold text-charcoal-900 mr-2">{saved.protocol_id}</span>
                      <span className="text-charcoal-700 truncate">{saved.title}</span>
                    </div>
                    <span className="text-[10px] font-mono text-terracotta-600 shrink-0 font-semibold">
                      {saved.visits.length} visits
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Footer note ──────────────────────────────────────────────── */}
          <p className="text-[10px] text-charcoal-400 font-mono text-center leading-relaxed">
            Extraction uses PyMuPDF text analysis. Eligibility thresholds, SoA procedures,
            and burden scores are computed automatically. Sparse PDFs fall back to calibrated defaults.
          </p>
        </div>
      </div>
    </div>
  );
};
