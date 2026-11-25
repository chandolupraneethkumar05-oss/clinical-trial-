import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { LandingPage } from './components/LandingPage';
import type { StudioTab } from './components/StudioWorkspace';
import type { AuditEvent, AuditVerificationStatus } from './types/audit';
import type {
  ClinicalProtocol,
  FunnelSimulationResult,
  RetentionPoint,
  BenchmarkTrial,
} from './types/protocol';
import type { AuthUser, AuthModalView } from './types/auth';
import {
  apiFetchJson,
  apiUrl,
  extractApiErrorMessage,
  parseJsonSafe,
  SessionExpiredError,
} from './lib/api';

// Route-level code-splitting for heavy workspace, portal and modal chunks
const StudioWorkspace = lazy(() =>
  import('./components/StudioWorkspace').then((m) => ({ default: m.StudioWorkspace }))
);
const PatientPortal = lazy(() =>
  import('./components/PatientPortal').then((m) => ({ default: m.PatientPortal }))
);
const ProtocolUploadModal = lazy(() =>
  import('./components/ProtocolUploadModal').then((m) => ({ default: m.ProtocolUploadModal }))
);
const AuthModal = lazy(() =>
  import('./components/AuthModal').then((m) => ({ default: m.AuthModal }))
);

interface ParsedRoute {
  view: 'landing' | 'studio';
  tab: StudioTab;
  resetToken: string;
}

/**
 * Parses browser URL hash into structured application route state.
 * Supports: #/, #/studio, #/studio?tab=<...>, #/patient, and #/reset-password?token=...
 */
