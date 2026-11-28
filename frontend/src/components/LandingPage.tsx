import { useState, useEffect, useCallback } from 'react';
import type { FC } from 'react';
import type { AuthUser } from '../types/auth';
import type { PublicOverviewResponse } from '../types/overview';
import { apiFetchJson } from '../lib/api';
import { UserMenu } from './UserMenu';
import { KineticSculptureCanvas } from './KineticSculptureCanvas';
import { 
  ArrowRight, 
  ShieldCheck, 
  Play, 
  Pause,
  Award, 
  X,
  FileCheck,
  Sparkles,
  Lock,
  Upload,
  Sliders,
  UserCheck,
  CheckCircle2,
  ExternalLink,
  Activity,
  Layers,
  FlaskConical,
  Zap,
  Dna
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  ReferenceLine 
} from 'recharts';

interface LandingPageProps {
  onLaunchStudio: () => void;
  totalCohortSize?: number;
  user?: AuthUser | null;
  onOpenAuth?: () => void;
  onSignOut?: () => void;
  onSwitchPersona?: () => void;
}

export const LandingPage: FC<LandingPageProps> = ({ 
  onLaunchStudio,
  user = null,
  onOpenAuth = () => {},
  onSignOut = () => {},
  onSwitchPersona = () => {}
}) => {
  // Scroll position state for adaptive fixed header and parallax effects
  const [scrollY, setScrollY] = useState<number>(0);

  // Scenario simulation state for the live retention chart
  const [activeScenario, setActiveScenario] = useState<'baseline' | 'scenarioA' | 'scenarioB'>('baseline');

  // Interactive document clause inspector state
  const [selectedClause, setSelectedClause] = useState<'egfr' | 'ecog' | 'biopsy'>('egfr');

  // Interactive telehealth slider for Schedule of Assessments
  const [telehealthPct, setTelehealthPct] = useState<number>(30);

  // Interactive Visual Tour & Testing Walkthrough state
  const [isTourOpen, setIsTourOpen] = useState<boolean>(false);
  const [tourStep, setTourStep] = useState<number>(1); // 1: Ingest PDF, 2: Studio & Heatmap, 3: What-If Console, 4: Patient Portal
  const [tourAutoPlay, setTourAutoPlay] = useState<boolean>(true);
  const [tourProgress, setTourProgress] = useState<number>(0); // 0 to 100%

  // Auto-advance visual tour effect when modal is active
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isTourOpen && tourAutoPlay) {
      interval = setInterval(() => {
        setTourProgress((prev) => {
          if (prev >= 100) {
            setTourStep((s) => (s >= 4 ? 1 : s + 1));
            return 0;
          }
          return prev + 1.25; // ~8 seconds per step
        });
      }, 100);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTourOpen, tourAutoPlay]);

  const handleOpenTour = (step = 1) => {
    setTourStep(step);
    setTourProgress(0);
    setTourAutoPlay(true);
    setIsTourOpen(true);
  };

  // Active Case Study tab state (maps cleanly to live backend protocols)
  const [activeCaseStudy, setActiveCaseStudy] = useState<'nsclc' | 'breast' | 'myeloma'>('nsclc');

  // Live public overview telemetry from DuckDB & mathematical scoring engines
  const [overview, setOverview] = useState<PublicOverviewResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState<boolean>(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [overviewReloadNonce, setOverviewReloadNonce] = useState<number>(0);

  const handleRetryOverview = useCallback(() => {
    setOverviewLoading(true);
    setOverviewError(null);
    setOverviewReloadNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchOverview() {
      try {
        const data = await apiFetchJson<PublicOverviewResponse>('/api/v1/system/public-overview', {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setOverview(data);
        setOverviewError(null);
      } catch (err: unknown) {
        if ((err as Error)?.name === 'AbortError' || controller.signal.aborted) return;
        setOverview(null);
        setOverviewError(
          err instanceof Error ? err.message : 'Unable to reach live backend overview telemetry.'
        );
      } finally {
        if (!controller.signal.aborted) {
          setOverviewLoading(false);
        }
      }
    }

    fetchOverview();
    return () => controller.abort();
  }, [overviewReloadNonce]);

  // Scroll tracking effect
  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isLightHeader = scrollY > 580;

  const cohortCount = overview?.cohort_patient_count ?? null;
  const cohortLabel = cohortCount != null ? cohortCount.toLocaleString() : '—';
  const baselineNsclc = overview?.baseline_nsclc ?? null;
  const scenarios = overview?.simulation_scenarios ?? null;
  const activeData = scenarios ? scenarios[activeScenario] : null;
  const activeStudy = overview?.case_studies ? overview.case_studies[activeCaseStudy] : null;

  return (
    <div className="relative min-h-screen bg-charcoal-950 text-charcoal-900 font-sans selection:bg-terracotta-100 selection:text-terracotta-700 antialiased">
      
      {/* ─────────────────────────────────────────────────────────────
          GLOBAL FIXED TOP NAVIGATION (Always pinned at top, adapts theme)
         ───────────────────────────────────────────────────────────── */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isLightHeader 
          ? 'bg-linen-100/90 backdrop-blur-md border-b border-linen-300 text-charcoal-900 shadow-xs' 
          : 'bg-charcoal-950/75 backdrop-blur-md border-b border-white/10 text-white'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="h-10 w-10 rounded-xl bg-terracotta-600 flex items-center justify-center text-white shadow-md ring-1 ring-white/20">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="flex items-baseline space-x-1.5">
              <span className={`font-serif text-2xl font-bold tracking-tight transition-colors ${
                isLightHeader ? 'text-charcoal-900' : 'text-white'
              }`}>
                ProtocolShield
              </span>
              <span className="h-2 w-2 rounded-full bg-terracotta-500" />
            </div>
          </div>

          {/* Nav Menu */}
          <nav className={`hidden md:flex items-center space-x-8 text-xs font-medium transition-colors ${
            isLightHeader ? 'text-charcoal-600' : 'text-slate-300'
          }`}>
            <a href="#paradox" className={isLightHeader ? 'hover:text-charcoal-900' : 'hover:text-white'}>The Paradox</a>
            <a href="#simulator" className={isLightHeader ? 'hover:text-charcoal-900' : 'hover:text-white'}>Survival Engine</a>
            <a href="#platform" className={isLightHeader ? 'hover:text-charcoal-900' : 'hover:text-white'}>Platform</a>
            <a href="#architecture" className={isLightHeader ? 'hover:text-charcoal-900' : 'hover:text-white'}>3D Architecture</a>
            <a href="#case-studies" className={isLightHeader ? 'hover:text-charcoal-900' : 'hover:text-white'}>Case Studies</a>
            <a href="#evidence" className={isLightHeader ? 'hover:text-charcoal-900' : 'hover:text-white'}>Foundations</a>
          </nav>

          {/* Actions */}
          <div className="flex items-center space-x-3">
            <UserMenu
              user={user}
              onOpenAuth={onOpenAuth}
              onSignOut={onSignOut}
              onSwitchPersona={onSwitchPersona}
            />

            <button
              onClick={onLaunchStudio}
              className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-full text-xs font-semibold bg-terracotta-600 hover:bg-terracotta-500 text-white shadow-lg shadow-terracotta-900/30 transition-all duration-200 hover:scale-[1.02] border border-terracotta-500/80 cursor-pointer"
            >
              <span>Launch Studio</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>


      {/* ─────────────────────────────────────────────────────────────
          CARD 1: HERO SECTION (Clean non-overlapping flow layout, z-0)
         ───────────────────────────────────────────────────────────── */}
      <section className="relative min-h-[min(100vh,860px)] w-full flex flex-col justify-between overflow-x-hidden z-0 bg-charcoal-950 text-white">
        
        {/* Background Photo with Parallax Fade & Gradient Overlay */}
        <div 
          className="absolute inset-0 z-0 pointer-events-none transition-transform duration-75"
          style={{
            transform: `scale(${Math.max(0.94, 1 - scrollY * 0.00012)})`,
            opacity: Math.max(0.35, 1 - scrollY / 850)
          }}
        >
          <img
            src="https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=2000&q=85"
            alt="Clinical Investigator in Medical Research Setting"
            className="w-full h-full object-cover object-center opacity-30 mix-blend-luminosity"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-charcoal-950 via-charcoal-950/75 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-charcoal-950 via-charcoal-950/85 to-transparent" />
        </div>

        {/* Hero Headline & Interactive Floating Glass Preview Card */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-12 flex-1 flex flex-col justify-center">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-end">
            
            {/* Left Headline Area */}
            <div className="lg:col-span-8 space-y-6">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-xs text-slate-200 backdrop-blur-xs">
                <span className="h-2 w-2 rounded-full bg-terracotta-500 animate-pulse" />
                <span className="font-mono text-[11px] tracking-wider uppercase font-semibold text-white">
                  Clinical Trial Feasibility & Recruitment Simulator
                </span>
              </div>

              <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl font-normal tracking-tight text-white leading-[1.06]">
                Check whether your trial plan is practical <br />
                <span className="italic font-light text-slate-300">before enrolling the first patient.</span>
              </h1>

              <p className="text-sm sm:text-base text-slate-300 max-w-2xl leading-relaxed font-normal">
                Test study protocols against{' '}
                <strong className="text-white font-semibold">
                  {cohortCount != null ? `${cohortLabel} synthetic patient records` : 'live DuckDB synthetic patient records'}
                </strong>
                . Find recruitment bottlenecks, avoid unnecessary patient burden, and reduce trial delays.
              </p>

              {/* Glanceable Capability Chips */}
              <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-[11px] text-slate-300">
                <span className="px-2.5 py-1 rounded-lg bg-white/10 border border-white/15 backdrop-blur-xs flex items-center space-x-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-terracotta-400" />
                  <span>{cohortCount != null ? `${cohortLabel} Synthetic Cohort (Live DB)` : 'Synthetic Cohort (Live DB)'}</span>
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-white/10 border border-white/15 backdrop-blur-xs flex items-center space-x-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span>Fast In-Memory Analysis (DuckDB)</span>
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-white/10 border border-white/15 backdrop-blur-xs flex items-center space-x-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  <span>Tufts CSDD Burden Framework</span>
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-white/10 border border-white/15 backdrop-blur-xs flex items-center space-x-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                  <span>Tamper-Evident SHA-256 Audit Log</span>
                </span>
              </div>

              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  onClick={onLaunchStudio}
                  className="inline-flex items-center space-x-2 px-7 py-3.5 rounded-full text-sm font-semibold bg-terracotta-600 hover:bg-terracotta-500 text-white shadow-xl shadow-terracotta-950/40 transition-all duration-200 hover:scale-[1.02] cursor-pointer"
                >
                  <span>Launch Feasibility Studio</span>
                  <ArrowRight className="h-4 w-4" />
                </button>

                <button
                  onClick={() => handleOpenTour(1)}
                  className="inline-flex items-center space-x-2 px-5 py-3.5 rounded-full text-sm font-medium bg-white/10 hover:bg-white/15 text-white border border-white/20 backdrop-blur-xs transition-colors cursor-pointer group"
                >
                  <div className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Play className="h-2.5 w-2.5 fill-current ml-0.5 text-white" />
                  </div>
                  <span>Visual Tour & Testing Guide</span>
                </button>
              </div>
            </div>

            {/* Right: Floating Glass Preview Card */}
            <div className="lg:col-span-4 flex justify-end">
              <div 
                onClick={() => handleOpenTour(1)}
                className="bg-charcoal-900/90 backdrop-blur-md border border-white/15 rounded-3xl p-4.5 max-w-xs sm:max-w-sm shadow-2xl space-y-3.5 cursor-pointer hover:border-terracotta-400/50 hover:scale-[1.02] transition-all duration-300 group"
              >
                <div className="relative rounded-2xl overflow-hidden aspect-video bg-charcoal-950 flex items-center justify-center">
                  <img
                    src="https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=800&q=80"
                    alt="Clinical Consultation"
                    className="w-full h-full object-cover opacity-70 group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-12 w-12 rounded-full bg-white/95 text-charcoal-900 flex items-center justify-center shadow-xl group-hover:scale-110 group-hover:bg-terracotta-600 group-hover:text-white transition-all duration-200">
                      <Play className="h-4 w-4 fill-current ml-0.5" />
                    </div>
                  </div>
                  
                  <div className="absolute top-2.5 left-2.5 flex items-center space-x-1.5 bg-black/60 backdrop-blur-xs text-[10px] font-mono text-white px-2 py-0.5 rounded-full border border-white/10">
                    <span className="h-1.5 w-1.5 rounded-full bg-terracotta-500 animate-pulse" />
                    <span>VISUAL TESTING GUIDE</span>
                  </div>

                  <span className="absolute bottom-2.5 right-2.5 text-[10px] font-mono bg-black/70 text-white px-2 py-0.5 rounded-md">
                    PAGE WALKTHROUGH
                  </span>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-terracotta-300">
                    <span>STEP-BY-STEP TEST GUIDE</span>
                    <span>4 KEY WORKFLOWS</span>
                  </div>
                  <h4 className="font-serif font-bold text-sm text-white mt-1 leading-snug group-hover:text-terracotta-200 transition-colors">
                    How to Ingest Protocols & Test This Platform
                  </h4>
                  <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                    Visual guide through PDF ingestion, patient burden heatmap scoring, What-If sensitivity, and patient eligibility screening.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Sponsor & Cancer Center Banner Strip */}
        <div className="relative z-10 border-t border-white/10 bg-charcoal-950/90 py-4.5 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
            <div>
              <span className="text-[10px] font-mono tracking-wider uppercase text-slate-400 font-semibold block">
                Eligibility patterns inspired by public protocols from oncology leaders:
              </span>
              <span className="text-[10px] font-sans text-slate-400 italic">
                (Independent synthetic research benchmarks — not an endorsement or formal affiliation)
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-5 text-[11px] font-mono font-medium text-slate-300">
              <span className="hover:text-white transition-colors">MAYO CLINIC</span>
              <span className="hover:text-white transition-colors">MEMORIAL SLOAN KETTERING</span>
              <span className="hover:text-white transition-colors">MD ANDERSON</span>
              <span className="hover:text-white transition-colors">DANA-FARBER</span>
              <span className="hover:text-white transition-colors">JOHNS HOPKINS</span>
            </div>
          </div>
        </div>
      </section>


      {/* ─────────────────────────────────────────────────────────────
          SHEET 1: THE PARADOX & SURVIVAL ENGINE (Slides UP over the Hero like a page, z-10)
         ───────────────────────────────────────────────────────────── */}
      <div className="relative z-10 bg-linen-100 rounded-t-[36px] sm:rounded-t-[52px] shadow-[0_-25px_60px_rgba(0,0,0,0.45)] border-t border-linen-300/80">
        
        {/* Subtle Visual Top Sheet Handle */}
        <div className="pt-4 pb-1">
          <div className="w-12 h-1 bg-linen-300 rounded-full mx-auto" />
        </div>

        {/* 2. IMPACT SECTION (Matching the 4-Card Editorial Horizontal Row) */}
        <section id="paradox" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="max-w-3xl mb-14 space-y-2.5">
            <span className="text-xs font-mono font-bold uppercase tracking-widest text-terracotta-600 block">
              WHY TRIAL PROTOCOLS FAIL
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-charcoal-900 font-normal leading-tight">
              Recruitment challenges frequently delay clinical trial timelines.
            </h2>
            <p className="text-sm sm:text-base text-charcoal-600 font-normal leading-relaxed pt-1">
              Over-complicated study protocols create heavy patient burdens and strict exclusion gates, leading to months of trial delays (Tufts CSDD benchmark).
            </p>
          </div>

          {/* 4 Clean Editorial Cards with Hover Lift */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            
            <div className="bg-white rounded-3xl border border-linen-300 p-6 shadow-xs flex flex-col justify-between hover:shadow-lg hover:-translate-y-1 hover:border-terracotta-300 transition-all duration-300">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-400 block mb-2">
                  01 • STRICT SCREENING
                </span>
                <h3 className="font-serif font-bold text-lg text-charcoal-900 leading-snug">
                  Narrow Exclusion Gates
                </h3>
                <p className="text-xs text-charcoal-600 mt-2.5 leading-relaxed">
                  In typical oncology trials, rigid kidney (eGFR &lt; 60) and liver cutoffs filter out otherwise viable candidates (Illustrative simulation — synthetic data).
                </p>
                <div className="mt-3">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                    High Screen Failure
                  </span>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-linen-200 flex items-center justify-between text-[11px] font-mono text-terracotta-600 font-semibold">
                <span>
                  {baselineNsclc
                    ? `${baselineNsclc.screen_failure_rate}% Screen Failure (NSCLC Baseline)`
                    : 'Simulated Screen Failure'}
                </span>
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-linen-300 p-6 shadow-xs flex flex-col justify-between hover:shadow-lg hover:-translate-y-1 hover:border-terracotta-300 transition-all duration-300">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-400 block mb-2">
                  02 • TRAVEL AND DISTANCE
                </span>
                <h3 className="font-serif font-bold text-lg text-charcoal-900 leading-snug">
                  {overview ? `${overview.cohort_averages.distance_miles} Miles Avg Travel` : 'Geographic Travel Barrier'}
                </h3>
                <p className="text-xs text-charcoal-600 mt-2.5 leading-relaxed">
                  Mean distance to oncology trial centers across the loaded cohort drives missed appointments and early discontinuation.
                </p>
                <div className="mt-3">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                    Geographic Distance Barrier
                  </span>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-linen-200 flex items-center justify-between text-[11px] font-mono text-terracotta-600 font-semibold">
                <span>Live DuckDB Cohort Average</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-linen-300 p-6 shadow-xs flex flex-col justify-between hover:shadow-lg hover:-translate-y-1 hover:border-terracotta-300 transition-all duration-300">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-400 block mb-2">
                  03 • LONG CLINIC VISITS
                </span>
                <h3 className="font-serif font-bold text-lg text-charcoal-900 leading-snug">
                  {baselineNsclc ? `${baselineNsclc.avg_visit_hours} Hours Avg Visit` : 'High Clinic Dwell'}
                </h3>
                <p className="text-xs text-charcoal-600 mt-2.5 leading-relaxed">
                  Stacking IV infusions, contrast CTs, and biopsies onto single visits creates high patient fatigue ({baselineNsclc ? `${baselineNsclc.total_clinic_hours}h total across ${baselineNsclc.total_visits} visits` : 'measured per protocol'}).
                </p>
                <div className="mt-3">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-terracotta-50 text-terracotta-700 border border-terracotta-200">
                    Patient Fatigue Spike
                  </span>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-linen-200 flex items-center justify-between text-[11px] font-mono text-terracotta-600 font-semibold">
                <span>Computed SoA Dwell Burden</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-linen-300 p-6 shadow-xs flex flex-col justify-between hover:shadow-lg hover:-translate-y-1 hover:border-terracotta-300 transition-all duration-300">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-400 block mb-2">
                  04 • PROTOCOL BURDEN INDEX
                </span>
                <h3 className="font-serif font-bold text-lg text-charcoal-900 leading-snug">
                  {baselineNsclc ? `${baselineNsclc.composite_pbi_score} / 100 PBI Score` : 'Tufts CSDD PBI Model'}
                </h3>
                <p className="text-xs text-charcoal-600 mt-2.5 leading-relaxed">
                  Composite Patient Burden Index combines temporal dwell, procedure invasiveness, and fasting/visit cadence without guessing financial cost.
                </p>
                <div className="mt-3">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sage-50 text-sage-800 border border-sage-200">
                    {baselineNsclc ? `${baselineNsclc.attrition_risk_tier} Attrition Tier` : 'Deterministic Risk Tier'}
                  </span>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-linen-200 flex items-center justify-between text-[11px] font-mono text-terracotta-600 font-semibold">
                <span>Sponsor Burn Configurable in Optimizer</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </div>

          </div>
        </section>


        {/* 3. INTERACTIVE SURVIVAL ENGINE & SCENARIO SWITCHER */}
        <section id="simulator" className="py-20 bg-white border-y border-linen-300">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              
              {/* Left Narrative with Live Scenario Toggles */}
              <div className="lg:col-span-5 space-y-6">
                <span className="text-xs font-mono font-bold uppercase tracking-widest text-terracotta-600 block">
                  PATIENT RETENTION SIMULATOR
                </span>
                <h2 className="font-serif text-3xl sm:text-4xl text-charcoal-900 font-normal leading-tight">
                  Restoring feasibility to clinical protocol design.
                </h2>
                <p className="text-sm text-charcoal-700 leading-relaxed font-normal">
                  When clinical trials demand excessive clinic visits, frequent scans, and painful repeat biopsies, participants drop out. ProtocolShield models patient fatigue decay curves using the established <strong className="text-charcoal-900 font-semibold">Tufts Center for the Study of Drug Development (CSDD)</strong> complexity framework.
                </p>

                {/* Interactive Scenario Selection Buttons */}
                <div className="space-y-2.5 pt-2">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-charcoal-500 font-semibold block">
                    Select Protocol Scenario to Simulate:
                  </span>
                  
                  <button
                    onClick={() => setActiveScenario('baseline')}
                    className={`w-full text-left p-3.5 rounded-2xl border transition-all duration-200 flex items-center justify-between cursor-pointer ${
                      activeScenario === 'baseline'
                        ? 'border-terracotta-500 bg-terracotta-50/60 shadow-xs'
                        : 'border-linen-300 bg-white hover:bg-linen-50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="h-2 w-2 rounded-full bg-terracotta-600" />
                        <span className="font-serif font-bold text-xs text-charcoal-900">
                          1. Baseline Phase III Protocol
                        </span>
                      </div>
                      <p className="text-[11px] text-charcoal-500 mt-1 pl-4">
                        {scenarios?.baseline.description ?? 'eGFR < 60 mL/min • Baseline Visits & Biopsy Schedule'}
                      </p>
                    </div>
                    <span className="text-xs font-mono font-bold text-terracotta-700">
                      {scenarios ? `${scenarios.baseline.retentionAt52}% Retained` : '…'}
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveScenario('scenarioA')}
                    className={`w-full text-left p-3.5 rounded-2xl border transition-all duration-200 flex items-center justify-between cursor-pointer ${
                      activeScenario === 'scenarioA'
                        ? 'border-amber-500 bg-amber-50/60 shadow-xs'
                        : 'border-linen-300 bg-white hover:bg-linen-50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="h-2 w-2 rounded-full bg-amber-600" />
                        <span className="font-serif font-bold text-xs text-charcoal-900">
                          2. Scenario A: Relaxed eGFR Cutoff
                        </span>
                      </div>
                      <p className="text-[11px] text-charcoal-500 mt-1 pl-4">
                        {scenarios?.scenarioA.description ?? 'Relaxes renal eligibility cutoff against DuckDB cohort'}
                      </p>
                    </div>
                    <span className="text-xs font-mono font-bold text-amber-700">
                      {scenarios ? `${scenarios.scenarioA.retentionAt52}% Retained (+${scenarios.scenarioA.patientsGained} Elig.)` : '…'}
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveScenario('scenarioB')}
                    className={`w-full text-left p-3.5 rounded-2xl border transition-all duration-200 flex items-center justify-between cursor-pointer ${
                      activeScenario === 'scenarioB'
                        ? 'border-sage-600 bg-sage-50/70 shadow-xs'
                        : 'border-linen-300 bg-white hover:bg-linen-50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="h-2 w-2 rounded-full bg-sage-700" />
                        <span className="font-serif font-bold text-xs text-charcoal-900">
                          3. Scenario B: Decentralized Hybrid Visits
                        </span>
                      </div>
                      <p className="text-[11px] text-charcoal-500 mt-1 pl-4">
                        {scenarios?.scenarioB.description ?? 'Telehealth visits, mobile PK, and optional re-biopsy'}
                      </p>
                    </div>
                    <span className="text-xs font-mono font-bold text-sage-800">
                      {scenarios
                        ? `${scenarios.scenarioB.retentionAt52}% Retained (+${(scenarios.scenarioB.retentionAt52 - scenarios.baseline.retentionAt52).toFixed(1)}%)`
                        : '…'}
                    </span>
                  </button>
                </div>

                <div className="pt-2">
                  <button
                    onClick={onLaunchStudio}
                    className="inline-flex items-center space-x-2 text-xs font-semibold text-charcoal-900 hover:text-terracotta-600 transition-colors cursor-pointer"
                  >
                    <span>Open Full Sensitivity Workbench in Studio</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Right: Live Responsive Kaplan-Meier Retention Chart */}
              <div className="lg:col-span-7 bg-linen-50 rounded-3xl border border-linen-300 p-6 sm:p-8 shadow-xs space-y-6">
                
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-linen-200">
                  <div>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-400 block">
                      LIVE LONGITUDINAL ATTRITION TRAJECTORY
                    </span>
                    <h4 className="font-serif font-bold text-base text-charcoal-900 mt-0.5">
                      {activeData ? activeData.name : overviewLoading ? 'Computing live scenario trajectory…' : 'Live simulation unavailable'}
                    </h4>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono font-bold bg-white px-3 py-1 rounded-full border border-linen-300 text-charcoal-800">
                      Week 0 → {baselineNsclc?.study_duration_weeks ?? 52}
                    </span>
                  </div>
                </div>

                {overviewError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between text-xs text-red-700 font-mono">
                    <span>Live backend telemetry offline: {overviewError}</span>
                    <button
                      onClick={handleRetryOverview}
                      className="px-2.5 py-1 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {/* Dynamic Metric Ticker Strip */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white p-3.5 rounded-2xl border border-linen-200">
                    <span className="text-[10px] font-mono text-charcoal-400 block">WK {baselineNsclc?.study_duration_weeks ?? 52} RETENTION</span>
                    <span className="font-serif text-2xl font-bold text-charcoal-900">
                      {activeData ? `${activeData.retentionAt52}%` : '—'}
                    </span>
                    <span className="text-[10px] text-charcoal-500 block mt-0.5">Modeled Cohort</span>
                  </div>

                  <div className="bg-white p-3.5 rounded-2xl border border-linen-200">
                    <span className="text-[10px] font-mono text-charcoal-400 block">ELIGIBLE CANDIDATES</span>
                    <span className="font-serif text-2xl font-bold text-terracotta-600">
                      {activeData ? activeData.eligibleCount.toLocaleString() : '—'}
                    </span>
                    <span className="text-[10px] text-charcoal-500 block mt-0.5">
                      {activeData && activeData.patientsGained > 0
                        ? `+${activeData.patientsGained.toLocaleString()} vs Baseline`
                        : 'DuckDB Matched'}
                    </span>
                  </div>

                  <div className="bg-white p-3.5 rounded-2xl border border-linen-200">
                    <span className="text-[10px] font-mono text-charcoal-400 block">COMPOSITE PBI SCORE</span>
                    <span className="font-serif text-2xl font-bold text-sage-700">
                      {activeData ? `${activeData.compositePbi} / 100` : '—'}
                    </span>
                    <span className="text-[10px] text-charcoal-500 block mt-0.5">
                      {activeData?.hoursReduced
                        ? `-${activeData.hoursReduced}h dwell vs Baseline`
                        : 'Tufts CSDD Index'}
                    </span>
                  </div>
                </div>

                {/* Area Chart */}
                <div className="h-64 sm:h-72 w-full pt-2">
                  {activeData ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={activeData.data} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                        <defs>
                          <linearGradient id="landingRetained" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={activeData.color} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={activeData.color} stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ebe6dc" />
                        <XAxis dataKey="week" stroke="#948a7e" tick={{ fontSize: 10 }} tickFormatter={(w) => `Wk ${w}`} />
                        <YAxis domain={[0, 100]} stroke="#948a7e" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#191b1a', borderColor: '#383a3d', borderRadius: '12px', color: '#fff', fontSize: '11px' }}
                          formatter={(val: any) => [`${val}% retained`, 'Active Trial Cohort']}
                          labelFormatter={(label) => `Study Week ${label}`}
                        />
                        <ReferenceLine
                          x={baselineNsclc?.clause_diagnostics.biopsy.peak_week ?? 12}
                          stroke="#c84b31"
                          strokeDasharray="3 3"
                          label={{ value: 'Biopsy Assessment', fill: '#c84b31', fontSize: 10 }}
                        />
                        <Area type="monotone" dataKey="retained" stroke={activeData.color} strokeWidth={2.8} fill="url(#landingRetained)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full w-full flex items-center justify-center rounded-2xl border border-dashed border-linen-300 text-xs font-mono text-charcoal-500">
                      {overviewLoading ? 'Running live DuckDB cohort simulation…' : 'Live chart unavailable until backend reconnects.'}
                    </div>
                  )}
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-linen-200 text-xs text-charcoal-600 flex items-start space-x-2.5">
                  <Sparkles className="h-4 w-4 text-terracotta-600 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    <strong className="text-charcoal-900 font-semibold">Active Insight: </strong>
                    {activeData
                      ? `${activeData.description} Compare how reducing protocol burden impacts modeled retention over ${baselineNsclc?.study_duration_weeks ?? 52} weeks.`
                      : 'Select any simulation scenario above to inspect live DuckDB eligibility yield and modeled retention.'}
                  </p>
                </div>

              </div>

            </div>

          </div>
        </section>

      </div>


      {/* ─────────────────────────────────────────────────────────────
          CARD 2: FULL-BLEED COMPASSIONATE CARE PHOTO (PINNED BASE LAYER, z-10)
         ───────────────────────────────────────────────────────────── */}
      <section className="sticky top-0 h-[80vh] min-h-[500px] w-full overflow-hidden bg-charcoal-950 z-10 flex items-center justify-center">
        <img
          src="https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?auto=format&fit=crop&w=2000&q=85"
          alt="Compassionate doctor holding patient hands in oncology trial"
          className="w-full h-full object-cover object-center opacity-65"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-charcoal-950/85 via-transparent to-charcoal-950/40" />
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <div className="max-w-2xl space-y-3 text-white">
            <span className="text-[11px] font-mono uppercase tracking-widest text-terracotta-200 block font-semibold">
              HUMAN-CENTERED PROTOCOL DESIGN
            </span>
            <h3 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-normal leading-snug">
              Behind every protocol number is a human fighting for more time with their family.
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 font-light max-w-lg mx-auto">
              We engineer clinical trials that respect patient stamina, eliminate redundant clinic dwell hours, and protect subject dignity.
            </p>
          </div>
        </div>
      </section>


      {/* ─────────────────────────────────────────────────────────────
          SHEET 2: PLATFORM WORKSPACE, 3D ARCHITECTURE & GOVERNANCE (Slides UP over Photo, z-20)
         ───────────────────────────────────────────────────────────── */}
      <div className="relative z-20 bg-linen-100 rounded-t-[36px] sm:rounded-t-[52px] shadow-[0_-25px_60px_rgba(0,0,0,0.45)] border-t border-linen-300/80">
        
        {/* Subtle Visual Top Sheet Handle */}
        <div className="pt-4 pb-1">
          <div className="w-12 h-1 bg-linen-300 rounded-full mx-auto" />
        </div>

        {/* 5. THE 3-PILLAR INTERACTIVE PLATFORM SHOWCASE */}
        <section id="platform" className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-2.5">
            <span className="text-xs font-mono font-bold uppercase tracking-widest text-terracotta-600 block">
              THE PLATFORM WORKSPACE
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-charcoal-900 font-normal leading-tight">
              Intelligence for every protocol, from draft to site activation.
            </h2>
            <p className="text-sm sm:text-base text-charcoal-600 font-normal">
              A unified suite for clinical study sponsors, CRO protocol designers, and medical review boards.
            </p>
          </div>

          {/* 3 Large Architectural Platform Cards with Interactive Elements */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            
            {/* Card 1: Interactive Ground-Truth Protocol Ingestion */}
            <div className="bg-white rounded-3xl border border-linen-300 p-6 sm:p-7 shadow-xs flex flex-col justify-between hover:shadow-xl hover:border-terracotta-200 transition-all duration-300 group">
              <div className="space-y-5">
                
                {/* Realistic Document Card Mockup */}
                <div className="bg-linen-100 rounded-2xl border border-linen-200 p-4 space-y-3 font-mono text-[11px]">
                  <div className="flex items-center justify-between pb-2 border-b border-linen-200 text-charcoal-500">
                    <span className="font-bold">ONC-2026-03 PROTOCOL</span>
                    <span className="px-2 py-0.5 rounded-full bg-terracotta-100 text-terracotta-700 font-bold text-[10px]">
                      LIVE OCR EXTRACT
                    </span>
                  </div>
                  
                  {/* Clickable Highlight Chips */}
                  <p className="font-serif text-xs text-charcoal-800 leading-relaxed">
                    "Subjects must meet all inclusion criteria. Patients with{' '}
                    <button
                      onClick={() => setSelectedClause('egfr')}
                      className={`px-1.5 py-0.5 rounded font-mono text-[10px] cursor-pointer transition-colors ${
                        selectedClause === 'egfr' 
                          ? 'bg-terracotta-600 text-white font-bold' 
                          : 'bg-terracotta-100 text-terracotta-800 hover:bg-terracotta-200'
                      }`}
                    >
                      eGFR &lt; 60 mL/min
                    </button>{' '}
                    or{' '}
                    <button
                      onClick={() => setSelectedClause('ecog')}
                      className={`px-1.5 py-0.5 rounded font-mono text-[10px] cursor-pointer transition-colors ${
                        selectedClause === 'ecog' 
                          ? 'bg-terracotta-600 text-white font-bold' 
                          : 'bg-terracotta-100 text-terracotta-800 hover:bg-terracotta-200'
                      }`}
                    >
                      ECOG &gt; 1
                    </button>{' '}
                    shall be excluded. A mandatory{' '}
                    <button
                      onClick={() => setSelectedClause('biopsy')}
                      className={`px-1.5 py-0.5 rounded font-mono text-[10px] cursor-pointer transition-colors ${
                        selectedClause === 'biopsy' 
                          ? 'bg-terracotta-600 text-white font-bold' 
                          : 'bg-terracotta-100 text-terracotta-800 hover:bg-terracotta-200'
                      }`}
                    >
                      Core Biopsy at Wk 12
                    </button>{' '}
                    is required."
                  </p>

                  {/* Interactive Diagnostic Tooltip */}
                  <div className="bg-white p-2.5 rounded-xl border border-linen-300 text-[10px] text-charcoal-700 space-y-1">
                    <div className="flex items-center justify-between font-bold text-terracotta-700">
                      <span>
                        {selectedClause === 'egfr' &&
                          `⚠️ ${baselineNsclc?.clause_diagnostics.egfr.threshold ?? 'eGFR < 60 mL/min'} Exclusion`}
                        {selectedClause === 'ecog' &&
                          `⚠️ ${baselineNsclc?.clause_diagnostics.ecog.threshold ?? 'ECOG > 1'} Performance Filter`}
                        {selectedClause === 'biopsy' &&
                          `⚠️ Week ${baselineNsclc?.clause_diagnostics.biopsy.peak_week ?? 12} Invasive Biopsy`}
                      </span>
                      <span>
                        {selectedClause === 'egfr' &&
                          (baselineNsclc
                            ? `+${baselineNsclc.clause_diagnostics.egfr.recoverable_candidates} Recoverable`
                            : '…')}
                        {selectedClause === 'ecog' &&
                          (baselineNsclc
                            ? `+${baselineNsclc.clause_diagnostics.ecog.recoverable_candidates} Recoverable`
                            : '…')}
                        {selectedClause === 'biopsy' &&
                          (baselineNsclc
                            ? `-${baselineNsclc.clause_diagnostics.biopsy.pbi_reduction_if_optional} PBI Impact`
                            : '…')}
                      </span>
                    </div>
                    <p className="text-charcoal-500 font-sans">
                      {selectedClause === 'egfr' &&
                        (baselineNsclc
                          ? `Lowering renal gate by 10 mL/min expands eligible NSCLC count from ${baselineNsclc.eligible_count.toLocaleString()} to ${baselineNsclc.clause_diagnostics.egfr.relaxed_eligible_count.toLocaleString()} in DuckDB.`
                          : 'Queries live DuckDB renal cutoffs across the loaded oncology cohort.')}
                      {selectedClause === 'ecog' &&
                        (baselineNsclc
                          ? `Allowing next ECOG tier expands eligible NSCLC count from ${baselineNsclc.eligible_count.toLocaleString()} to ${baselineNsclc.clause_diagnostics.ecog.relaxed_eligible_count.toLocaleString()}.`
                          : 'Evaluates ECOG performance sensitivity against live patient profiles.')}
                      {selectedClause === 'biopsy' &&
                        (baselineNsclc
                          ? `Replacing mandatory on-treatment biopsy with ctDNA + hybrid labs saves ${baselineNsclc.clause_diagnostics.biopsy.hours_saved_if_hybrid} clinic hours.`
                          : 'Models burden and dropout hazard spikes across scheduled study weeks.')}
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="font-serif font-bold text-xl text-charcoal-900">
                    1. Automated Protocol Parsing
                  </h3>
                  <p className="text-xs text-charcoal-600 mt-2 leading-relaxed">
                    Ingests dense 100+ page clinical trial PDFs, extracts tabular Schedules of Assessments, and converts unstructured eligibility text into machine-verifiable screening logic.
                  </p>
                </div>
              </div>

              <div className="mt-8 pt-4 border-t border-linen-200 flex items-center justify-between text-xs font-semibold text-terracotta-600">
                <span>PyMuPDF Layout-Aware OCR</span>
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* Card 2: Interactive Schedule of Assessments Matrix */}
            <div className="bg-white rounded-3xl border border-linen-300 p-6 sm:p-7 shadow-xs flex flex-col justify-between hover:shadow-xl hover:border-terracotta-200 transition-all duration-300 group">
              <div className="space-y-5">
                
                {/* Mini Interactive SoA Grid */}
                <div className="bg-linen-100 rounded-2xl border border-linen-200 p-4 space-y-3 font-mono text-[10px]">
                  <div className="flex items-center justify-between pb-1.5 border-b border-linen-200 text-charcoal-600 font-bold">
                    <span>ICH E6 SoA BURDEN MATRIX</span>
                    <span className="text-sage-700">TUFTS WEIGHTED</span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-charcoal-700">
                      <span>Telehealth Migration:</span>
                      <span className="font-bold text-terracotta-600">{telehealthPct}% Virtual</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="60"
                      step="10"
                      value={telehealthPct}
                      onChange={(e) => setTelehealthPct(Number(e.target.value))}
                      className="w-full accent-terracotta-600 cursor-pointer"
                    />
                  </div>

                  <div className="grid grid-cols-4 gap-1 text-center font-mono text-[9px] pt-1">
                    <div className="bg-white p-1.5 rounded border border-linen-200">
                      <span className="text-charcoal-400 block">SCRN</span>
                      <span className="font-bold text-charcoal-900">
                        {baselineNsclc?.visit_previews?.[0] ? `${baselineNsclc.visit_previews[0].hours}h` : '—'}
                      </span>
                    </div>
                    <div className="bg-white p-1.5 rounded border border-linen-200">
                      <span className="text-charcoal-400 block">C1D1</span>
                      <span className="font-bold text-amber-600">
                        {baselineNsclc?.visit_previews?.[1] ? `${baselineNsclc.visit_previews[1].hours}h` : '—'}
                      </span>
                    </div>
                    <div className="bg-white p-1.5 rounded border border-linen-200">
                      <span className="text-charcoal-400 block">PEAK WK</span>
                      <span className="font-bold text-terracotta-600">
                        {baselineNsclc?.peak_visit_hours != null ? `${baselineNsclc.peak_visit_hours}h` : '—'}
                      </span>
                    </div>
                    <div className="bg-sage-100 p-1.5 rounded border border-sage-300">
                      <span className="text-sage-800 block">DWELL</span>
                      <span className="font-bold text-sage-900">
                        {baselineNsclc
                          ? `${Math.max(10, Math.round(baselineNsclc.total_clinic_hours * (1 - telehealthPct / 200)))}h`
                          : '—'}
                      </span>
                    </div>
                  </div>

                  <p className="text-[10px] text-charcoal-500 font-sans mt-1">
                    {baselineNsclc
                      ? `Preview model: ${telehealthPct}% telehealth migration offsets ~${Math.round((baselineNsclc.total_clinic_hours * telehealthPct) / 200)} of ${baselineNsclc.total_clinic_hours} baseline hours.`
                      : 'Interactive Schedule of Assessments dwell projection based on live template hours.'}
                  </p>
                </div>

                <div>
                  <h3 className="font-serif font-bold text-xl text-charcoal-900">
                    2. Schedule of Events Matrix
                  </h3>
                  <p className="text-xs text-charcoal-600 mt-2 leading-relaxed">
                    Decomposes study calendars into temporal transit hours, physical invasiveness, and cognitive fasting loads according to calibrated Tufts CSDD friction formulas.
                  </p>
                </div>
              </div>

              <div className="mt-8 pt-4 border-t border-linen-200 flex items-center justify-between text-xs font-semibold text-terracotta-600">
                <span>Tufts CSDD Mathematical Calibration</span>
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* Card 3: Interactive DuckDB Cohort Simulator */}
            <div className="bg-white rounded-3xl border border-linen-300 p-6 sm:p-7 shadow-xs flex flex-col justify-between hover:shadow-xl hover:border-terracotta-200 transition-all duration-300 group">
              <div className="space-y-5">
                
                {/* Mini DuckDB Funnel Mockup */}
                <div className="bg-linen-100 rounded-2xl border border-linen-200 p-4 space-y-3 font-mono text-[10px]">
                  <div className="flex items-center justify-between pb-1.5 border-b border-linen-200 text-charcoal-600 font-bold">
                    <span>DUCKDB LIVE COHORT FUNNEL</span>
                    <span className="text-terracotta-600">
                      {overview ? `${overview.measured_query_ms}ms SQL` : 'DUCKDB SQL'}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-[10px]">
                        <span>Loaded Synthetic Cohort</span>
                        <span className="font-bold">
                          {baselineNsclc ? `${baselineNsclc.total_population.toLocaleString()} (100%)` : '—'}
                        </span>
                      </div>
                      <div className="w-full bg-linen-300 rounded-full h-1.5 mt-1">
                        <div className="bg-charcoal-900 h-1.5 rounded-full w-full" />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[10px]">
                        <span>{baselineNsclc?.funnel_stages?.[3]?.stage ?? 'Organ & Lab Gates'}</span>
                        <span className="font-bold text-amber-700">
                          {baselineNsclc?.funnel_stages?.[3]
                            ? `${baselineNsclc.funnel_stages[3].count.toLocaleString()} (${baselineNsclc.funnel_stages[3].pass_rate}%)`
                            : '—'}
                        </span>
                      </div>
                      <div className="w-full bg-linen-300 rounded-full h-1.5 mt-1">
                        <div
                          className="bg-amber-600 h-1.5 rounded-full"
                          style={{ width: `${Math.min(100, baselineNsclc?.funnel_stages?.[3]?.pass_rate ?? 0)}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[10px]">
                        <span>Eligible NSCLC Cohort</span>
                        <span className="font-bold text-sage-800">
                          {baselineNsclc
                            ? `${baselineNsclc.eligible_count.toLocaleString()} (${baselineNsclc.overall_yield_percentage}%)`
                            : '—'}
                        </span>
                      </div>
                      <div className="w-full bg-linen-300 rounded-full h-1.5 mt-1">
                        <div
                          className="bg-sage-600 h-1.5 rounded-full"
                          style={{ width: `${Math.min(100, Math.max(2, baselineNsclc?.overall_yield_percentage ?? 0))}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-2 rounded-xl border border-linen-200 text-[10px] text-charcoal-700 flex justify-between">
                    <span>
                      {baselineNsclc ? `Screen Failure: ${baselineNsclc.screen_failure_rate}%` : 'Screen Failure: —'}
                    </span>
                    <span className="font-bold text-terracotta-600">
                      {baselineNsclc
                        ? `${baselineNsclc.clause_diagnostics.egfr.threshold} (+${baselineNsclc.clause_diagnostics.egfr.recoverable_candidates})`
                        : 'Live SQL Sensitivity'}
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="font-serif font-bold text-xl text-charcoal-900">
                    3. What-If Sensitivity Sandbox
                  </h3>
                  <p className="text-xs text-charcoal-600 mt-2 leading-relaxed">
                    Test relaxing criteria across {cohortLabel} synthetic patient phenotypes in real time. Simulate recruitment velocity, screen failures, and accrual timeline gains directly in DuckDB.
                  </p>
                </div>
              </div>

              <div className="mt-8 pt-4 border-t border-linen-200 flex items-center justify-between text-xs font-semibold text-terracotta-600">
                <span>Vectorized DuckDB In-Memory OLAP</span>
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

          </div>
        </section>


        {/* 6. 3D INTERACTIVE KINETIC SCULPTURE SECTION */}
        <section id="architecture" className="py-24 bg-linen-200/50 border-y border-linen-300">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            {/* Left Text */}
            <div className="lg:col-span-6 space-y-6">
              <span className="text-xs font-mono font-bold uppercase tracking-widest text-terracotta-600 block">
                SYSTEM ARCHITECTURE
              </span>
              <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-charcoal-900 font-normal leading-tight">
                The new system of intelligence for clinical trials.
              </h2>
              <p className="text-sm sm:text-base text-charcoal-700 leading-relaxed font-normal">
                Built on a decoupled, deterministic architecture: PyMuPDF document ingestion feeds the Tufts CSDD burden decomposition, while an in-process DuckDB OLAP database queries {cohortLabel} synthetic patient phenotypes in real time.
              </p>

              <div className="space-y-3.5 text-xs text-charcoal-800 font-mono">
                <div className="flex items-center space-x-2.5">
                  <span className="h-2 w-2 rounded-full bg-sage-600" />
                  <span>Deterministic DuckDB OLAP Cohort Slicing ({overview ? `${overview.measured_query_ms}ms SQL` : 'Live Query'})</span>
                </div>
                <div className="flex items-center space-x-2.5">
                  <span className="h-2 w-2 rounded-full bg-sage-600" />
                  <span>Tufts Center for the Study of Drug Development Metric Engine</span>
                </div>
                <div className="flex items-center space-x-2.5">
                  <span className="h-2 w-2 rounded-full bg-sage-600" />
                  <span>Cryptographically Sealed 21 CFR Part 11 Audit Trail</span>
                </div>
                <div className="flex items-center space-x-2.5">
                  <span className="h-2 w-2 rounded-full bg-sage-600" />
                  <span>Synthetic Oncology Data Model ({cohortLabel} Profiles)</span>
                </div>
              </div>

              <p className="text-xs text-charcoal-500 italic pt-1">
                * Move your cursor over the 3D sculpture to rotate and inspect the architectural nodes. Toggle modes between Lattice, Cluster, and Disperse.
              </p>
            </div>

            {/* Right: 3D Interactive Isometric Sculpture with Mode Buttons */}
            <div className="lg:col-span-6 h-[440px] w-full rounded-3xl bg-white border border-linen-300 shadow-md overflow-hidden relative">
              <KineticSculptureCanvas />
              <div className="absolute top-4 left-4 text-[10px] font-mono text-charcoal-400 pointer-events-none flex items-center space-x-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-terracotta-500 animate-pulse" />
                <span>3D ISOMETRIC KINETIC SCULPTURE</span>
              </div>
            </div>

          </div>
        </section>


        {/* 7. REGULATORY TRUST & INSTITUTIONAL SEALS SECTION */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-stretch">
            
            {/* Left Dark Card with Regulatory Seals */}
            <div className="md:col-span-6 bg-charcoal-900 text-white rounded-3xl p-8 sm:p-10 flex flex-col justify-between space-y-8 shadow-xl">
              <div>
                <div className="inline-flex items-center space-x-2 text-terracotta-200 text-xs font-mono font-bold mb-4">
                  <Award className="h-4 w-4" />
                  <span>CLINICAL GOVERNANCE & AUDIT</span>
                </div>
                <h3 className="font-serif text-3xl font-normal leading-snug">
                  Engineered for strict clinical audit standards.
                </h3>
                <p className="text-xs sm:text-sm text-charcoal-300 mt-3 leading-relaxed">
                  Every calculation, parameter variance, and amendment proposal is recorded in an immutable SHA-256 cryptographic hash chain designed to support 21 CFR Part 11 record-integrity and ICH GCP E6(R2) traceability requirements.
                </p>
                <div className="mt-4 p-3 rounded-xl bg-charcoal-950/80 border border-white/10 text-[11px] text-slate-300">
                  <span className="font-semibold text-terracotta-300">Compliance Architecture Notice: </span>
                  Technical design delivers cryptographic tamper-evidence. Full regulatory compliance requires formal institutional validation (IQ/OQ/PQ) and sponsor SOPs.
                </div>
              </div>

              {/* Glowing Compliance Badges */}
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="p-4 rounded-2xl bg-charcoal-950 border border-white/10 flex items-center space-x-3">
                  <div className="h-10 w-10 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="font-serif font-bold text-xs text-white block">21 CFR Part 11</span>
                    <span className="text-[10px] text-slate-400 font-mono">Cryptographic Hash Chain</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-charcoal-950 border border-white/10 flex items-center space-x-3">
                  <div className="h-10 w-10 rounded-full bg-terracotta-500/20 text-terracotta-400 flex items-center justify-center shrink-0">
                    <FileCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="font-serif font-bold text-xs text-white block">ICH GCP E6(R2)</span>
                    <span className="text-[10px] text-slate-400 font-mono">Traceable Feasibility Log</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-white/10 flex flex-wrap gap-2 text-[10px] font-mono text-slate-400">
                <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10">SHA-256 HASH CHAIN</span>
                <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10">ZERO CLOUD DATA EGRESS</span>
                <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10">SYNTHETIC DE-IDENTIFIED DATA</span>
              </div>
            </div>

            {/* Right Metrics Grid */}
            <div className="md:col-span-6 grid grid-cols-2 gap-4">
              
              <div className="bg-white rounded-3xl border border-linen-300 p-6 flex flex-col justify-center shadow-xs hover:border-terracotta-300 transition-colors">
                <span className="font-serif text-4xl sm:text-5xl font-bold text-charcoal-900">
                  {baselineNsclc ? `${baselineNsclc.screen_failure_rate}%` : '—'}
                </span>
                <span className="text-xs text-charcoal-600 mt-2 font-medium">
                  Baseline NSCLC screen failure rate measured across the active DuckDB cohort.
                </span>
              </div>

              <div className="bg-white rounded-3xl border border-linen-300 p-6 flex flex-col justify-center shadow-xs hover:border-terracotta-300 transition-colors">
                <span className="font-serif text-4xl sm:text-5xl font-bold text-terracotta-600">
                  {baselineNsclc ? `${baselineNsclc.composite_pbi_score}` : '—'}
                </span>
                <span className="text-xs text-charcoal-600 mt-2 font-medium">
                  Composite Patient Burden Index (0–100 scale) computed for the NSCLC baseline template.
                </span>
              </div>

              <div className="bg-white rounded-3xl border border-linen-300 p-6 flex flex-col justify-center shadow-xs hover:border-terracotta-300 transition-colors">
                <span className="font-serif text-4xl sm:text-5xl font-bold text-charcoal-900">
                  {cohortLabel}
                </span>
                <span className="text-xs text-charcoal-600 mt-2 font-medium">
                  Synthetic oncology patient records currently loaded and queried in DuckDB.
                </span>
              </div>

              <div className="bg-white rounded-3xl border border-linen-300 p-6 flex flex-col justify-center shadow-xs hover:border-terracotta-300 transition-colors">
                <span className="font-serif text-4xl sm:text-5xl font-bold text-sage-700">
                  {overview ? overview.audit_events_count.toLocaleString() : '—'}
                </span>
                <span className="text-xs text-charcoal-600 mt-2 font-medium">
                  Cryptographically linked SHA-256 audit log entries persisted in the database.
                </span>
              </div>

            </div>

          </div>
        </section>

      </div>


      {/* ─────────────────────────────────────────────────────────────
          CARD 3: EDITORIAL CLINICIAN TESTIMONIAL (PINNED BASE LAYER, z-20)
         ───────────────────────────────────────────────────────────── */}
      <section className="sticky top-0 h-[75vh] min-h-[500px] w-full overflow-hidden bg-charcoal-950 text-white z-20 flex items-center">
        <div className="absolute inset-0 z-0">
          <img
            src="https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=1600&q=85"
            alt="Clinical Investigator portrait"
            className="w-full h-full object-cover object-top opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-charcoal-950 via-charcoal-950/85 to-transparent" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20 space-y-6">
          <div className="inline-flex items-center space-x-1.5 text-xs font-mono uppercase tracking-widest text-terracotta-200 font-bold">
            <span>CLINICAL ADVISOR PERSPECTIVE (ILLUSTRATIVE PERSONA)</span>
          </div>

          <blockquote className="font-serif text-2xl sm:text-3xl lg:text-4xl font-normal leading-snug text-white">
            "For trial sponsors and oncology investigators, protecting patient safety and comfort while finding effective treatments is the primary goal. Protocol-level simulation allows teams to spot visit-clustering risks and burdensome tests before submitting to an ethics review committee."
          </blockquote>

          <div className="pt-2">
            <strong className="block text-base font-semibold text-white">Clinical Research Advisor Persona</strong>
            <span className="text-xs text-slate-300 font-mono">Representative Oncology Protocol Design Perspective</span>
          </div>
        </div>
      </section>


      {/* ─────────────────────────────────────────────────────────────
          SHEET 3: CASE STUDIES, EVIDENCE & GRAND FOOTER (Slides UP over Testimonial, z-30)
         ───────────────────────────────────────────────────────────── */}
      <div className="relative z-30 bg-white rounded-t-[36px] sm:rounded-t-[52px] shadow-[0_-25px_60px_rgba(0,0,0,0.45)] border-t border-linen-300/80">
        
        {/* Subtle Visual Top Sheet Handle */}
        <div className="pt-4 pb-1">
          <div className="w-12 h-1 bg-linen-300 rounded-full mx-auto" />
        </div>

        {/* 8. CLINICAL TRIAL CASE STUDIES (INTERACTIVE TABBED SECTION) */}
        <section id="case-studies" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="max-w-3xl mb-12 space-y-2">
            <span className="text-xs font-mono font-bold uppercase tracking-widest text-terracotta-600 block">
              SYNTHETIC SIMULATION BENCHMARK CASES
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl text-charcoal-900 font-normal">
              Validated across oncology, rare disease, and hematology models.
            </h2>
            <p className="text-xs sm:text-sm text-charcoal-600 font-normal">
              Explore live optimizer evaluations across {cohortLabel} synthetic patient records for all built-in oncology protocol templates.
            </p>
          </div>

          {/* Case Study Selection Tabs */}
          <div className="flex flex-wrap gap-2 pb-6">
            <button
              onClick={() => setActiveCaseStudy('nsclc')}
              className={`px-4 py-2 rounded-full text-xs font-medium transition-all cursor-pointer ${
                activeCaseStudy === 'nsclc'
                  ? 'bg-charcoal-900 text-white shadow-xs'
                  : 'bg-linen-100 text-charcoal-700 hover:bg-linen-200 border border-linen-300'
              }`}
            >
              Non-Small Cell Lung Cancer
            </button>
            <button
              onClick={() => setActiveCaseStudy('breast')}
              className={`px-4 py-2 rounded-full text-xs font-medium transition-all cursor-pointer ${
                activeCaseStudy === 'breast'
                  ? 'bg-charcoal-900 text-white shadow-xs'
                  : 'bg-linen-100 text-charcoal-700 hover:bg-linen-200 border border-linen-300'
              }`}
            >
              Triple-Negative Breast Cancer
            </button>
            <button
              onClick={() => setActiveCaseStudy('myeloma')}
              className={`px-4 py-2 rounded-full text-xs font-medium transition-all cursor-pointer ${
                activeCaseStudy === 'myeloma'
                  ? 'bg-charcoal-900 text-white shadow-xs'
                  : 'bg-linen-100 text-charcoal-700 hover:bg-linen-200 border border-linen-300'
              }`}
            >
              Relapsed Multiple Myeloma
            </button>
          </div>

          {/* Active Case Study Details Card */}
          <div className="bg-linen-50 rounded-3xl border border-linen-300 p-8 shadow-xs">
            {activeStudy ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              
              <div className="lg:col-span-7 space-y-4">
                <div className="flex items-center space-x-2 text-xs font-mono text-terracotta-600 font-bold">
                  <span>{activeStudy.sponsor}</span>
                  <span>•</span>
                  <span>{activeStudy.target}</span>
                </div>

                <h3 className="font-serif font-bold text-2xl text-charcoal-900">
                  {activeStudy.title}
                </h3>

                <div className="space-y-3 text-xs text-charcoal-700 leading-relaxed">
                  <p>
                    <strong className="text-charcoal-900 font-semibold">Measured Bottleneck: </strong>
                    {activeStudy.challenge}
                  </p>
                  <p>
                    <strong className="text-charcoal-900 font-semibold">Live Optimizer Output: </strong>
                    {activeStudy.result}
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    onClick={onLaunchStudio}
                    className="inline-flex items-center space-x-2 text-xs font-semibold text-terracotta-600 hover:text-terracotta-700 transition-colors cursor-pointer"
                  >
                    <span>Simulate This Protocol in Studio</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* 3 Key Metrics Cards */}
              <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {activeStudy.metrics.map((m, idx) => (
                  <div key={idx} className="bg-white rounded-2xl p-4 border border-linen-200 text-center shadow-2xs">
                    <span className="font-serif text-xl sm:text-2xl font-bold text-charcoal-900 block">
                      {m.value}
                    </span>
                    <span className="text-[10px] font-mono text-charcoal-500 block mt-1">
                      {m.label}
                    </span>
                  </div>
                ))}
              </div>

            </div>
            ) : (
              <div className="py-8 text-center text-xs font-mono text-charcoal-500">
                {overviewLoading
                  ? 'Evaluating live protocol templates against DuckDB…'
                  : 'Protocol case study telemetry is unavailable while offline.'}
              </div>
            )}
          </div>

        </section>


        {/* 10. SCIENTIFIC EVIDENCE & CITATIONS SECTION */}
        <section id="evidence" className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-linen-200">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-14 gap-4">
            <div>
              <span className="text-xs font-mono font-bold uppercase tracking-widest text-terracotta-600 block mb-1">
                SCIENTIFIC FOUNDATIONS
              </span>
              <h2 className="font-serif text-3xl sm:text-4xl text-charcoal-900 font-normal">
                Grounded in peer-reviewed clinical research.
              </h2>
            </div>
            <button
              onClick={onLaunchStudio}
              className="inline-flex items-center space-x-1.5 text-xs font-semibold text-charcoal-900 hover:text-terracotta-600 transition-colors cursor-pointer"
            >
              <span>Launch Live Environment</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            <div className="bg-linen-50 rounded-3xl border border-linen-300 p-7 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow">
              <div>
                <span className="text-[10px] font-mono text-charcoal-400 uppercase block mb-2 font-bold">
                  TUFTS CSDD IMPACT REPORT
                </span>
                <h4 className="font-serif font-bold text-base text-charcoal-900 leading-snug">
                  Quantifying Protocol Complexity and Its Toll on Clinical Trial Velocity
                </h4>
                <p className="text-xs text-charcoal-600 mt-2.5 leading-relaxed">
                  Establishes the empirical weighting of invasive tissue biopsies, serial PK blood draws, and cumulative clinic dwell hours on volunteer attrition.
                </p>
              </div>
              <span className="mt-6 pt-3 border-t border-linen-200 text-[10px] font-mono text-terracotta-600 font-semibold block">
                Tufts CSDD Burden Weights
              </span>
            </div>

            <div className="bg-linen-50 rounded-3xl border border-linen-300 p-7 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow">
              <div>
                <span className="text-[10px] font-mono text-charcoal-400 uppercase block mb-2 font-bold">
                  JAMA ONCOLOGY
                </span>
                <h4 className="font-serif font-bold text-base text-charcoal-900 leading-snug">
                  Overly Restrictive Eligibility in Advanced Non-Small Cell Lung Cancer
                </h4>
                <p className="text-xs text-charcoal-600 mt-2.5 leading-relaxed">
                  Demonstrates that relaxing non-critical organ cutoffs safely broadens real-world recruitment pools by 22% to 35% without impacting toxicity.
                </p>
              </div>
              <span className="mt-6 pt-3 border-t border-linen-200 text-[10px] font-mono text-terracotta-600 font-semibold block">
                JAMA Oncol. Clinical Analysis
              </span>
            </div>

            <div className="bg-linen-50 rounded-3xl border border-linen-300 p-7 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow">
              <div>
                <span className="text-[10px] font-mono text-charcoal-400 uppercase block mb-2 font-bold">
                  CLINICALTRIALS.GOV BENCHMARKS
                </span>
                <h4 className="font-serif font-bold text-base text-charcoal-900 leading-snug">
                  Calibrated Against Public Phase III Trial Schema Architectures
                </h4>
                <p className="text-xs text-charcoal-600 mt-2.5 leading-relaxed">
                  ProtocolShield is benchmarked against public historical trial schemas from ClinicalTrials.gov, modeling recruitment velocity patterns across major oncology indications.
                </p>
              </div>
              <span className="mt-6 pt-3 border-t border-linen-200 text-[10px] font-mono text-terracotta-600 font-semibold block">
                Public Trial Portfolio Calibration
              </span>
            </div>

          </div>
        </section>


        {/* 12. GRAND EDITORIAL MONOGRAM FOOTER */}
        <footer className="bg-white border-t border-linen-300 pt-20 pb-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 pb-16 border-b border-linen-200">
              
              {/* Left Brand Area with Giant Monogram 'P' */}
              <div className="lg:col-span-5 space-y-5">
                <div className="font-serif text-8xl font-bold text-charcoal-900 tracking-tighter select-none">
                  P
                </div>
                <div>
                  <span className="font-serif font-bold text-xl text-charcoal-900 block">
                    ProtocolShield
                  </span>
                  <p className="text-xs text-charcoal-500 mt-1 max-w-sm leading-relaxed">
                    Autonomous Clinical Trial Protocol Feasibility & Patient Attrition Synthesizer. Powered by in-memory DuckDB OLAP and Tufts CSDD metrics.
                  </p>
                </div>
                <div className="pt-2">
                  <button
                    onClick={onLaunchStudio}
                    className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-full text-xs font-semibold bg-charcoal-900 text-white hover:bg-charcoal-800 transition-colors shadow-xs cursor-pointer"
                  >
                    <span>Launch Studio</span>
                    <ArrowRight className="h-3.5 w-3.5 text-terracotta-300" />
                  </button>
                </div>
              </div>

              {/* Right 4 Columns of Links */}
              <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-8 text-xs">
                <div className="space-y-3">
                  <span className="font-mono font-bold uppercase tracking-wider text-charcoal-400 text-[10px] block">
                    Platform
                  </span>
                  <ul className="space-y-2 text-charcoal-600">
                    <li><button onClick={onLaunchStudio} className="hover:text-charcoal-900 cursor-pointer">Protocol Parser</button></li>
                    <li><button onClick={onLaunchStudio} className="hover:text-charcoal-900 cursor-pointer">What-If Sandbox</button></li>
                    <li><button onClick={onLaunchStudio} className="hover:text-charcoal-900 cursor-pointer">Schedule of Assessments</button></li>
                    <li><button onClick={onLaunchStudio} className="hover:text-charcoal-900 cursor-pointer">Survival Trajectory</button></li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <span className="font-mono font-bold uppercase tracking-wider text-charcoal-400 text-[10px] block">
                    Evidence
                  </span>
                  <ul className="space-y-2 text-charcoal-600">
                    <li><a href="#evidence" className="hover:text-charcoal-900">Tufts CSDD Index</a></li>
                    <li><a href="#evidence" className="hover:text-charcoal-900">ClinicalTrials.gov API</a></li>
                    <li><a href="#evidence" className="hover:text-charcoal-900">Synthetic Cohorts</a></li>
                    <li><a href="#evidence" className="hover:text-charcoal-900">Benchmark Studies</a></li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <span className="font-mono font-bold uppercase tracking-wider text-charcoal-400 text-[10px] block">
                    Governance
                  </span>
                  <ul className="space-y-2 text-charcoal-600">
                    <li><span className="text-charcoal-700 font-medium">21 CFR Part 11</span></li>
                    <li><span className="text-charcoal-700 font-medium">ICH GCP E6(R2)</span></li>
                    <li><span className="text-charcoal-700 font-medium">CDISC Data Model</span></li>
                    <li><span className="text-charcoal-700 font-medium">HIPAA De-Identified</span></li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <span className="font-mono font-bold uppercase tracking-wider text-charcoal-400 text-[10px] block">
                    Target Users
                  </span>
                  <ul className="space-y-2 text-charcoal-600">
                    <li><span>Pharma Sponsors</span></li>
                    <li><span>Contract Research (CRO)</span></li>
                    <li><span>Clinical Architects</span></li>
                    <li><span>Protocol Review Boards</span></li>
                  </ul>
                </div>
              </div>

            </div>

            <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-[11px] text-charcoal-400 gap-4">
              <p>© 2026 ProtocolShield. All rights reserved. Enterprise Clinical Feasibility Intelligence.</p>
              <p className="font-mono">Validated In-Memory OLAP • Sub-5ms Slicing</p>
            </div>
          </div>
        </footer>

      </div>


      {/* ─────────────────────────────────────────────────────────────
          11. INTERACTIVE VISUAL WALKTHROUGH & TESTING GUIDE MODAL
         ───────────────────────────────────────────────────────────── */}
      {isTourOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-charcoal-900 text-white rounded-3xl border border-white/20 max-w-5xl w-full p-4 sm:p-6 shadow-2xl relative space-y-4 max-h-[94vh] flex flex-col justify-between overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center space-x-3">
                <div className="h-9 w-9 rounded-xl bg-terracotta-600 flex items-center justify-center text-white shadow-md">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-serif font-bold text-base sm:text-lg text-white">
                      ProtocolShield Visual Walkthrough & Testing Guide
                    </h3>
                    <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Live App Pages
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    See our actual pages: how to ingest a PDF protocol, test burden heatmaps, run What-If sensitivity, and screen patients.
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setTourAutoPlay(!tourAutoPlay)}
                  className="hidden sm:inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-white/10 hover:bg-white/15 text-slate-200 border border-white/15 transition-colors cursor-pointer"
                  title="Toggle auto-advancing visual tour"
                >
                  {tourAutoPlay ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 fill-current" />}
                  <span>{tourAutoPlay ? 'Auto-Advancing' : 'Paused'}</span>
                </button>

                <button
                  onClick={() => setIsTourOpen(false)}
                  className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
                  aria-label="Close Walkthrough"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Step Navigation Pills */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-xs">
              {[
                { step: 1, title: '1. Ingest Protocol PDF', icon: Upload },
                { step: 2, title: '2. Studio & Heatmap', icon: Activity },
                { step: 3, title: '3. What-If Console', icon: Sliders },
                { step: 4, title: '4. Patient Screening', icon: UserCheck }
              ].map((item) => {
                const Icon = item.icon;
                const isActive = tourStep === item.step;
                return (
                  <button
                    key={item.step}
                    onClick={() => {
                      setTourStep(item.step);
                      setTourProgress(0);
                    }}
                    className={`relative p-2.5 rounded-xl border transition-all text-left flex items-center space-x-2 cursor-pointer ${
                      isActive 
                        ? 'bg-terracotta-500/20 border-terracotta-400/50 text-white font-semibold shadow-sm'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-terracotta-400' : 'text-slate-400'}`} />
                    <span className="truncate">{item.title}</span>
                    {isActive && tourAutoPlay && (
                      <span 
                        className="absolute bottom-0 left-0 h-0.5 bg-terracotta-400 transition-all duration-100 rounded-full"
                        style={{ width: `${tourProgress}%` }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Main Visual Display Frame (Simulated Browser Screen + Testing Guide) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              
              {/* Left Column: Authentic Page Screen Mockup (8 Cols) */}
              <div className="lg:col-span-8 rounded-2xl border border-white/15 bg-charcoal-950 overflow-hidden shadow-inner flex flex-col justify-between">
                
                {/* Browser Chrome Header */}
                <div className="bg-charcoal-900/90 border-b border-white/10 px-4 py-2 flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center space-x-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500/80 inline-block" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80 inline-block" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80 inline-block" />
                  </div>
                  <div className="bg-charcoal-950 px-3 py-1 rounded-md text-[11px] text-slate-300 border border-white/10 flex items-center space-x-1.5 max-w-xs truncate">
                    <Lock className="h-2.5 w-2.5 text-emerald-400" />
                    <span>
                      {tourStep === 1 ? 'https://protocolshield.internal/studio/upload-protocol' :
                       tourStep === 2 ? 'https://protocolshield.internal/studio#burden-heatmap' :
                       tourStep === 3 ? 'https://protocolshield.internal/studio#what-if-console' :
                       'https://protocolshield.internal/patient-portal#screen'}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 uppercase">
                    {tourStep === 1 ? 'PDF Ingestion' : tourStep === 2 ? 'Feasibility Studio' : tourStep === 3 ? 'Sensitivity Model' : 'Patient Portal'}
                  </span>
                </div>

                {/* Simulated Actual Page Contents */}
                <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between min-h-[310px]">
                  
                  {/* Step 1: Ingesting a PDF Protocol */}
                  {tourStep === 1 && (
                    <div className="space-y-3.5 animate-in fade-in duration-200">
                      <div className="border border-dashed border-terracotta-400/40 bg-terracotta-950/20 rounded-xl p-4 text-center space-y-2">
                        <Upload className="h-7 w-7 text-terracotta-400 mx-auto" />
                        <p className="text-xs font-semibold text-white">Drag & drop your clinical trial protocol PDF here</p>
                        <p className="text-[11px] text-slate-400 font-mono">Supports up to 150MB PDF documents • Extracted in-memory via PyMuPDF</p>
                      </div>

                      <div className="space-y-1.5">
                        <span className="text-[11px] font-mono text-slate-400 block">OR SELECT A PRE-LOADED CLINICAL PROTOCOL TEMPLATE:</span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div className="bg-charcoal-900 border border-terracotta-500/50 p-2.5 rounded-lg text-left space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-white flex items-center space-x-1">
                                <Zap className="h-3 w-3 text-terracotta-400" />
                                <span>Phase III NSCLC</span>
                              </span>
                              <span className="text-[9px] font-mono px-1 rounded bg-terracotta-500/20 text-terracotta-300">148 pgs</span>
                            </div>
                            <p className="text-[10px] text-slate-300">Anti-PD-1 + Chemo • 14 Visits • 52 Wks</p>
                          </div>

                          <div className="bg-charcoal-900 border border-white/10 p-2.5 rounded-lg text-left space-y-1 opacity-75">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-white flex items-center space-x-1">
                                <FlaskConical className="h-3 w-3 text-emerald-400" />
                                <span>Phase II TNBC</span>
                              </span>
                              <span className="text-[9px] font-mono px-1 rounded bg-emerald-500/20 text-emerald-300">112 pgs</span>
                            </div>
                            <p className="text-[10px] text-slate-300">ADC + IO Combination • 10 Visits</p>
                          </div>

                          <div className="bg-charcoal-900 border border-white/10 p-2.5 rounded-lg text-left space-y-1 opacity-75">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-white flex items-center space-x-1">
                                <Dna className="h-3 w-3 text-indigo-400" />
                                <span>Phase III Myeloma</span>
                              </span>
                              <span className="text-[9px] font-mono px-1 rounded bg-indigo-500/20 text-indigo-300">94 pgs</span>
                            </div>
                            <p className="text-[10px] text-slate-300">BCMA Bispecific • 12 Visits</p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-charcoal-900/90 border border-emerald-500/30 p-2.5 rounded-xl font-mono text-[11px] text-slate-300 space-y-1">
                        <p className="text-emerald-400 font-bold">
                          ✓ Reference Template Snapshot ({baselineNsclc?.protocol_id ?? 'PS-ONC-2026-001'}):
                        </p>
                        <p>
                          • {baselineNsclc ? `${baselineNsclc.total_visits} Scheduled Visits • ${baselineNsclc.total_clinic_hours} Clinic Hours` : 'Schedule of Assessments mapped across study visits'}
                        </p>
                        <p>
                          • {baselineNsclc ? `${baselineNsclc.eligible_count.toLocaleString()} of ${baselineNsclc.total_population.toLocaleString()} cohort candidates currently match baseline criteria` : 'Deterministic eligibility criteria evaluated in DuckDB'}
                        </p>
                        <p className="text-amber-300">
                          ⚠️ {baselineNsclc
                            ? `Relaxing ${baselineNsclc.clause_diagnostics.egfr.threshold} recovers +${baselineNsclc.clause_diagnostics.egfr.recoverable_candidates} candidates`
                            : 'Overly-Restrictive Eligibility Clauses Flagged'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Feasibility Studio & Patient Burden Heatmap */}
                  {tourStep === 2 && (
                    <div className="space-y-3.5 animate-in fade-in duration-200">
                      {/* Studio Tab bar mockup */}
                      <div className="flex items-center space-x-2 border-b border-white/10 pb-2 text-[11px] font-mono">
                        <span className="text-slate-400 px-2 py-1 rounded bg-white/5">Assessments Matrix</span>
                        <span className="text-white px-2 py-1 rounded bg-terracotta-600 font-bold">★ Burden Heatmap</span>
                        <span className="text-slate-400 px-2 py-1 rounded bg-white/5">What-If Console</span>
                        <span className="text-slate-400 px-2 py-1 rounded bg-white/5">Simulation Funnel</span>
                      </div>

                      {/* 3 Key Metric Cards */}
                      <div className="grid grid-cols-3 gap-2.5 text-center">
                        <div className="bg-charcoal-900 border border-white/10 p-2.5 rounded-xl">
                          <span className="text-[9px] font-mono text-slate-400 block">DWELL TIME</span>
                          <span className="font-serif text-lg font-bold text-white">
                            {baselineNsclc ? `${baselineNsclc.total_clinic_hours} Hrs` : '—'}
                          </span>
                          <span className="text-[9px] text-red-400 block">
                            {baselineNsclc ? `${baselineNsclc.attrition_risk_tier} Friction` : 'Measured'}
                          </span>
                        </div>
                        <div className="bg-charcoal-900 border border-white/10 p-2.5 rounded-xl">
                          <span className="text-[9px] font-mono text-slate-400 block">INVASIVENESS</span>
                          <span className="font-serif text-lg font-bold text-amber-400">
                            {baselineNsclc ? `${baselineNsclc.total_biopsies} Biopsies` : '—'}
                          </span>
                          <span className="text-[9px] text-amber-300 block">
                            {baselineNsclc ? `Wk ${baselineNsclc.clause_diagnostics.biopsy.peak_week} Spike` : 'On-Treatment Peak'}
                          </span>
                        </div>
                        <div className="bg-charcoal-900 border border-white/10 p-2.5 rounded-xl">
                          <span className="text-[9px] font-mono text-slate-400 block">TRAVEL MILEAGE</span>
                          <span className="font-serif text-lg font-bold text-white">
                            {overview ? `${overview.cohort_averages.distance_miles} Mi` : '—'}
                          </span>
                          <span className="text-[9px] text-slate-300 block">Cohort Avg Distance</span>
                        </div>
                      </div>

                      {/* Schedule of Assessments Table preview */}
                      <div className="bg-charcoal-900 p-2.5 rounded-xl border border-white/10 font-mono text-[10px] space-y-1.5 overflow-x-auto">
                        <div className="grid grid-cols-5 text-slate-400 border-b border-white/10 pb-1 font-bold">
                          <span>Procedure</span>
                          <span>Screening</span>
                          <span>Cycle 1</span>
                          <span className="text-red-400">Week 12 (Biopsy)</span>
                          <span>Week 52</span>
                        </div>
                        <div className="grid grid-cols-5 text-slate-200">
                          <span>Serial PK Bloods</span>
                          <span className="text-emerald-400">✓ Done</span>
                          <span className="text-emerald-400">✓ Done</span>
                          <span className="text-amber-400 font-bold">⚠️ Dense PK</span>
                          <span className="text-emerald-400">✓ Done</span>
                        </div>
                        <div className="grid grid-cols-5 text-slate-200">
                          <span>Tumor Core Biopsy</span>
                          <span className="text-slate-500">—</span>
                          <span className="text-slate-500">—</span>
                          <span className="text-red-400 font-bold">⚠️ Invasive Peak</span>
                          <span className="text-slate-500">—</span>
                        </div>
                      </div>

                      <div className="bg-red-500/10 border border-red-500/20 p-2 rounded-lg text-xs font-mono text-red-300 flex items-center justify-between">
                        <span>Composite PBI Score (NSCLC):</span>
                        <span className="font-bold text-red-400">
                          {baselineNsclc ? `${baselineNsclc.composite_pbi_score} / 100 (${baselineNsclc.attrition_risk_tier})` : 'Evaluated Live in Studio'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Step 3: What-If Sensitivity Console & Retention Curve */}
                  {tourStep === 3 && (
                    <div className="space-y-3.5 animate-in fade-in duration-200">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Sliders Panel */}
                        <div className="bg-charcoal-900 p-3 rounded-xl border border-white/10 space-y-2.5 font-mono text-xs">
                          <span className="text-terracotta-300 font-bold block text-[11px]">INTERACTIVE PROTOCOL AMENDMENTS:</span>
                          
                          <div>
                            <div className="flex justify-between text-[11px]">
                              <span>Min eGFR Renal Cutoff:</span>
                              <span className="text-emerald-400 font-bold">50 mL/min (Was 60)</span>
                            </div>
                            <div className="h-1.5 w-full bg-white/10 rounded-full mt-1 overflow-hidden">
                              <div className="h-full bg-emerald-500 w-3/4 rounded-full" />
                            </div>
                            <span className="text-[10px] text-emerald-400 block mt-0.5">
                              {scenarios ? `+${scenarios.scenarioA.patientsGained} Qualified Candidates (DuckDB)` : 'Live DuckDB Candidate Gain'}
                            </span>
                          </div>

                          <div>
                            <div className="flex justify-between text-[11px]">
                              <span>Decentralized + Optional Biopsy:</span>
                              <span className="text-emerald-400 font-bold">Hybrid Schedule</span>
                            </div>
                            <div className="h-1.5 w-full bg-white/10 rounded-full mt-1 overflow-hidden">
                              <div className="h-full bg-emerald-500 w-1/3 rounded-full" />
                            </div>
                            <span className="text-[10px] text-emerald-400 block mt-0.5">
                              {scenarios?.scenarioB?.hoursReduced != null
                                ? `-${scenarios.scenarioB.hoursReduced} Hours Patient Dwell`
                                : 'Live Dwell Reduction'}
                            </span>
                          </div>
                        </div>

                        {/* Dual Retention Curve Preview */}
                        <div className="bg-charcoal-900 p-3 rounded-xl border border-white/10 font-mono text-xs space-y-2">
                          <span className="text-slate-400 font-bold block text-[11px]">52-WEEK RETENTION PROJECTION:</span>
                          <div className="space-y-1.5 text-[11px]">
                            <div className="flex justify-between items-center">
                              <span className="text-red-400">Baseline Protocol:</span>
                              <span className="text-red-400 font-bold">
                                {scenarios ? `${scenarios.baseline.retentionAt52}% Retention` : '—'}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-emerald-400">Optimized Protocol:</span>
                              <span className="text-emerald-400 font-bold">
                                {scenarios ? `${scenarios.scenarioB.retentionAt52}% Retention` : '—'}
                              </span>
                            </div>
                            <div className="flex justify-between items-center pt-1 border-t border-white/10">
                              <span className="text-white">Modeled PBI Reduction:</span>
                              <span className="text-emerald-300 font-bold">
                                {scenarios?.scenarioB?.pbiDelta != null ? `-${scenarios.scenarioB.pbiDelta} PBI Pts` : '—'}
                              </span>
                            </div>
                          </div>
                          <div className="h-8 bg-charcoal-950 rounded flex items-center justify-center text-[10px] text-emerald-400 border border-emerald-500/20">
                            <span>Dual Kaplan-Meier Retention Model Active</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-emerald-950/40 border border-emerald-500/30 p-2.5 rounded-xl font-mono text-[11px] text-emerald-300 flex items-center justify-between">
                        <span>Tamper-Evident SHA-256 Audit Ledger:</span>
                        <span className="font-bold text-emerald-400">
                          {overview ? `${overview.audit_events_count} Audited Events Recorded` : 'Verified Live via /audit/verify'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Step 4: Patient Portal Eligibility Screening & Audit */}
                  {tourStep === 4 && (
                    <div className="space-y-3 animate-in fade-in duration-200">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Clinical Profile Input Form Mockup */}
                        <div className="bg-charcoal-900 p-3 rounded-xl border border-white/10 space-y-2 font-mono text-xs">
                          <div className="flex justify-between items-center pb-1 border-b border-white/10">
                            <span className="text-slate-300 font-bold text-[11px]">PATIENT CLINICAL PROFILE</span>
                            <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30">DEMO ACTIVE</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-300">
                            <div>Age: <span className="text-white font-bold">62 yrs</span></div>
                            <div>ECOG: <span className="text-white font-bold">1 (Ambulatory)</span></div>
                            <div>Cancer Stage: <span className="text-white font-bold">Stage IV</span></div>
                            <div>eGFR: <span className="text-white font-bold">52 mL/min</span></div>
                          </div>
                          <p className="text-[10px] text-slate-400 pt-1">
                            Omitted labs remain unknown and evaluate safely without false positives.
                          </p>
                        </div>

                        {/* Screening Match Result Card */}
                        <div className="bg-charcoal-900 p-3 rounded-xl border border-emerald-500/40 space-y-1.5 font-mono text-xs">
                          <div className="flex justify-between items-center">
                            <span className="text-white font-bold text-[11px]">PS-ONC-2026-001</span>
                            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                              ✓ Potentially Eligible
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-300">Phase III Non-Small Cell Lung Cancer</p>
                          <div className="space-y-0.5 text-[10px] text-slate-300 pt-1 border-t border-white/10">
                            <p className="text-emerald-400">✓ Age ≥ 18 & Stage IV Matches</p>
                            <p className="text-emerald-400">✓ eGFR ≥ 50 Passes Amended Protocol</p>
                            <p className="text-emerald-400">✓ No Active Brain Metastases</p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl font-mono text-[10px] text-amber-200 flex items-center justify-between">
                        <span>Clinical Safety Invariant:</span>
                        <span className="text-amber-300">Requires Principal Investigator verification on-site</span>
                      </div>
                    </div>
                  )}

                </div>

              </div>

              {/* Right Column: Step-by-Step "How to Test Visually" Instructions (4 Cols) */}
              <div className="lg:col-span-4 bg-charcoal-950/80 border border-white/15 rounded-2xl p-4 sm:p-5 flex flex-col justify-between space-y-3 shadow-md">
                
                <div className="space-y-3">
                  <div className="flex items-center space-x-2 text-xs font-mono text-terracotta-400 border-b border-white/10 pb-2">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="font-bold uppercase tracking-wider">
                      {tourStep === 1 ? 'Testing PDF Ingestion' :
                       tourStep === 2 ? 'Testing Burden Heatmap' :
                       tourStep === 3 ? 'Testing What-If Sliders' :
                       'Testing Patient Screening'}
                    </span>
                  </div>

                  <h4 className="font-serif font-bold text-sm text-white leading-snug">
                    {tourStep === 1 ? 'Step 1: Ingesting Clinical Protocols' :
                     tourStep === 2 ? 'Step 2: Inspecting Patient Burden Heatmap' :
                     tourStep === 3 ? 'Step 3: Running What-If Sensitivity' :
                     'Step 4: Screening Patient Eligibility & Audit'}
                  </h4>

                  {/* Step Instructions */}
                  <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
                    {tourStep === 1 && (
                      <>
                        <p><strong className="text-white">1. Open Upload:</strong> Click <em>"Launch Feasibility Studio"</em> or <em>"Upload Protocol"</em> in the header.</p>
                        <p><strong className="text-white">2. Quick Test:</strong> Click the <strong>Phase III · NSCLC</strong> card to test immediately without needing a local PDF file.</p>
                        <p><strong className="text-white">3. Or Drop a File:</strong> Drag and drop any clinical PDF protocol to test the local PyMuPDF extraction engine.</p>
                        <p className="text-[11px] text-slate-400 font-mono pt-1">Result: Schedule of Assessments and restrictive criteria appear in ~3 seconds.</p>
                      </>
                    )}

                    {tourStep === 2 && (
                      <>
                        <p><strong className="text-white">1. Assessments Matrix:</strong> Open the Studio and review the visit-by-procedure matrix extracted from the PDF.</p>
                        <p><strong className="text-white">2. Burden Heatmap:</strong> Click the <strong>"Burden Heatmap"</strong> tab to see Tufts CSDD scoring broken down into dwell, invasiveness, and cognitive friction.</p>
                        <p><strong className="text-white">3. Spot Friction Spikes:</strong> Notice the red flag at Week 12 (mandatory repeat biopsy), indicating a high patient dropout risk.</p>
                      </>
                    )}

                    {tourStep === 3 && (
                      <>
                        <p><strong className="text-white">1. What-If Console:</strong> In Studio, click the <strong>"What-If Console"</strong> tab.</p>
                        <p><strong className="text-white">2. Relax eGFR Cutoff:</strong> Drag the renal slider to 50 mL/min to see candidate eligibility expand ({scenarios ? `+${scenarios.scenarioA.patientsGained} patients` : 'live count in DuckDB'}).</p>
                        <p><strong className="text-white">3. Add Telehealth:</strong> Increase the Telehealth slider to 30% to decentralize routine clinical visits.</p>
                        <p><strong className="text-white">4. Compare Curves:</strong> Watch 52-week retention move from {scenarios ? `${scenarios.baseline.retentionAt52}% to ${scenarios.scenarioB.retentionAt52}%` : 'baseline to optimized'} in real time.</p>
                      </>
                    )}

                    {tourStep === 4 && (
                      <>
                        <p><strong className="text-white">1. Patient Portal:</strong> Switch persona to "Patient" or click <strong>"Patient Portal"</strong> in the header.</p>
                        <p><strong className="text-white">2. Instant Demo:</strong> Click <strong>"Demo Mode"</strong> to populate oncology biomarkers with one click, or type your own values.</p>
                        <p><strong className="text-white">3. Screen Protocol:</strong> Click <strong>"Screen My Eligibility"</strong> to see matching trials and pass/fail reasons.</p>
                        <p><strong className="text-white">4. Verify Audit:</strong> Check the <strong>"Audit Trail"</strong> tab to confirm the SHA-256 cryptographic proof.</p>
                      </>
                    )}
                  </div>
                </div>

                {/* Direct Action Button to Test Live */}
                <div className="pt-2 border-t border-white/10 space-y-2">
                  <button
                    onClick={() => {
                      setIsTourOpen(false);
                      onLaunchStudio();
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-terracotta-600 hover:bg-terracotta-500 text-white font-semibold text-xs flex items-center justify-center space-x-1.5 transition-colors cursor-pointer shadow-md"
                  >
                    <span>{tourStep === 4 ? 'Launch Studio & Audit Trail' : 'Open Studio to Test Live'}</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                  <p className="text-[10px] text-slate-400 text-center font-mono">
                    All features run 100% locally with zero cloud API latency
                  </p>
                </div>

              </div>

            </div>

            {/* Modal Bottom Controls */}
            <div className="flex flex-wrap items-center justify-between border-t border-white/10 pt-3 text-xs gap-2">
              <div className="flex items-center space-x-2">
                <button
                  disabled={tourStep === 1}
                  onClick={() => {
                    setTourStep(p => Math.max(1, p - 1));
                    setTourProgress(0);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  Previous Step
                </button>

                <button
                  disabled={tourStep === 4}
                  onClick={() => {
                    setTourStep(p => Math.min(4, p + 1));
                    setTourProgress(0);
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  Next Step
                </button>
              </div>

              <div className="flex items-center space-x-1.5 font-mono text-[11px] text-slate-400">
                <span>Step {tourStep} of 4</span>
                <span>•</span>
                <span>{tourStep === 1 ? 'PDF Ingestion' : tourStep === 2 ? 'Burden Matrix' : tourStep === 3 ? 'What-If Sliders' : 'Patient Screening'}</span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setIsTourOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Close
                </button>

                <button
                  onClick={() => {
                    setIsTourOpen(false);
                    onLaunchStudio();
                  }}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors flex items-center space-x-1.5 cursor-pointer shadow-md"
                >
                  <span>Launch Studio Now</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};