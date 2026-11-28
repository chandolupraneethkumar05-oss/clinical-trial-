import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { LandingPage } from './components/LandingPage';
import type { StudioTab } from './components/StudioWorkspace';
import type {
  AuditEvent,
  AuditVerificationStatus,
  ManagedUserAccount,
  PatientInterestSummary,
  PatientScreeningRecord,
} from './types/audit';
import type {
  ClinicalProtocol,
  FunnelSimulationResult,
  RetentionPoint,
  BenchmarkTrial,
  HistoricalBenchmarksResponse,
} from './types/protocol';

type HistoricalBenchmarksPayload = BenchmarkTrial[] | HistoricalBenchmarksResponse;

function extractBenchmarksPayload(payload: HistoricalBenchmarksPayload): {
  trials: BenchmarkTrial[];
  disclaimer: string | null;
} {
  if (Array.isArray(payload)) {
    return { trials: payload, disclaimer: null };
  }
  if (payload && Array.isArray(payload.trials)) {
    return {
      trials: payload.trials,
      disclaimer: typeof payload.data_disclaimer === 'string' ? payload.data_disclaimer : null,
    };
  }
  return { trials: [], disclaimer: null };
}
import type { AuthUser, AuthModalView, PortalLoginRole } from './types/auth';
import type { ReadinessResponse, CohortStatsResponse } from './components/AdminPortal';
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
const AdminPortal = lazy(() =>
  import('./components/AdminPortal').then((m) => ({ default: m.AdminPortal }))
);
const ProtocolUploadModal = lazy(() =>
  import('./components/ProtocolUploadModal').then((m) => ({ default: m.ProtocolUploadModal }))
);
const AuthModal = lazy(() =>
  import('./components/AuthModal').then((m) => ({ default: m.AuthModal }))
);
const FloatingAIAgent = lazy(() =>
  import('./components/FloatingAIAgent').then((m) => ({ default: m.FloatingAIAgent }))
);

interface ParsedRoute {
  view: 'landing' | 'patient' | 'studio' | 'admin';
  tab: StudioTab;
  resetToken: string;
}