function parseHashRoute(): ParsedRoute {
  try {
    const rawHash = window.location.hash.replace(/^#\/?/, '');
    const [pathPart, queryPart] = rawHash.split('?');
    const params = new URLSearchParams(queryPart || '');
    const tabParam = params.get('tab') as StudioTab;
    const validTabs: StudioTab[] = ['sandbox', 'soe', 'overview', 'benchmarks', 'audit'];
    const tab: StudioTab = validTabs.includes(tabParam) ? tabParam : 'sandbox';

    if (pathPart.startsWith('reset-password')) {
      const token = (params.get('token') || '').trim();
      return { view: 'landing', tab: 'sandbox', resetToken: token };
    }

    if (pathPart.startsWith('studio') || pathPart.startsWith('patient')) {
      return { view: 'studio', tab, resetToken: '' };
    }
  } catch {
    // fallback
  }
  return { view: 'landing', tab: 'sandbox', resetToken: '' };
}

function readStoredUser(): AuthUser | null {
  try {
    const stored = localStorage.getItem('protocolshield_user');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export default function App() {
  // ── 1. Strictly Authenticated User Session (No Mock Fallback) ──────────────
  const [user, setUser] = useState<AuthUser | null>(readStoredUser);

  // ── 2. Route & Tab State with URL Hash Synchronization ─────────────────────
  const initialRoute = parseHashRoute();

  // If user is unauthenticated and tries to open studio directly on boot, gate to landing
  const [viewMode, setViewMode] = useState<'landing' | 'studio'>(() => {
    if (initialRoute.view === 'studio') {
      return readStoredUser() ? 'studio' : 'landing';
    }
    return 'landing';
  });

  const [activeStudioTab, setActiveStudioTab] = useState<StudioTab>(initialRoute.tab);

  const [pendingRoute, setPendingRoute] = useState<{ view: 'landing' | 'studio'; tab: StudioTab } | null>(() => {
    if (initialRoute.view === 'studio') {
      return readStoredUser() ? null : { view: 'studio', tab: initialRoute.tab };
    }
    return null;
  });

  // ── 3. Data & Feasibility State ───────────────────────────────────────────
  const [loading, setLoading] = useState<boolean>(false);
  const [studioError, setStudioError] = useState<string | null>(null);
  const [studioReloadNonce, setStudioReloadNonce] = useState<number>(0);

  const [protocol, setProtocol] = useState<ClinicalProtocol | null>(null);
  const [totalCohortSize, setTotalCohortSize] = useState<number>(10000);
  const [funnelData, setFunnelData] = useState<FunnelSimulationResult | null>(null);
  const [retentionCurve, setRetentionCurve] = useState<RetentionPoint[]>([]);
  const [simulationError, setSimulationError] = useState<string | null>(null);

  const [benchmarks, setBenchmarks] = useState<BenchmarkTrial[]>([]);
  const [benchmarksError, setBenchmarksError] = useState<string | null>(null);
  const [benchmarksReloadNonce, setBenchmarksReloadNonce] = useState<number>(0);

  const [appliedAmendmentIds, setAppliedAmendmentIds] = useState<string[]>([]);

  // Real audit state — initialized empty, populated exclusively from backend
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState<boolean>(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditVerification, setAuditVerification] = useState<AuditVerificationStatus | null>(null);

  // ── 4. Modal Overlays ─────────────────────────────────────────────────────
  const [initialResetToken, setInitialResetToken] = useState<string>(() => initialRoute.resetToken);
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(() => {
    if (initialRoute.resetToken) return true;
    if (initialRoute.view === 'studio') {
      return !readStoredUser();
    }
    return false;
  });
  const [authModalView, setAuthModalView] = useState<AuthModalView>(() =>
    initialRoute.resetToken ? 'forgot_password' : 'signin'
  );

  // Scrub raw reset token from address bar once captured in state
  useEffect(() => {
    if (initialRoute.resetToken && window.location.hash.includes('reset-password')) {
      try {
        window.history.replaceState(null, '', '#/');
      } catch {
        window.location.hash = '#/';
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 5. Route Synchronization Helper ───────────────────────────────────────
  const navigateTo = useCallback(
    (view: 'landing' | 'studio', tab: StudioTab = 'sandbox') => {
      if (view === 'studio') {
        if (!user) {
          setPendingRoute({ view: 'studio', tab });
          setAuthModalView('signin');
          setShowAuthModal(true);
          return;
        }
        setViewMode('studio');
        setActiveStudioTab(tab);
        window.location.hash = user.role === 'patient' ? '#/patient' : `#/studio?tab=${tab}`;
      } else {
        setViewMode('landing');
        window.location.hash = '#/';
      }
    },
    [user]
  );

  const handleTabChange = useCallback((tab: StudioTab) => {
    setActiveStudioTab(tab);
    window.location.hash = `#/studio?tab=${tab}`;
  }, []);

  // Intercept unauthorized direct deep-linking on initial mount without cascading renders
  useEffect(() => {
    if (!user && pendingRoute) {
      window.location.hash = '#/';
    }
  }, [user, pendingRoute]);

  // Listen to browser Back / Forward buttons and manual hash edits
  useEffect(() => {
    const handleHashChange = () => {
      const route = parseHashRoute();
      if (route.resetToken) {
        setInitialResetToken(route.resetToken);
        setAuthModalView('forgot_password');
        setShowAuthModal(true);
        try {
          window.history.replaceState(null, '', '#/');
        } catch {
          window.location.hash = '#/';
        }
        return;
      }

      if (route.view === 'studio') {
        const stored = readStoredUser();
        if (!stored) {
          setPendingRoute({ view: 'studio', tab: route.tab });
          setViewMode('landing');
          setAuthModalView('signin');
          setShowAuthModal(true);
          window.location.hash = '#/';
          return;
        }
        setViewMode('studio');
        setActiveStudioTab(route.tab);
      } else {
        setViewMode('landing');
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // ── Helper: Authenticated Headers for API Requests ─────────────────────────
  const getAuthHeaders = useCallback(
    (extraHeaders: Record<string, string> = {}): Record<string, string> => {
      const headers: Record<string, string> = { ...extraHeaders };
      const token = user?.token || readStoredUser()?.token || null;
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      return headers;
    },
    [user?.token]
  );

  const handleSessionExpired = useCallback(() => {
    try {
      localStorage.removeItem('protocolshield_user');
    } catch {
      // ignore
    }
    setUser(null);
    setFunnelData(null);
    setRetentionCurve([]);
    setBenchmarks([]);
    setBenchmarksError(null);
    setSimulationError(null);
    setStudioError(null);
    setAuditEvents([]);
    setAuditVerification(null);
    setAuditError(null);
    setViewMode('landing');
    window.location.hash = '#/';
    setAuthModalView('signin');
    setShowAuthModal(true);
  }, []);

  // Fetch real audit log records and verification status from backend
  const fetchAuditData = useCallback(
    async (signal?: AbortSignal) => {
      if (!user?.token || user.role === 'patient') return;
      setAuditLoading(true);
      setAuditError(null);
      try {
        const headers = getAuthHeaders();
        const [logsRes, verifyRes] = await Promise.all([
          fetch(apiUrl('/api/v1/audit/logs'), { headers, signal }),
          fetch(apiUrl('/api/v1/audit/verify'), { headers, signal }),
        ]);

        if (signal?.aborted) return;

        if (logsRes.status === 401 || verifyRes.status === 401) {
          handleSessionExpired();
          return;
        }

        if (logsRes.ok) {
          const logsData = await parseJsonSafe(logsRes);
          setAuditEvents(Array.isArray(logsData) ? logsData : []);
        } else {
          const errPayload = await parseJsonSafe(logsRes);
          setAuditEvents([]);
          setAuditError(extractApiErrorMessage(errPayload, 'Unable to load operational audit logs.'));
        }

        if (verifyRes.ok) {
          const verifyData = await parseJsonSafe(verifyRes);
          setAuditVerification((verifyData as AuditVerificationStatus | null) ?? null);
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        setAuditEvents([]);
        setAuditError('Connection failure retrieving audit ledger.');
      } finally {
        if (!signal?.aborted) {
          setAuditLoading(false);
        }
      }
    },
    [user?.token, user?.role, getAuthHeaders, handleSessionExpired]
  );

  // Proactively validate active session with backend /auth/me on mount or token change
  useEffect(() => {
    const token = user?.token;
    if (!token) return;
    const controller = new AbortController();

    async function validateSession() {
      try {
        const res = await fetch(apiUrl('/api/v1/auth/me'), {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (res.status === 401 || !res.ok) {
          handleSessionExpired();
        } else {
          const freshData = (await parseJsonSafe(res)) as { user?: Partial<AuthUser> } | null;
          if (freshData?.user) {
            setUser((prev) => {
              if (!prev) return prev;
              return { ...prev, ...freshData.user, token: prev.token };
            });
          }
        }
      } catch {
        // Network failure — preserve current client state until backend responds
      }
    }

    validateSession();
    return () => controller.abort();
  }, [user?.token, handleSessionExpired]);

  // ── 6. Initial Data Fetching Scoped by Role & Authentication ──────────────
  useEffect(() => {
    const controller = new AbortController();

    async function loadInitialData() {
      const token = user?.token;
      const role = user?.role;

      // For anonymous visitors or patient role: do NOT call doctor-only cohort/benchmark/audit routes
      if (!token || role === 'patient') {
        setLoading(false);
        setStudioError(null);
        return;
      }

      try {
        setLoading(true);
        setStudioError(null);
        setSimulationError(null);

        // 1. Fetch Sample Protocol
        const protoJson = await apiFetchJson<ClinicalProtocol>('/api/v1/protocol/sample', {
          signal: controller.signal,
          onUnauthorized: handleSessionExpired,
        });
        if (controller.signal.aborted) return;
        setProtocol(protoJson);

        // 2. Fetch Initial Cohort Funnel
        const fJson = await apiFetchJson<FunnelSimulationResult>('/api/v1/cohort/simulate-funnel', {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(protoJson.eligibility.structured_filters || {}),
          signal: controller.signal,
          onUnauthorized: handleSessionExpired,
        });
        if (controller.signal.aborted) return;
        setFunnelData(fJson);
        setTotalCohortSize(fJson.total_population);

        // 3. Fetch Retention Curve
        if (protoJson.burden) {
          const durationWeeks = protoJson.study_duration_weeks ?? 52;
          const peakWeeks = protoJson.burden.peak_burden_weeks ?? [];
          const retParams = new URLSearchParams({
            enrolled_size: String(fJson.final_eligible_count),
            composite_pbi: String(protoJson.burden.composite_pbi_score),
            study_duration_weeks: String(durationWeeks),
          });
          for (const wk of peakWeeks) {
            retParams.append('peak_weeks', String(wk));
          }
          const rJson = await apiFetchJson<{ retention_curve?: RetentionPoint[] }>(
            `/api/v1/cohort/retention-curve?${retParams.toString()}`,
            {
              headers: getAuthHeaders(),
              signal: controller.signal,
              onUnauthorized: handleSessionExpired,
            }
          );
          if (controller.signal.aborted) return;
          setRetentionCurve(Array.isArray(rJson.retention_curve) ? rJson.retention_curve : []);
        }

        // 4. Fetch Benchmarks separately so a benchmark issue doesn't block the Studio
        try {
          setBenchmarksError(null);
          const bJson = await apiFetchJson<BenchmarkTrial[]>('/api/v1/benchmark/historical-trials', {
            headers: getAuthHeaders(),
            signal: controller.signal,
            onUnauthorized: handleSessionExpired,
          });
          if (!controller.signal.aborted) {
            setBenchmarks(Array.isArray(bJson) ? bJson : []);
          }
        } catch (benchErr) {
          if ((benchErr as Error)?.name === 'AbortError' || benchErr instanceof SessionExpiredError) {
            return;
          }
          setBenchmarks([]);
          setBenchmarksError(
            benchErr instanceof Error ? benchErr.message : 'Unable to load historical benchmark trials.'
          );
        }

        // 5. Fetch Audit Ledger & SHA-256 Verification
        await fetchAuditData(controller.signal);
      } catch (err) {
        if ((err as Error)?.name === 'AbortError' || err instanceof SessionExpiredError) {
          return;
        }
        setStudioError(
          err instanceof Error
            ? err.message
            : 'Unable to initialize ProtocolShield Studio from backend API.'
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadInitialData();
    return () => controller.abort();
  }, [user?.token, user?.role, getAuthHeaders, handleSessionExpired, fetchAuditData, studioReloadNonce]);

  // Retry benchmarks independently
  useEffect(() => {
    if (benchmarksReloadNonce === 0 || !user?.token || user.role === 'patient') return;
    const controller = new AbortController();

    async function reloadBenchmarks() {
      try {
        setBenchmarksError(null);
        const bJson = await apiFetchJson<BenchmarkTrial[]>('/api/v1/benchmark/historical-trials', {
          headers: getAuthHeaders(),
          signal: controller.signal,
          onUnauthorized: handleSessionExpired,
        });
        if (!controller.signal.aborted) {
          setBenchmarks(Array.isArray(bJson) ? bJson : []);
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError' || err instanceof SessionExpiredError) {
          return;
        }
        setBenchmarksError(
          err instanceof Error ? err.message : 'Unable to load historical benchmark trials.'
        );
      }
    }

    reloadBenchmarks();
    return () => controller.abort();
  }, [benchmarksReloadNonce, user?.token, user?.role, getAuthHeaders, handleSessionExpired]);

  // ── 7. Simulations & Protocol Mutation Handlers ───────────────────────────
  const handleSimulateFunnel = useCallback(
    async (criteria: Record<string, unknown>, signal?: AbortSignal): Promise<FunnelSimulationResult> => {
      try {
        const result = await apiFetchJson<FunnelSimulationResult>('/api/v1/cohort/simulate-funnel', {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(criteria),
          signal,
          onUnauthorized: handleSessionExpired,
        });
        setSimulationError(null);
        return result;
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError' && !(err instanceof SessionExpiredError)) {
          setSimulationError(err instanceof Error ? err.message : 'Cohort funnel simulation failed.');
        }
        throw err;
      }
    },
    [getAuthHeaders, handleSessionExpired]
  );

  const handleCalculateRetention = useCallback(
    async (
      enrolled: number,
      pbi: number,
      durationWeeks = 52,
      peakWeeks: number[] = [],
      signal?: AbortSignal
    ): Promise<RetentionPoint[]> => {
      const params = new URLSearchParams({
        enrolled_size: String(enrolled),
        composite_pbi: String(pbi),
        study_duration_weeks: String(durationWeeks),
      });
      for (const wk of peakWeeks) {
        params.append('peak_weeks', String(wk));
      }
      try {
        const json = await apiFetchJson<{ retention_curve?: RetentionPoint[] }>(
          `/api/v1/cohort/retention-curve?${params.toString()}`,
          {
            headers: getAuthHeaders(),
            signal,
            onUnauthorized: handleSessionExpired,
          }
        );
        setSimulationError(null);
        return Array.isArray(json.retention_curve) ? json.retention_curve : [];
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError' && !(err instanceof SessionExpiredError)) {
          setSimulationError(err instanceof Error ? err.message : 'Retention projection failed.');
        }
        throw err;
      }
    },
    [getAuthHeaders, handleSessionExpired]
  );

  const handleSimulationUpdated = useCallback(
    (newFunnel: FunnelSimulationResult, newRetention: RetentionPoint[]) => {
      setFunnelData(newFunnel);
      setTotalCohortSize(newFunnel.total_population);
      setRetentionCurve(newRetention);
      setSimulationError(null);
    },
    []
  );

  const handleProtocolLoaded = useCallback(
    async (newProtocol: ClinicalProtocol) => {
      setProtocol(newProtocol);
      setShowUploadModal(false);
      setSimulationError(null);

      try {
        const filters = newProtocol.eligibility?.structured_filters ?? {};
        const newFunnel = await handleSimulateFunnel(filters);
        setFunnelData(newFunnel);
        setTotalCohortSize(newFunnel.total_population);

        if (newProtocol.burden && newFunnel) {
          const newRetention = await handleCalculateRetention(
            newFunnel.final_eligible_count,
            newProtocol.burden.composite_pbi_score,
            newProtocol.study_duration_weeks ?? 52,
            newProtocol.burden.peak_burden_weeks ?? []
          );
          setRetentionCurve(newRetention);
        }
      } catch (err) {
        if (err instanceof SessionExpiredError) return;
        setSimulationError(
          err instanceof Error
            ? `Protocol loaded, but cohort simulation failed: ${err.message}`
            : 'Protocol loaded, but cohort simulation failed.'
        );
      }
    },
    [handleSimulateFunnel, handleCalculateRetention]
  );

  const handleSwitchTemplate = useCallback(
    async (templateType: 'nsclc' | 'tnbc' | 'myeloma') => {
      try {
        setAppliedAmendmentIds([]);
        setSimulationError(null);
        const protoJson = await apiFetchJson<ClinicalProtocol>(`/api/v1/protocol/sample/${templateType}`, {
          onUnauthorized: handleSessionExpired,
        });
        await handleProtocolLoaded(protoJson);
      } catch (err) {
        if (err instanceof SessionExpiredError) return;
        setSimulationError(err instanceof Error ? err.message : 'Failed to switch protocol template.');
      }
    },
    [handleProtocolLoaded, handleSessionExpired]
  );

  const handleUploadFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
        setSimulationError('Invalid file format. Please upload a .pdf clinical trial protocol.');
        setShowUploadModal(true);
        return;
      }
      try {
        setAppliedAmendmentIds([]);
        setSimulationError(null);
        const form = new FormData();
        form.append('file', file);
        const res = await fetch(apiUrl('/api/v1/protocol/upload'), {
          method: 'POST',
          headers: getAuthHeaders(),
          body: form,
        });
        if (res.status === 401) {
          handleSessionExpired();
          return;
        }
        if (res.ok) {
          const protoJson = (await parseJsonSafe(res)) as ClinicalProtocol | null;
          if (protoJson) {
            await handleProtocolLoaded(protoJson);
            return;
          }
        }
        const errPayload = await parseJsonSafe(res);
        setSimulationError(extractApiErrorMessage(errPayload, 'Protocol PDF upload failed.'));
        setShowUploadModal(true);
      } catch {
        setSimulationError('Network error while uploading protocol PDF.');
        setShowUploadModal(true);
      }
    },
    [getAuthHeaders, handleSessionExpired, handleProtocolLoaded]
  );

  const handleApplyAmendment = useCallback(
    async (amendmentId: string) => {
      if (!protocol) return;
      const updatedProtocol = await apiFetchJson<ClinicalProtocol>('/api/v1/optimizer/apply-amendment', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          protocol,
          amendment_id: amendmentId,
        }),
        onUnauthorized: handleSessionExpired,
      });

      setAppliedAmendmentIds((prev) => (prev.includes(amendmentId) ? prev : [...prev, amendmentId]));
      await handleProtocolLoaded(updatedProtocol);
      // Backend /optimizer/apply-amendment records the canonical SHA-256 audit log; refresh it here
      await fetchAuditData();
    },
    [protocol, getAuthHeaders, handleSessionExpired, handleProtocolLoaded, fetchAuditData]
  );

  // ── 8. Strict Authentication Lifecycle Handlers ───────────────────────────
  const handleLoginSuccess = (authUser: AuthUser) => {
    setUser(authUser);
    setInitialResetToken('');
    setShowAuthModal(false);
    setStudioError(null);
    setSimulationError(null);
    try {
      localStorage.setItem('protocolshield_user', JSON.stringify(authUser));
    } catch {
      // ignore
    }

    if (authUser.role === 'patient') {
      setPendingRoute(null);
      setViewMode('studio');
      window.location.hash = '#/patient';
    } else if (pendingRoute && pendingRoute.view === 'studio') {
      const targetTab = pendingRoute.tab;
      setPendingRoute(null);
      setViewMode('studio');
      setActiveStudioTab(targetTab);
      window.location.hash = `#/studio?tab=${targetTab}`;
    } else {
      setViewMode('studio');
      setActiveStudioTab('sandbox');
      window.location.hash = '#/studio?tab=sandbox';
    }
  };

  const handleSignOut = async () => {
    const currentToken = user?.token;
    if (currentToken) {
      try {
        await fetch(apiUrl('/api/v1/auth/logout'), {
          method: 'POST',
          headers: { Authorization: `Bearer ${currentToken}` },
        });
      } catch {
        // continue clearing local session
      }
    }
    setUser(null);
    setFunnelData(null);
    setRetentionCurve([]);
    setBenchmarks([]);
    setBenchmarksError(null);
    setSimulationError(null);
    setStudioError(null);
    setAuditEvents([]);
    setAuditVerification(null);
    setAuditError(null);
    try {
      localStorage.removeItem('protocolshield_user');
    } catch {
      // ignore
    }
    setViewMode('landing');
    window.location.hash = '#/';
    setPendingRoute(null);
    setAuthModalView('signin');
    setShowAuthModal(true);
  };

  const handleOpenAuth = (defaultView: AuthModalView = 'signin') => {
    setInitialResetToken('');
    setAuthModalView(defaultView);
    setShowAuthModal(true);
  };

  return (
    <>
      <Suspense
        fallback={
          <div className="min-h-screen bg-linen-100 flex items-center justify-center p-8 text-xs font-mono text-charcoal-500">
            <div className="text-center space-y-2">
              <div className="h-6 w-6 border-2 border-charcoal-900 border-t-transparent rounded-full animate-spin mx-auto" />
              <p>Loading application view…</p>
            </div>
          </div>
        }
      >
        {viewMode === 'landing' || !user ? (
          <LandingPage
            totalCohortSize={totalCohortSize}
            onLaunchStudio={() => navigateTo('studio', 'sandbox')}
            user={user}
            onOpenAuth={() => handleOpenAuth('signin')}
            onSignOut={handleSignOut}
            onSwitchPersona={() => handleOpenAuth('signin')}
          />
        ) : user.role === 'patient' ? (
          <PatientPortal
            user={user}
            onSignOut={handleSignOut}
            onSwitchPersona={() => handleOpenAuth('signin')}
            onOpenAuth={() => handleOpenAuth('signin')}
            onSessionExpired={handleSessionExpired}
            onBackToLanding={() => navigateTo('landing')}
          />
        ) : studioError ? (
          <div className="min-h-screen bg-linen-100 flex items-center justify-center p-4">
            <div className="bg-white border border-red-300 p-8 rounded-2xl shadow-sm text-center space-y-4 max-w-md w-full">
              <p className="font-serif text-base font-bold text-charcoal-900 tracking-tight">
                Unable to Initialize ProtocolShield Studio
              </p>
              <p className="text-xs text-red-700 font-mono break-words">{studioError}</p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => setStudioReloadNonce((n) => n + 1)}
                  className="px-4 py-2 rounded-lg bg-charcoal-900 text-white text-xs font-semibold hover:bg-charcoal-800 cursor-pointer"
                >
                  Retry Initialization
                </button>
                <button
                  onClick={() => navigateTo('landing')}
                  className="text-xs text-terracotta-600 hover:underline font-mono cursor-pointer"
                >
                  ← Return to Overview
                </button>
              </div>
            </div>
          </div>
        ) : loading || !protocol ? (
          <div className="min-h-screen bg-linen-100 flex items-center justify-center p-4">
            <div className="bg-white border border-linen-300 p-8 rounded-2xl shadow-sm text-center space-y-3 max-w-sm w-full">
              <div className="h-8 w-8 border-3 border-charcoal-900 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="font-serif text-sm font-bold text-charcoal-900 tracking-tight">
                Initializing ProtocolShield Studio...
              </p>
              <p className="text-xs text-charcoal-500 font-mono">
                Loading {totalCohortSize.toLocaleString()} Patient Cohort in DuckDB
              </p>
              <button
                onClick={() => navigateTo('landing')}
                className="text-xs text-terracotta-600 hover:underline pt-2 block mx-auto font-mono cursor-pointer"
              >
                ← Return to Overview
              </button>
            </div>
          </div>
        ) : (
          <StudioWorkspace
            protocol={protocol}
            totalCohortSize={totalCohortSize}
            funnelData={funnelData}
            retentionCurve={retentionCurve}
            benchmarks={benchmarks}
            benchmarksError={benchmarksError}
            onRetryBenchmarks={() => setBenchmarksReloadNonce((n) => n + 1)}
            simulationError={simulationError}
            user={user}
            activeTab={activeStudioTab}
            onTabChange={handleTabChange}
            onBackToLanding={() => navigateTo('landing')}
            onSimulateFunnel={handleSimulateFunnel}
            onCalculateRetention={handleCalculateRetention}
            onSimulationUpdated={handleSimulationUpdated}
            onOpenUpload={() => setShowUploadModal(true)}
            onOpenAuth={() => handleOpenAuth('signin')}
            onSignOut={handleSignOut}
            onSwitchPersona={() => handleOpenAuth('signin')}
            onSwitchTemplate={handleSwitchTemplate}
            onUploadFile={handleUploadFile}
            onApplyAmendment={handleApplyAmendment}
            onUnauthorized={handleSessionExpired}
            appliedAmendmentIds={appliedAmendmentIds}
            auditEvents={auditEvents}
            auditLoading={auditLoading}
            auditError={auditError}
            onRetryAudit={() => fetchAuditData()}
            auditVerification={auditVerification}
          />
        )}

        {/* Protocol Upload Modal */}
        {showUploadModal && (
          <ProtocolUploadModal
            onClose={() => setShowUploadModal(false)}
            onProtocolLoaded={handleProtocolLoaded}
            onUnauthorized={handleSessionExpired}
          />
        )}

        {/* Enterprise Authentication Modal */}
        {showAuthModal && (
          <AuthModal
            initialView={authModalView}
            initialResetToken={initialResetToken}
            onClose={() => {
              setShowAuthModal(false);
              setInitialResetToken('');
            }}
            onLoginSuccess={handleLoginSuccess}
          />
        )}
      </Suspense>
    </>
  );
}
