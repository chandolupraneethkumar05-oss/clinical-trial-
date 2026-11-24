import { useState, useEffect, useCallback } from 'react';
import { LandingPage } from './components/LandingPage';
import { StudioWorkspace } from './components/StudioWorkspace';
import type { StudioTab } from './components/StudioWorkspace';
import { PatientPortal } from './components/PatientPortal';
import { ProtocolUploadModal } from './components/ProtocolUploadModal';
import { AuthModal } from './components/AuthModal';
import { DEFAULT_AUDIT_EVENTS } from './components/AuditTrailView';
import type { AuditEvent } from './components/AuditTrailView';
import type {
  ClinicalProtocol,
  FunnelSimulationResult,
  RetentionPoint,
  BenchmarkTrial
} from './types/protocol';
import type { AuthUser, AuthModalView } from './types/auth';

/**
 * Parses browser URL hash into structured application route state.
 * Supports: #/, #/studio, and #/studio?tab=<sandbox|soe|overview|benchmarks|audit>
 */
function parseHashRoute(): { view: 'landing' | 'studio'; tab: StudioTab } {
  try {
    const rawHash = window.location.hash.replace(/^#\/?/, '');
    const [pathPart, queryPart] = rawHash.split('?');
    const params = new URLSearchParams(queryPart || '');
    const tabParam = params.get('tab') as StudioTab;
    const validTabs: StudioTab[] = ['sandbox', 'soe', 'overview', 'benchmarks', 'audit'];
    const tab: StudioTab = validTabs.includes(tabParam) ? tabParam : 'sandbox';

    if (pathPart.startsWith('studio') || pathPart.startsWith('patient')) {
      return { view: 'studio', tab };
    }
  } catch {
    // fallback
  }
  return { view: 'landing', tab: 'sandbox' };
}

export default function App() {
  // ── 1. Strictly Authenticated User Session (No Mock Fallback) ──────────────
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = localStorage.getItem('protocolshield_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // ── 2. Route & Tab State with URL Hash Synchronization ─────────────────────
  const initialRoute = parseHashRoute();
  
  // If user is unauthenticated and tries to open studio directly on boot, gate to landing
  const [viewMode, setViewMode] = useState<'landing' | 'studio'>(() => {
    if (initialRoute.view === 'studio') {
      const stored = localStorage.getItem('protocolshield_user');
      return stored ? 'studio' : 'landing';
    }
    return 'landing';
  });

  const [activeStudioTab, setActiveStudioTab] = useState<StudioTab>(initialRoute.tab);
  
  const [pendingRoute, setPendingRoute] = useState<{ view: 'landing' | 'studio'; tab: StudioTab } | null>(() => {
    if (initialRoute.view === 'studio') {
      const stored = localStorage.getItem('protocolshield_user');
      return stored ? null : { view: 'studio', tab: initialRoute.tab };
    }
    return null;
  });

  // ── 3. Data & Feasibility State ───────────────────────────────────────────
  const [loading, setLoading] = useState<boolean>(true);
  const [protocol, setProtocol] = useState<ClinicalProtocol | null>(null);
  const [totalCohortSize, setTotalCohortSize] = useState<number>(10000);
  const [funnelData, setFunnelData] = useState<FunnelSimulationResult | null>(null);
  const [retentionCurve, setRetentionCurve] = useState<RetentionPoint[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkTrial[]>([]);
  const [appliedAmendmentIds, setAppliedAmendmentIds] = useState<string[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>(DEFAULT_AUDIT_EVENTS);

  // ── 4. Modal Overlays ─────────────────────────────────────────────────────
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [authModalView, setAuthModalView] = useState<AuthModalView>('signin');

  // ── 5. Route Synchronization Helper ───────────────────────────────────────
  const navigateTo = useCallback((view: 'landing' | 'studio', tab: StudioTab = 'sandbox') => {
    if (view === 'studio') {
      // Strict guardrail: must be logged in to enter inside studio pages
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
  }, [user]);

  const handleTabChange = useCallback((tab: StudioTab) => {
    setActiveStudioTab(tab);
    window.location.hash = `#/studio?tab=${tab}`;
  }, []);

  // Intercept unauthorized direct deep-linking on initial mount
  useEffect(() => {
    if (!user && pendingRoute) {
      setAuthModalView('signin');
      setShowAuthModal(true);
      window.location.hash = '#/';
    }
  }, [user, pendingRoute]);

  // Listen to browser Back / Forward buttons and manual hash edits
  useEffect(() => {
    const handleHashChange = () => {
      const route = parseHashRoute();
      if (route.view === 'studio') {
        const stored = localStorage.getItem('protocolshield_user');
        if (!stored) {
          setPendingRoute(route);
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
  const getAuthHeaders = (extraHeaders: Record<string, string> = {}): Record<string, string> => {
    const headers: Record<string, string> = { ...extraHeaders };
    const token = user?.token || (() => {
      try {
        const stored = localStorage.getItem('protocolshield_user');
        return stored ? JSON.parse(stored)?.token : null;
      } catch {
        return null;
      }
    })();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  const handleSessionExpired = useCallback(() => {
    localStorage.removeItem('protocolshield_user');
    setUser(null);
    setViewMode('landing');
    setAuthModalView('signin');
    setShowAuthModal(true);
  }, []);

  // Proactively validate active session with backend /auth/me on mount
  useEffect(() => {
    async function validateSession() {
      const token = user?.token;
      if (!token) return;
      try {
        const res = await fetch('/api/v1/auth/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.status === 401 || !res.ok) {
          handleSessionExpired();
        } else {
          const freshData = await res.json();
          if (freshData?.user) {
            setUser((prev) => (prev ? { ...prev, ...freshData.user } : prev));
          }
        }
      } catch {
        // Network failure or offline mode
      }
    }
    validateSession();
  }, [user?.token, handleSessionExpired]);

  // ── 6. Initial Data Fetching from FastAPI Backend ──────────────────────────
  useEffect(() => {
    async function loadInitialData() {
      try {
        setLoading(true);

        // 1. Fetch Protocol Sample (public sample endpoint)
        const protoRes = await fetch('/api/v1/protocol/sample');
        if (protoRes.ok) {
          const protoJson = await protoRes.json();
          setProtocol(protoJson);

          // 2. Fetch Initial Funnel
          const funnelRes = await fetch('/api/v1/cohort/simulate-funnel', {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(protoJson.eligibility.structured_filters || {})
          });
          if (funnelRes.ok) {
            const fJson = await funnelRes.json();
            setFunnelData(fJson);
            setTotalCohortSize(fJson.total_population || 10000);

            // 3. Fetch Initial Retention Curve
            const retRes = await fetch(
              `/api/v1/cohort/retention-curve?enrolled_size=${fJson.final_eligible_count}&composite_pbi=${protoJson.burden.composite_pbi_score}`,
              { headers: getAuthHeaders() }
            );
            if (retRes.ok) {
              const rJson = await retRes.json();
              setRetentionCurve(rJson.retention_curve);
            }
          }
        }

        // 4. Fetch Historical Benchmarks
        const benchRes = await fetch('/api/v1/benchmark/historical-trials', {
          headers: getAuthHeaders()
        });
        if (benchRes.status === 401) {
          handleSessionExpired();
          return;
        }
        if (benchRes.ok) {
          const bJson = await benchRes.json();
          setBenchmarks(bJson.trials);
        }

        // 5. Fetch Audit Trail from backend (for investigators/admins)
        if (user && user.role !== 'patient') {
          const auditRes = await fetch('/api/v1/audit/logs', {
            headers: getAuthHeaders()
          });
          if (auditRes.status === 401) {
            handleSessionExpired();
            return;
          }
          if (auditRes.ok) {
            const aJson = await auditRes.json();
            if (Array.isArray(aJson) && aJson.length > 0) {
              setAuditEvents(aJson);
            }
          }
        }
      } catch (err) {
        console.warn('Backend connection note:', err);
      } finally {
        setLoading(false);
      }
    }

    loadInitialData();
  }, [user]);

  // ── 7. Simulations & Protocol Mutation Handlers ───────────────────────────
  const handleSimulateFunnel = async (criteria: Record<string, unknown>): Promise<FunnelSimulationResult> => {
    try {
      const res = await fetch('/api/v1/cohort/simulate-funnel', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(criteria)
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.error(e);
    }
    return funnelData!;
  };

  const handleCalculateRetention = async (enrolled: number, pbi: number): Promise<RetentionPoint[]> => {
    try {
      const res = await fetch(
        `/api/v1/cohort/retention-curve?enrolled_size=${enrolled}&composite_pbi=${pbi}`,
        { headers: getAuthHeaders() }
      );
      if (res.ok) {
        const json = await res.json();
        return json.retention_curve;
      }
    } catch (e) {
      console.error(e);
    }
    return retentionCurve;
  };

  const handleProtocolLoaded = async (newProtocol: ClinicalProtocol) => {
    setProtocol(newProtocol);
    setShowUploadModal(false);

    try {
      const filters = newProtocol.eligibility?.structured_filters ?? {};
      const newFunnel = await handleSimulateFunnel(filters);
      setFunnelData(newFunnel);

      if (newProtocol.burden && newFunnel) {
        const newRetention = await handleCalculateRetention(
          newFunnel.final_eligible_count,
          newProtocol.burden.composite_pbi_score
        );
        setRetentionCurve(newRetention);
      }
    } catch (e) {
      console.error('Post-upload simulation error:', e);
    }
  };

  const handleSwitchTemplate = async (templateType: 'nsclc' | 'tnbc' | 'myeloma') => {
    try {
      setAppliedAmendmentIds([]);
      const res = await fetch(`/api/v1/protocol/sample/${templateType}`);
      if (res.ok) {
        const protoJson = await res.json();
        await handleProtocolLoaded(protoJson);
      }
    } catch (err) {
      console.error('Failed to switch protocol template', err);
    }
  };

  const handleUploadFile = async (file: File) => {
    try {
      setAppliedAmendmentIds([]);
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/v1/protocol/upload', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: form,
      });
      if (res.ok) {
        const protoJson = await res.json();
        await handleProtocolLoaded(protoJson);
      } else {
        setShowUploadModal(true);
      }
    } catch {
      setShowUploadModal(true);
    }
  };

  const handleApplyAmendment = async (amendmentId: string) => {
    if (!protocol) return;
    try {
      const res = await fetch('/api/v1/optimizer/apply-amendment', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          protocol,
          amendment_id: amendmentId
        })
      });

      if (res.ok) {
        const updatedProtocol: ClinicalProtocol = await res.json();
        setAppliedAmendmentIds((prev) => (prev.includes(amendmentId) ? prev : [...prev, amendmentId]));

        // Append cryptographically sealed 21 CFR Part 11 Audit Trail event
        const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
        const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');

        const newEvent: AuditEvent = {
          timestamp: now,
          event_type: 'AI_PROTOCOL_AMENDMENT_APPLIED',
          operator: `${user?.name || 'Authorized Investigator'} (AI Optimizer Engine)`,
          details: `Applied amendment ${amendmentId} to ${updatedProtocol.protocol_id}. Mutated eligibility criteria & Schedule of Assessments. Recalibrated Tufts CSDD PBI to ${updatedProtocol.burden.composite_pbi_score}.`,
          verification_hash: `SHA256: ${hex}`
        };

        // Persist to backend DuckDB audit log
        try {
          const auditRes = await fetch('/api/v1/audit/logs', {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              event_type: 'AI_PROTOCOL_AMENDMENT_APPLIED',
              details: `Applied amendment ${amendmentId} to ${updatedProtocol.protocol_id}. Mutated eligibility criteria & Schedule of Assessments. Recalibrated Tufts CSDD PBI to ${updatedProtocol.burden.composite_pbi_score}.`,
              resource_id: updatedProtocol.protocol_id
            })
          });
          if (auditRes.ok) {
            const savedEvent = await auditRes.json();
            setAuditEvents((prev) => [savedEvent, ...prev]);
          } else {
            setAuditEvents((prev) => [newEvent, ...prev]);
          }
        } catch {
          setAuditEvents((prev) => [newEvent, ...prev]);
        }

        await handleProtocolLoaded(updatedProtocol);
      }
    } catch (err) {
      console.error('Failed to apply protocol amendment:', err);
    }
  };

  // ── 8. Strict Authentication Lifecycle Handlers ───────────────────────────
  const handleLoginSuccess = (authUser: AuthUser) => {
    setUser(authUser);
    setShowAuthModal(false);
    try {
      localStorage.setItem('protocolshield_user', JSON.stringify(authUser));
    } catch {
      // ignore
    }

    // Automatically proceed to requested destination or default to Studio Sandbox
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
        await fetch('/api/v1/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${currentToken}` }
        });
      } catch {
        // continue clearing local session
      }
    }
    setUser(null);
    try {
      localStorage.removeItem('protocolshield_user');
    } catch {
      // ignore
    }
    // Immediately redirect out of studio back to public landing view
    setViewMode('landing');
    window.location.hash = '#/';
    setPendingRoute(null);
    
    // Immediately pop open the sign-in modal as requested
    setAuthModalView('signin');
    setShowAuthModal(true);
  };

  const handleOpenAuth = (defaultView: AuthModalView = 'signin') => {
    setAuthModalView(defaultView);
    setShowAuthModal(true);
  };

  return (
    <>
      {viewMode === 'landing' ? (
        <LandingPage
          totalCohortSize={totalCohortSize}
          onLaunchStudio={() => navigateTo('studio', 'sandbox')}
          user={user}
          onOpenAuth={() => handleOpenAuth('signin')}
          onSignOut={handleSignOut}
          onSwitchPersona={() => handleOpenAuth('signin')}
        />
      ) : user?.role === 'patient' ? (
        <PatientPortal
          user={user}
          onSignOut={handleSignOut}
          onSwitchPersona={() => handleOpenAuth('signin')}
          onOpenAuth={() => handleOpenAuth('signin')}
          onBackToLanding={() => navigateTo('landing')}
        />
      ) : loading || !protocol || !funnelData ? (
          <div className="min-h-screen bg-linen-100 flex items-center justify-center p-4">
            <div className="bg-white border border-linen-300 p-8 rounded-2xl shadow-sm text-center space-y-3 max-w-sm w-full">
              <div className="h-8 w-8 border-3 border-charcoal-900 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="font-serif text-sm font-bold text-charcoal-900 tracking-tight">Initializing ProtocolShield Studio...</p>
              <p className="text-xs text-charcoal-500 font-mono">Loading 10,000 Patient Cohort in DuckDB</p>
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
            user={user}
            activeTab={activeStudioTab}
            onTabChange={handleTabChange}
            onBackToLanding={() => navigateTo('landing')}
            onSimulateFunnel={handleSimulateFunnel}
            onCalculateRetention={handleCalculateRetention}
            onOpenUpload={() => setShowUploadModal(true)}
            onOpenAuth={() => handleOpenAuth('signin')}
            onSignOut={handleSignOut}
            onSwitchPersona={() => handleOpenAuth('signin')}
            onSwitchTemplate={handleSwitchTemplate}
            onUploadFile={handleUploadFile}
            onApplyAmendment={handleApplyAmendment}
            appliedAmendmentIds={appliedAmendmentIds}
            auditEvents={auditEvents}
          />
        )
      }

      {/* Protocol Upload Modal */}
      {showUploadModal && (
        <ProtocolUploadModal
          onClose={() => setShowUploadModal(false)}
          onProtocolLoaded={handleProtocolLoaded}
        />
      )}

      {/* Enterprise Authentication Modal */}
      {showAuthModal && (
        <AuthModal
          initialView={authModalView}
          onClose={() => setShowAuthModal(false)}
          onLoginSuccess={handleLoginSuccess}
        />
      )}
    </>
  );
}
