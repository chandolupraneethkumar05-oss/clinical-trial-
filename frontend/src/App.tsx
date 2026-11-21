import { useState, useEffect } from 'react';
import { LandingPage } from './components/LandingPage';
import { StudioWorkspace } from './components/StudioWorkspace';
import { ProtocolUploadModal } from './components/ProtocolUploadModal';
import { AuthModal } from './components/AuthModal';
import type {
  ClinicalProtocol,
  FunnelSimulationResult,
  RetentionPoint,
  BenchmarkTrial
} from './types/protocol';
import type { AuthUser, AuthModalView } from './types/auth';

export default function App() {
  const [viewMode, setViewMode] = useState<'landing' | 'studio'>('landing');
  const [loading, setLoading] = useState<boolean>(true);
  const [protocol, setProtocol] = useState<ClinicalProtocol | null>(null);
  const [totalCohortSize, setTotalCohortSize] = useState<number>(10000);
  const [funnelData, setFunnelData] = useState<FunnelSimulationResult | null>(null);
  const [retentionCurve, setRetentionCurve] = useState<RetentionPoint[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkTrial[]>([]);
  
  // Modal states
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [authModalView, setAuthModalView] = useState<AuthModalView>('signin');

  // Authenticated user state with persistent storage
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = localStorage.getItem('protocolshield_user');
      return stored ? JSON.parse(stored) : {
        id: 'usr-demo-001',
        name: 'Dr. Elena Vance',
        email: 'elena.vance@novartis.com',
        role: 'VP Clinical Development & Operations',
        organization: 'Novartis Oncology',
        provider: 'email',
      };
    } catch {
      return null;
    }
  });

  // Initial Data Fetching from FastAPI Backend
  useEffect(() => {
    async function loadInitialData() {
      try {
        setLoading(true);

        // 1. Fetch Protocol Sample
        const protoRes = await fetch('/api/v1/protocol/sample');
        if (protoRes.ok) {
          const protoJson = await protoRes.json();
          setProtocol(protoJson);

          // 2. Fetch Initial Funnel
          const funnelRes = await fetch('/api/v1/cohort/simulate-funnel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(protoJson.eligibility.structured_filters || {})
          });
          if (funnelRes.ok) {
            const fJson = await funnelRes.json();
            setFunnelData(fJson);
            setTotalCohortSize(fJson.total_population || 10000);

            // 3. Fetch Initial Retention Curve
            const retRes = await fetch(
              `/api/v1/cohort/retention-curve?enrolled_size=${fJson.final_eligible_count}&composite_pbi=${protoJson.burden.composite_pbi_score}`
            );
            if (retRes.ok) {
              const rJson = await retRes.json();
              setRetentionCurve(rJson.retention_curve);
            }
          }
        }

        // 4. Fetch Benchmarks
        const benchRes = await fetch('/api/v1/benchmark/historical-trials');
        if (benchRes.ok) {
          const bJson = await benchRes.json();
          setBenchmarks(bJson.trials);
        }
      } catch (err) {
        console.warn('Backend not yet connected; using verified clinical fallback state', err);
      } finally {
        setLoading(false);
      }
    }

    loadInitialData();
  }, []);

  // Handlers for dynamic simulations
  const handleSimulateFunnel = async (criteria: Record<string, unknown>): Promise<FunnelSimulationResult> => {
    try {
      const res = await fetch('/api/v1/cohort/simulate-funnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const res = await fetch(`/api/v1/cohort/retention-curve?enrolled_size=${enrolled}&composite_pbi=${pbi}`);
      if (res.ok) {
        const json = await res.json();
        return json.retention_curve;
      }
    } catch (e) {
      console.error(e);
    }
    return retentionCurve;
  };

  // Handler: protocol loaded via upload modal or template switcher
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

  // Handler: 1-click built-in template switcher
  const handleSwitchTemplate = async (templateType: 'nsclc' | 'tnbc' | 'myeloma') => {
    try {
      const res = await fetch(`/api/v1/protocol/sample/${templateType}`);
      if (res.ok) {
        const protoJson = await res.json();
        await handleProtocolLoaded(protoJson);
      }
    } catch (err) {
      console.error('Failed to switch protocol template', err);
    }
  };

  // Handler: direct file upload
  const handleUploadFile = async (file: File) => {
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/v1/protocol/upload', {
        method: 'POST',
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

  // Auth Handlers
  const handleLoginSuccess = (authUser: AuthUser) => {
    setUser(authUser);
    setShowAuthModal(false);
    try {
      localStorage.setItem('protocolshield_user', JSON.stringify(authUser));
    } catch {
      // ignore
    }
  };

  const handleSignOut = () => {
    setUser(null);
    try {
      localStorage.removeItem('protocolshield_user');
    } catch {
      // ignore
    }
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
          onLaunchStudio={() => setViewMode('studio')}
          user={user}
          onOpenAuth={() => handleOpenAuth('signin')}
          onSignOut={handleSignOut}
          onSwitchPersona={() => handleOpenAuth('signin')}
        />
      ) : (
        loading || !protocol || !funnelData ? (
          <div className="min-h-screen bg-linen-100 flex items-center justify-center p-4">
            <div className="bg-white border border-linen-300 p-8 rounded-2xl shadow-sm text-center space-y-3 max-w-sm w-full">
              <div className="h-8 w-8 border-3 border-charcoal-900 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="font-serif text-sm font-bold text-charcoal-900 tracking-tight">Initializing ProtocolShield Studio...</p>
              <p className="text-xs text-charcoal-500 font-mono">Loading 10,000 Patient Cohort in DuckDB</p>
              <button
                onClick={() => setViewMode('landing')}
                className="text-xs text-terracotta-600 hover:underline pt-2 block mx-auto font-mono"
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
            onBackToLanding={() => setViewMode('landing')}
            onSimulateFunnel={handleSimulateFunnel}
            onCalculateRetention={handleCalculateRetention}
            onOpenUpload={() => setShowUploadModal(true)}
            onOpenAuth={() => handleOpenAuth('signin')}
            onSignOut={handleSignOut}
            onSwitchPersona={() => handleOpenAuth('signin')}
            onSwitchTemplate={handleSwitchTemplate}
            onUploadFile={handleUploadFile}
          />
        )
      )}

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
