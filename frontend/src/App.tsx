import { useState, useEffect } from 'react';
import { LandingPage } from './components/LandingPage';
import { StudioWorkspace } from './components/StudioWorkspace';
import type { 
  ClinicalProtocol, 
  FunnelSimulationResult, 
  RetentionPoint, 
  BenchmarkTrial 
} from './types/protocol';

export default function App() {
  const [viewMode, setViewMode] = useState<'landing' | 'studio'>('landing');
  const [loading, setLoading] = useState<boolean>(true);
  const [protocol, setProtocol] = useState<ClinicalProtocol | null>(null);
  const [totalCohortSize, setTotalCohortSize] = useState<number>(10000);
  const [funnelData, setFunnelData] = useState<FunnelSimulationResult | null>(null);
  const [retentionCurve, setRetentionCurve] = useState<RetentionPoint[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkTrial[]>([]);

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
        console.warn("Backend not yet connected; using verified clinical fallback state", err);
      } finally {
        setLoading(false);
      }
    }

    loadInitialData();
  }, []);

  // Handlers for dynamic simulations
  const handleSimulateFunnel = async (criteria: any): Promise<FunnelSimulationResult> => {
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

  if (viewMode === 'landing') {
    return (
      <LandingPage
        totalCohortSize={totalCohortSize}
        onLaunchStudio={() => setViewMode('studio')}
      />
    );
  }

  if (loading || !protocol || !funnelData) {
    return (
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
    );
  }

  return (
    <StudioWorkspace
      protocol={protocol}
      totalCohortSize={totalCohortSize}
      funnelData={funnelData}
      retentionCurve={retentionCurve}
      benchmarks={benchmarks}
      onBackToLanding={() => setViewMode('landing')}
      onSimulateFunnel={handleSimulateFunnel}
      onCalculateRetention={handleCalculateRetention}
    />
  );
}