/**
 * Parses browser URL hash into structured application route state.
 * Supports: #/, #/studio, #/studio?tab=<...>, #/patient, #/admin, and #/reset-password?token=...
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

    if (pathPart.startsWith('admin')) {
      return { view: 'admin', tab: 'sandbox', resetToken: '' };
    }

    if (pathPart.startsWith('patient')) {
      return { view: 'patient', tab: 'sandbox', resetToken: '' };
    }

    if (pathPart.startsWith('studio')) {
      return { view: 'studio', tab, resetToken: '' };
    }
  } catch {
    // fallback
  }
  return { view: 'landing', tab: 'sandbox', resetToken: '' };
}

function normalizeUser(raw: AuthUser | null): AuthUser | null {
  if (!raw) return null;
  const role = String(raw.role || 'patient').toLowerCase().trim() || 'patient';
  return { ...raw, role };
}

function readStoredUser(): AuthUser | null {
  try {
    const stored = localStorage.getItem('protocolshield_user');
    return stored ? normalizeUser(JSON.parse(stored) as AuthUser) : null;
  } catch {
    return null;
  }
}

function resolveRoleHomeView(role: string): 'patient' | 'studio' | 'admin' {
  const r = String(role || 'patient').toLowerCase().trim();
  if (r === 'patient') return 'patient';
  if (r === 'admin') return 'admin';
  return 'studio';
}

export default function App() {
  // ── 1. Strictly Authenticated User Session (No Mock Fallback) ──────────────
  const [user, setUser] = useState<AuthUser | null>(readStoredUser);

  // ── 2. Route & Tab State with URL Hash Synchronization ─────────────────────
  const initialRoute = parseHashRoute();

  // Enforce strict role isolation on initial boot
  const [viewMode, setViewMode] = useState<'landing' | 'patient' | 'studio' | 'admin'>(() => {
    const stored = readStoredUser();
    if (!stored || initialRoute.view === 'landing') {
      return 'landing';
    }
    if (stored.role === 'patient') return 'patient';
    if (initialRoute.view === 'admin') {
      return stored.role === 'admin' ? 'admin' : 'studio';
    }
    if (initialRoute.view === 'studio') {
      return 'studio';
    }
    return resolveRoleHomeView(stored.role);
  });

  const [activeStudioTab, setActiveStudioTab] = useState<StudioTab>(initialRoute.tab);

  const [pendingRoute, setPendingRoute] = useState<{
    view: 'landing' | 'patient' | 'studio' | 'admin';
    tab: StudioTab;
  } | null>(() => {
    if (initialRoute.view !== 'landing') {
      return readStoredUser() ? null : { view: initialRoute.view, tab: initialRoute.tab };
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
  const [benchmarksDisclaimer, setBenchmarksDisclaimer] = useState<string | null>(null);
  const [benchmarksError, setBenchmarksError] = useState<string | null>(null);
  const [benchmarksReloadNonce, setBenchmarksReloadNonce] = useState<number>(0);

  const [appliedAmendmentIds, setAppliedAmendmentIds] = useState<string[]>([]);

  // Real audit state — initialized empty, populated exclusively from backend
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState<boolean>(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditVerification, setAuditVerification] = useState<AuditVerificationStatus | null>(null);
  const [patientScreenings, setPatientScreenings] = useState<PatientScreeningRecord[]>([]);
  const [verifyingScreeningId, setVerifyingScreeningId] = useState<string | null>(null);
  const [screeningVerifyError, setScreeningVerifyError] = useState<string | null>(null);
  const [patientInterests, setPatientInterests] = useState<PatientInterestSummary[]>([]);
  const [adminUsers, setAdminUsers] = useState<ManagedUserAccount[]>([]);
  const [promotingUserId, setPromotingUserId] = useState<string | null>(null);
  const [userPromoteError, setUserPromoteError] = useState<string | null>(null);
  const [adminReadiness, setAdminReadiness] = useState<ReadinessResponse | null>(null);
  const [cohortStats, setCohortStats] = useState<CohortStatsResponse | null>(null);
  const [adminOpsLoading, setAdminOpsLoading] = useState<boolean>(false);
  const [adminOpsError, setAdminOpsError] = useState<string | null>(null);

  // ── 4. Modal Overlays ─────────────────────────────────────────────────────
  const [initialResetToken, setInitialResetToken] = useState<string>(() => initialRoute.resetToken);
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(() => {
    if (initialRoute.resetToken) return true;
    if (initialRoute.view !== 'landing') {
      return !readStoredUser();
    }
    return false;
  });
  const [authModalView, setAuthModalView] = useState<AuthModalView>(() =>
    initialRoute.resetToken ? 'forgot_password' : 'signin'
  );
  const [authPortalRole, setAuthPortalRole] = useState<PortalLoginRole>(() => {
    if (initialRoute.view === 'admin') return 'admin';
    if (initialRoute.view === 'studio') return 'doctor';
    return 'patient';
  });

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
    (view: 'landing' | 'patient' | 'studio' | 'admin', tab: StudioTab = 'sandbox') => {
      if (view === 'landing') {
        setViewMode('landing');
        window.location.hash = '#/';
        return;
      }

      if (!user) {
        setPendingRoute({ view, tab });
        setAuthModalView('signin');
        setAuthPortalRole(view === 'admin' ? 'admin' : view === 'studio' ? 'doctor' : 'patient');
        setShowAuthModal(true);
        return;
      }

      const role = String(user.role || 'patient').toLowerCase().trim();
      if (role === 'patient') {
        setViewMode('patient');
        window.location.hash = '#/patient';
        return;
      }

      if (view === 'admin' && role === 'admin') {
        setViewMode('admin');
        window.location.hash = '#/admin';
        return;
      }

      setViewMode('studio');
      setActiveStudioTab(tab);
      window.location.hash = `#/studio?tab=${tab}`;
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

      if (route.view !== 'landing') {
        const stored = readStoredUser();
        if (!stored) {
          setPendingRoute({ view: route.view, tab: route.tab });
          setViewMode('landing');
          setAuthModalView('signin');
          setAuthPortalRole(
            route.view === 'admin' ? 'admin' : route.view === 'studio' ? 'doctor' : 'patient'
          );
          setShowAuthModal(true);
          window.location.hash = '#/';
          return;
        }
        if (stored.role === 'patient') {
          setViewMode('patient');
          if (!window.location.hash.startsWith('#/patient')) {
            window.location.hash = '#/patient';
          }
          return;
        }
        if (route.view === 'admin' && stored.role === 'admin') {
          setViewMode('admin');
          return;
        }
        if (route.view === 'patient' && stored.role === 'admin') {
          setViewMode('admin');
          window.location.hash = '#/admin';
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

  const handleSessionExpired = useCallback((openAuthModal = true) => {
    try {
      localStorage.removeItem('protocolshield_user');
    } catch {
      // ignore
    }
    setUser(null);
    setFunnelData(null);
    setRetentionCurve([]);
    setBenchmarks([]);
    setBenchmarksDisclaimer(null);
    setBenchmarksError(null);
    setSimulationError(null);
    setStudioError(null);
    setAuditEvents([]);
    setAuditVerification(null);
    setAuditError(null);
    setPatientScreenings([]);
    setScreeningVerifyError(null);
    setVerifyingScreeningId(null);
    setPatientInterests([]);
    setAdminUsers([]);
    setPromotingUserId(null);
    setUserPromoteError(null);
    setAdminReadiness(null);
    setCohortStats(null);
    setAdminOpsError(null);
    setViewMode('landing');
    window.location.hash = '#/';
    if (openAuthModal) {
      setAuthModalView('signin');
      setShowAuthModal(true);
    }
  }, []);

  // Fetch real audit log records, verification status, and submitted screenings from backend
  const fetchAuditData = useCallback(
    async (signal?: AbortSignal) => {
      if (!user?.token || user.role === 'patient') return;
      setAuditLoading(true);
      setAuditError(null);
      try {
        const headers = getAuthHeaders();
        const requests: Promise<Response>[] = [
          fetch(apiUrl('/api/v1/audit/logs'), { headers, signal }),
          fetch(apiUrl('/api/v1/audit/verify'), { headers, signal }),
          fetch(apiUrl('/api/v1/patient/screenings'), { headers, signal }),
          fetch(apiUrl('/api/v1/patient/interests'), { headers, signal }),
        ];
        if (user.role === 'admin') {
          requests.push(fetch(apiUrl('/api/v1/auth/users'), { headers, signal }));
        }

        const [logsRes, verifyRes, scrRes, intRes, usersRes] = await Promise.all(requests);

        if (signal?.aborted) return;

        if (
          logsRes.status === 401 ||
          verifyRes.status === 401 ||
          scrRes.status === 401 ||
          intRes.status === 401 ||
          usersRes?.status === 401
        ) {
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

        if (scrRes.ok) {
          const scrData = await parseJsonSafe(scrRes);
          setPatientScreenings(Array.isArray(scrData) ? scrData : []);
        }

        if (intRes.ok) {
          const intData = await parseJsonSafe(intRes);
          setPatientInterests(Array.isArray(intData) ? intData : []);
        }

        if (usersRes?.ok) {
          const usersData = await parseJsonSafe(usersRes);
          setAdminUsers(Array.isArray(usersData) ? usersData : []);
        } else if (user.role !== 'admin') {
          setAdminUsers([]);
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
          handleSessionExpired(parseHashRoute().view !== 'landing');
        } else {
          const freshData = (await parseJsonSafe(res)) as { user?: Partial<AuthUser> } | null;
          if (freshData?.user) {
            setUser((prev) => {
              if (!prev) return prev;
              const role = String(freshData.user?.role || prev.role || 'patient')
                .toLowerCase()
                .trim();
              return { ...prev, ...freshData.user, role, token: prev.token };
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

  const fetchAdminOpsData = useCallback(
    async (signal?: AbortSignal) => {
      if (!user?.token || user.role !== 'admin') return;
      setAdminOpsLoading(true);
      setAdminOpsError(null);
      try {
        const [readyRes, statsJson] = await Promise.all([
          fetch(apiUrl('/api/v1/system/ready'), { signal }),
          apiFetchJson<CohortStatsResponse>('/api/v1/cohort/stats', {
            headers: getAuthHeaders(),
            signal,
            onUnauthorized: handleSessionExpired,
          }),
        ]);
        if (signal?.aborted) return;
        const readyParsed = (await parseJsonSafe(readyRes)) as ReadinessResponse | null;
        setAdminReadiness(readyParsed);
        setCohortStats(statsJson);
      } catch (err) {
        if ((err as Error)?.name === 'AbortError' || err instanceof SessionExpiredError) {
          return;
        }
        setAdminOpsError(
          err instanceof Error ? err.message : 'Unable to load admin readiness or cohort telemetry.'
        );
      } finally {
        if (!signal?.aborted) {
          setAdminOpsLoading(false);
        }
      }
    },
    [user?.token, user?.role, getAuthHeaders, handleSessionExpired]
  );

  const handleRefreshAdminAll = useCallback(async () => {
    await Promise.all([fetchAdminOpsData(), fetchAuditData()]);
  }, [fetchAdminOpsData, fetchAuditData]);

  const handleSeedCohort = useCallback(
    async (forceRegenerate = false, confirmationPhrase?: string): Promise<string | null> => {
      const params = new URLSearchParams({
        total: '10000',
        force_regenerate: forceRegenerate ? 'true' : 'false',
      });
      if (forceRegenerate && confirmationPhrase) {
        params.set('confirm_regenerate', confirmationPhrase);
      }
      const res = await apiFetchJson<{ message?: string; total_records?: number }>(
        `/api/v1/cohort/seed?${params.toString()}`,
        {
          method: 'POST',
          headers: getAuthHeaders(),
          onUnauthorized: handleSessionExpired,
        }
      );
      await fetchAdminOpsData();
      return res.message || `Cohort verified (${res.total_records ?? 10000} records).`;
    },
    [getAuthHeaders, handleSessionExpired, fetchAdminOpsData]
  );

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
          const durationWeeks = Math.max(4, Math.min(156, protoJson.study_duration_weeks ?? 52));
          const safeEnrolled = Math.max(0, Math.min(10000, Math.round(fJson.final_eligible_count)));
          const peakWeeks = protoJson.burden.peak_burden_weeks ?? [];
          const retParams = new URLSearchParams({
            enrolled_size: String(safeEnrolled),
            composite_pbi: String(protoJson.burden.composite_pbi_score),
            duration_weeks: String(durationWeeks),
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
          const bJson = await apiFetchJson<HistoricalBenchmarksPayload>('/api/v1/benchmark/historical-trials', {
            headers: getAuthHeaders(),
            signal: controller.signal,
            onUnauthorized: handleSessionExpired,
          });
          if (!controller.signal.aborted) {
            const parsedBench = extractBenchmarksPayload(bJson);
            setBenchmarks(parsedBench.trials);
            setBenchmarksDisclaimer(parsedBench.disclaimer);
          }
        } catch (benchErr) {
          if ((benchErr as Error)?.name === 'AbortError' || benchErr instanceof SessionExpiredError) {
            return;
          }
          setBenchmarks([]);
          setBenchmarksDisclaimer(null);
          setBenchmarksError(
            benchErr instanceof Error ? benchErr.message : 'Unable to load historical benchmark trials.'
          );
        }

        // 5. Fetch Audit Ledger & SHA-256 Verification
        await fetchAuditData(controller.signal);

        // 6. Fetch Admin Operations Telemetry when logged in as Administrator
        if (role === 'admin') {
          await fetchAdminOpsData(controller.signal);
        }
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
  }, [user?.token, user?.role, getAuthHeaders, handleSessionExpired, fetchAuditData, fetchAdminOpsData, studioReloadNonce]);

  // Retry benchmarks independently
  useEffect(() => {
    if (benchmarksReloadNonce === 0 || !user?.token || user.role === 'patient') return;
    const controller = new AbortController();

    async function reloadBenchmarks() {
      try {
        setBenchmarksError(null);
        const bJson = await apiFetchJson<HistoricalBenchmarksPayload>('/api/v1/benchmark/historical-trials', {
          headers: getAuthHeaders(),
          signal: controller.signal,
          onUnauthorized: handleSessionExpired,
        });
        if (!controller.signal.aborted) {
          const parsedBench = extractBenchmarksPayload(bJson);
          setBenchmarks(parsedBench.trials);
          setBenchmarksDisclaimer(parsedBench.disclaimer);
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
      const safeEnrolled = Math.max(0, Math.min(10000, Math.round(enrolled)));
      const safeDuration = Math.max(4, Math.min(156, Math.round(durationWeeks)));
      const params = new URLSearchParams({
        enrolled_size: String(safeEnrolled),
        composite_pbi: String(pbi),
        duration_weeks: String(safeDuration),
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

  const handleVerifyScreening = useCallback(
    async (screeningId: string) => {
      setVerifyingScreeningId(screeningId);
      setScreeningVerifyError(null);
      try {
        await apiFetchJson(`/api/v1/patient/screenings/${encodeURIComponent(screeningId)}/verify`, {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({}),
          onUnauthorized: handleSessionExpired,
        });
        await fetchAuditData();
      } catch (err) {
        if (err instanceof SessionExpiredError) return;
        setScreeningVerifyError(
          err instanceof Error ? err.message : `Failed to verify screening ${screeningId}.`
        );
      } finally {
        setVerifyingScreeningId(null);
      }
    },
    [getAuthHeaders, handleSessionExpired, fetchAuditData]
  );

  const handlePromoteUser = useCallback(
    async (userId: string, targetRole: 'doctor' | 'admin') => {
      setPromotingUserId(userId);
      setUserPromoteError(null);
      try {
        await apiFetchJson('/api/v1/auth/promote-user', {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ user_id: userId, target_role: targetRole }),
          onUnauthorized: handleSessionExpired,
        });
        await fetchAuditData();
      } catch (err) {
        if (err instanceof SessionExpiredError) return;
        setUserPromoteError(
          err instanceof Error ? err.message : `Failed to promote user ${userId}.`
        );
      } finally {
        setPromotingUserId(null);
      }
    },
    [getAuthHeaders, handleSessionExpired, fetchAuditData]
  );

  // ── 8. Strict Authentication Lifecycle Handlers ───────────────────────────
  const handleLoginSuccess = (authUser: AuthUser) => {
    const normalizedRole = String(authUser.role || 'patient').toLowerCase().trim() || 'patient';
    const normalizedAuthUser: AuthUser = { ...authUser, role: normalizedRole };
    setUser(normalizedAuthUser);
    setInitialResetToken('');
    setShowAuthModal(false);
    setStudioError(null);
    setSimulationError(null);
    try {
      localStorage.setItem('protocolshield_user', JSON.stringify(normalizedAuthUser));
    } catch {
      // ignore
    }

    if (normalizedRole === 'patient') {
      setPendingRoute(null);
      setViewMode('patient');
      window.location.hash = '#/patient';
    } else if (normalizedRole === 'admin') {
      setPendingRoute(null);
      setViewMode('admin');
      window.location.hash = '#/admin';
    } else if (pendingRoute && pendingRoute.view === 'studio') {
      const targetTab = pendingRoute.tab;
      setPendingRoute(null);
      setViewMode('studio');
      setActiveStudioTab(targetTab);
      window.location.hash = `#/studio?tab=${targetTab}`;
    } else {
      setPendingRoute(null);
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
    setBenchmarksDisclaimer(null);
    setBenchmarksError(null);
    setSimulationError(null);
    setStudioError(null);
    setAuditEvents([]);
    setAuditVerification(null);
    setAuditError(null);
    setPatientScreenings([]);
    setScreeningVerifyError(null);
    setVerifyingScreeningId(null);
    setPatientInterests([]);
    setAdminUsers([]);
    setPromotingUserId(null);
    setUserPromoteError(null);
    setAdminReadiness(null);
    setCohortStats(null);
    setAdminOpsError(null);
    try {
      localStorage.removeItem('protocolshield_user');
    } catch {
      // ignore
    }
    setViewMode('landing');
    window.location.hash = '#/';
    setPendingRoute(null);
    setAuthModalView('signin');
    setAuthPortalRole('patient');
    setShowAuthModal(true);
  };

  const handleOpenAuth = (
    defaultView: AuthModalView = 'signin',
    preferredRole?: PortalLoginRole
  ) => {
    setInitialResetToken('');
    setAuthModalView(defaultView);
    if (preferredRole) {
      setAuthPortalRole(preferredRole);
    } else if (user?.role === 'admin' || user?.role === 'doctor' || user?.role === 'patient') {
      setAuthPortalRole(user.role as PortalLoginRole);
    }
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
            onLaunchStudio={() =>
              navigateTo(
                user ? resolveRoleHomeView(user.role) : 'studio',
                'sandbox'
              )
            }
            user={user}
            onOpenAuth={() => handleOpenAuth('signin')}
            onSignOut={handleSignOut}
            onSwitchPersona={() => handleOpenAuth('signin')}
          />
        ) : user.role === 'patient' ? (
          <PatientPortal
            user={user}
            onSignOut={handleSignOut}
            onSwitchPersona={() => handleOpenAuth('signin', 'patient')}
            onOpenAuth={() => handleOpenAuth('signin', 'patient')}
            onSessionExpired={handleSessionExpired}
            onBackToLanding={() => navigateTo('landing')}
          />
        ) : user.role === 'admin' && viewMode === 'admin' ? (
          <AdminPortal
            user={user}
            auditEvents={auditEvents}
            auditLoading={auditLoading}
            auditError={auditError}
            auditVerification={auditVerification}
            patientScreenings={patientScreenings}
            verifyingScreeningId={verifyingScreeningId}
            screeningVerifyError={screeningVerifyError}
            onVerifyScreening={handleVerifyScreening}
            patientInterests={patientInterests}
            adminUsers={adminUsers}
            promotingUserId={promotingUserId}
            userPromoteError={userPromoteError}
            onPromoteUser={handlePromoteUser}
            readiness={adminReadiness}
            cohortStats={cohortStats}
            opsLoading={adminOpsLoading}
            opsError={adminOpsError}
            onRefreshAll={handleRefreshAdminAll}
            onSeedCohort={handleSeedCohort}
            onOpenStudioView={() => navigateTo('studio', activeStudioTab)}
            onBackToLanding={() => navigateTo('landing')}
            onOpenAuth={() => handleOpenAuth('signin', 'admin')}
            onSignOut={handleSignOut}
            onSwitchPersona={() => handleOpenAuth('signin', 'admin')}
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
            benchmarksDisclaimer={benchmarksDisclaimer}
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
            patientScreenings={patientScreenings}
            verifyingScreeningId={verifyingScreeningId}
            screeningVerifyError={screeningVerifyError}
            onVerifyScreening={handleVerifyScreening}
            patientInterests={patientInterests}
            adminUsers={adminUsers}
            promotingUserId={promotingUserId}
            userPromoteError={userPromoteError}
            onPromoteUser={handlePromoteUser}
            onBackToAdmin={user.role === 'admin' ? () => navigateTo('admin') : undefined}
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
            initialPortalRole={authPortalRole}
            initialResetToken={initialResetToken}
            onClose={() => {
              setShowAuthModal(false);
              setInitialResetToken('');
            }}
            onLoginSuccess={handleLoginSuccess}
          />
        )}
        {/* Floating Bottom-Right AI Agent Avatar (Welcome Greeting + Voice Mode) */}
        {user && (
          <FloatingAIAgent
            user={user}
            activeView={viewMode}
            activeProtocolTitle={protocol?.title ?? null}
            onSessionExpired={handleSessionExpired}
          />
        )}
      </Suspense>
    </>
  );
}
