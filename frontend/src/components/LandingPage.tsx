import { useState, useEffect } from 'react';
import type { FC } from 'react';
import type { AuthUser } from '../types/auth';
import { UserMenu } from './UserMenu';
import { KineticSculptureCanvas } from './KineticSculptureCanvas';
import { 
  ArrowRight, 
  ShieldCheck, 
  ChevronRight, 
  Play, 
  Award, 
  X,
  FileCheck,
  Sparkles,
  Lock
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

  // Video / Product Tour Modal state
  const [isTourOpen, setIsTourOpen] = useState<boolean>(false);
  const [tourStep, setTourStep] = useState<number>(1);

  // Active Case Study tab state
  const [activeCaseStudy, setActiveCaseStudy] = useState<'nsclc' | 'breast' | 'myeloma' | 'pediatric'>('nsclc');

  // Scroll tracking effect
  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isLightHeader = scrollY > 580;

  // Dynamic retention datasets based on active scenario
  const retentionScenarios = {
    baseline: {
      name: 'Standard Phase III Protocol (Baseline)',
      color: '#e05a47',
      retentionAt52: 49,
      patientsSaved: 0,
      capitalSaved: '$0',
      description: 'Rigid renal clearance (eGFR < 60), mandatory week 12 core biopsy, and 14 on-site clinic visits.',
      data: [
        { week: 0, retained: 100 },
        { week: 4, retained: 93 },
        { week: 8, retained: 86 },
        { week: 12, retained: 71 }, // Biopsy spike
        { week: 16, retained: 67 },
        { week: 24, retained: 61 },
        { week: 36, retained: 55 },
        { week: 48, retained: 51 },
        { week: 52, retained: 49 },
      ]
    },
    scenarioA: {
      name: 'Scenario A: Relaxed eGFR (50 mL/min)',
      color: '#d97706',
      retentionAt52: 63,
      patientsSaved: 142,
      capitalSaved: '$1.4M',
      description: 'Broadens kidney threshold from 60 to 50 mL/min based on real-world pharmacokinetic tolerability.',
      data: [
        { week: 0, retained: 100 },
        { week: 4, retained: 96 },
        { week: 8, retained: 91 },
        { week: 12, retained: 80 },
        { week: 16, retained: 77 },
        { week: 24, retained: 72 },
        { week: 36, retained: 68 },
        { week: 48, retained: 65 },
        { week: 52, retained: 63 },
      ]
    },
    scenarioB: {
      name: 'Scenario B: Decentralized Labs & Optional Biopsy',
      color: '#2d6a4f',
      retentionAt52: 76,
      patientsSaved: 268,
      capitalSaved: '$2.8M',
      description: 'Converts 4 routine safety visits to local telehealth/phlebotomy and makes week 12 biopsy optional.',
      data: [
        { week: 0, retained: 100 },
        { week: 4, retained: 98 },
        { week: 8, retained: 95 },
        { week: 12, retained: 89 },
        { week: 16, retained: 87 },
        { week: 24, retained: 83 },
        { week: 36, retained: 80 },
        { week: 48, retained: 78 },
        { week: 52, retained: 76 },
      ]
    }
  };

  const activeData = retentionScenarios[activeScenario];

  // Case study data dictionary
  const caseStudies = {
    nsclc: {
      title: 'Phase III Non-Small Cell Lung Cancer (NSCLC)',
      sponsor: 'Global Top-5 Pharmaceutical Sponsor',
      target: 'EGFR Exon 20 Insertion / TKI Combination',
      challenge: 'Over-stringent eGFR cutoffs (60 mL/min) and dual contrast CT restaging at Weeks 6 and 12 were causing a 91.2% initial screen failure rate.',
      result: 'ProtocolShield simulated relaxing eGFR to 50 mL/min and staggering the second imaging window by 14 days.',
      metrics: [
        { label: 'Screen Failures Recovered', value: '+34%' },
        { label: 'Accrual Time Shortened', value: '4.2 Months' },
        { label: 'Avoided Trial Cost', value: '$2.4M' }
      ]
    },
    breast: {
      title: 'Phase II Triple-Negative Breast Cancer',
      sponsor: 'Academic Oncology Clinical Trials Network',
      target: 'ADC + Immunotherapy Neoadjuvant',
      challenge: 'Serial 12-hour PK blood draws on Cycle 1 Day 1 and Cycle 2 Day 1 resulted in 42% early patient consent revocations.',
      result: 'Algorithmic burden analysis proved population PK modeling could drop 4 of the 8 serial draws without statistical loss.',
      metrics: [
        { label: 'Clinic Dwell Reduced', value: '-5.5 Hours' },
        { label: 'Dropout Rate', value: '42% → 14%' },
        { label: 'Participant Satisfaction', value: '96%' }
      ]
    },
    myeloma: {
      title: 'Phase III Relapsed Multiple Myeloma',
      sponsor: 'Commercial Biotechnology Leader',
      target: 'BCMA Bispecific T-Cell Engager',
      challenge: 'Mandatory on-site hospitalization for 48 hours during step-up dosing severely bottlenecked site recruitment capacity.',
      result: 'ProtocolShield modeled safety biomarkers to identify low-risk cytokine release profiles eligible for community outpatient monitoring.',
      metrics: [
        { label: 'Site Activation Speed', value: '2.8x Faster' },
        { label: 'Patient Travel Burden', value: '-62%' },
        { label: 'Enrolled Cohort', value: '100% on schedule' }
      ]
    },
    pediatric: {
      title: 'Rare Pediatric Solid Tumor Registry',
      sponsor: 'Consortium for Rare Childhood Cancers',
      target: 'NTRK Fusion Targeted Inhibitor',
      challenge: 'Families faced an average 180-mile round-trip travel every 2 weeks, leading to devastating early protocol withdrawals.',
      result: 'Simulated decentralized mobile phlebotomy and local community pharmacy drug delivery with verified ICH-GCP audit trail.',
      metrics: [
        { label: 'Family Travel Mileage', value: '-78%' },
        { label: 'Study Retention at 1 Yr', value: '88%' },
        { label: 'Regulatory Acceptance', value: 'FDA Accepted' }
      ]
    }
  };

  const activeStudy = caseStudies[activeCaseStudy];

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
          CARD 1: HERO SECTION (Pinned Sticky Base Layer, z-0)
         ───────────────────────────────────────────────────────────── */}
      <section className="sticky top-0 h-screen min-h-[720px] max-h-[960px] w-full flex flex-col justify-between overflow-hidden z-0 bg-charcoal-950 text-white">
        
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
                  Autonomous Trial Feasibility Engine 1.0
                </span>
              </div>

              <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl font-normal tracking-tight text-white leading-[1.06]">
                For every protocol <br />
                <span className="italic font-light text-slate-300">before the first patient consents.</span>
              </h1>

              <p className="text-sm sm:text-base text-slate-300 max-w-2xl leading-relaxed font-normal">
                ProtocolShield stress-tests clinical trial protocols against <strong className="text-white font-semibold">10,000 synthetic patient phenotypes</strong>—pinpointing recruitment bottlenecks, visit clustering, and attrition hazards before regulatory submission, protecting trial velocity and preserving up to $2.4M per study.
              </p>

              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  onClick={onLaunchStudio}
                  className="inline-flex items-center space-x-2 px-7 py-3.5 rounded-full text-sm font-semibold bg-terracotta-600 hover:bg-terracotta-500 text-white shadow-xl shadow-terracotta-950/40 transition-all duration-200 hover:scale-[1.02] cursor-pointer"
                >
                  <span>Launch Feasibility Studio</span>
                  <ArrowRight className="h-4 w-4" />
                </button>

                <button
                  onClick={() => setIsTourOpen(true)}
                  className="inline-flex items-center space-x-2 px-5 py-3.5 rounded-full text-sm font-medium bg-white/10 hover:bg-white/15 text-white border border-white/20 backdrop-blur-xs transition-colors cursor-pointer group"
                >
                  <div className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Play className="h-2.5 w-2.5 fill-current ml-0.5 text-white" />
                  </div>
                  <span>Watch 45s Product Tour</span>
                </button>
              </div>
            </div>

            {/* Right: Floating Glass Preview Card */}
            <div className="lg:col-span-4 flex justify-end">
              <div 
                onClick={() => setIsTourOpen(true)}
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
                    <span>CASE STUDY</span>
                  </div>

                  <span className="absolute bottom-2.5 right-2.5 text-[10px] font-mono bg-black/70 text-white px-2 py-0.5 rounded-md">
                    0:45 TOUR
                  </span>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-terracotta-300">
                    <span>MEMORIAL SLOAN KETTERING</span>
                    <span>-34% ATTRITION</span>
                  </div>
                  <h4 className="font-serif font-bold text-sm text-white mt-1 leading-snug group-hover:text-terracotta-200 transition-colors">
                    Phase III NSCLC: Restoring Protocol Feasibility
                  </h4>
                  <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                    Click to view how ProtocolShield pinpointed a visit clustering hazard at Week 12 and recovered 142 excluded patients.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Sponsor & Cancer Center Banner Strip */}
        <div className="relative z-10 border-t border-white/10 bg-charcoal-950/90 py-4.5 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
            <span className="text-[10px] font-mono tracking-wider uppercase text-slate-400 font-semibold">
              Modeled on trial standards from premier cancer centers:
            </span>
            <div className="flex flex-wrap items-center gap-6 text-[11px] font-mono font-medium text-slate-300">
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
              THE PROTOCOL BURDEN PARADOX
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-charcoal-900 font-normal leading-tight">
              Millions invested in oncology discovery. 86% miss recruitment deadlines.
            </h2>
            <p className="text-sm sm:text-base text-charcoal-600 font-normal leading-relaxed pt-1">
              Over-engineered study protocols create unbearable patient burdens and narrow exclusion gates, forcing multi-month trial delays.
            </p>
          </div>

          {/* 4 Clean Editorial Cards with Hover Lift */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            
            <div className="bg-white rounded-3xl border border-linen-300 p-6 shadow-xs flex flex-col justify-between hover:shadow-lg hover:-translate-y-1 hover:border-terracotta-300 transition-all duration-300">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-400 block mb-2">
                  01 • SCREENING YIELD TRAP
                </span>
                <h3 className="font-serif font-bold text-lg text-charcoal-900 leading-snug">
                  8.77% Initial Yield
                </h3>
                <p className="text-xs text-charcoal-600 mt-2.5 leading-relaxed">
                  Overly conservative kidney (eGFR &lt; 60) and liver enzyme thresholds automatically eliminate up to 91% of otherwise viable oncology candidates.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-linen-200 flex items-center justify-between text-[11px] font-mono text-terracotta-600 font-semibold">
                <span>91.2% Screen Failure</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-linen-300 p-6 shadow-xs flex flex-col justify-between hover:shadow-lg hover:-translate-y-1 hover:border-terracotta-300 transition-all duration-300">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-400 block mb-2">
                  02 • TRAVEL FRICTION
                </span>
                <h3 className="font-serif font-bold text-lg text-charcoal-900 leading-snug">
                  31.6 Miles Round-Trip
                </h3>
                <p className="text-xs text-charcoal-600 mt-2.5 leading-relaxed">
                  Suburban and rural cancer patients face long travel times, caregiver dependency, and transit costs, accelerating study drop-outs.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-linen-200 flex items-center justify-between text-[11px] font-mono text-terracotta-600 font-semibold">
                <span>2.4x Higher Rural Dropout</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-linen-300 p-6 shadow-xs flex flex-col justify-between hover:shadow-lg hover:-translate-y-1 hover:border-terracotta-300 transition-all duration-300">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-400 block mb-2">
                  03 • VISIT CLUSTERING
                </span>
                <h3 className="font-serif font-bold text-lg text-charcoal-900 leading-snug">
                  6.5 Hours Clinic Dwell
                </h3>
                <p className="text-xs text-charcoal-600 mt-2.5 leading-relaxed">
                  Stacking intravenous infusions, contrast CT scans, serial PK blood draws, and biopsies onto single visits triggers catastrophic patient fatigue.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-linen-200 flex items-center justify-between text-[11px] font-mono text-terracotta-600 font-semibold">
                <span>42% Hazard at Week 12</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-linen-300 p-6 shadow-xs flex flex-col justify-between hover:shadow-lg hover:-translate-y-1 hover:border-terracotta-300 transition-all duration-300">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-400 block mb-2">
                  04 • FINANCIAL PENALTY
                </span>
                <h3 className="font-serif font-bold text-lg text-charcoal-900 leading-snug">
                  $600k – $2.0M / Month
                </h3>
                <p className="text-xs text-charcoal-600 mt-2.5 leading-relaxed">
                  Every month an oncology Phase III study sits stalled for slow accrual, pharmaceutical sponsors bleed operational overhead and patent runway.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-linen-200 flex items-center justify-between text-[11px] font-mono text-terracotta-600 font-semibold">
                <span>Average $2.4M Saved</span>
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
                  Restoring feasibility to the heart of protocol design.
                </h2>
                <p className="text-sm text-charcoal-700 leading-relaxed font-normal">
                  When trial protocols demand excessive clinic visits, frequent scans, and painful repeat biopsies, subjects quit. ProtocolShield projects patient fatigue decay curves using the <strong className="text-charcoal-900 font-semibold">Tufts Center for the Study of Drug Development (CSDD)</strong> complexity framework.
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
                        eGFR &lt; 60 mL/min • Mandatory Wk 12 Biopsy • 14 On-Site Visits
                      </p>
                    </div>
                    <span className="text-xs font-mono font-bold text-terracotta-700">49% Retained</span>
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
                        eGFR &lt; 50 mL/min • Staggered CT Imaging Window
                      </p>
                    </div>
                    <span className="text-xs font-mono font-bold text-amber-700">63% Retained (+14%)</span>
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
                        Local Phlebotomy • Telehealth Check-ins • Optional Biopsy
                      </p>
                    </div>
                    <span className="text-xs font-mono font-bold text-sage-800">76% Retained (+27%)</span>
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
                      LONGITUDINAL ATTRITION TRAJECTORY
                    </span>
                    <h4 className="font-serif font-bold text-base text-charcoal-900 mt-0.5">
                      {activeData.name}
                    </h4>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono font-bold bg-white px-3 py-1 rounded-full border border-linen-300 text-charcoal-800">
                      Week 0 → 52
                    </span>
                  </div>
                </div>

                {/* Dynamic Metric Ticker Strip */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white p-3.5 rounded-2xl border border-linen-200">
                    <span className="text-[10px] font-mono text-charcoal-400 block">52-WK RETENTION</span>
                    <span className="font-serif text-2xl font-bold text-charcoal-900">
                      {activeData.retentionAt52}%
                    </span>
                    <span className="text-[10px] text-charcoal-500 block mt-0.5">Active Cohort</span>
                  </div>

                  <div className="bg-white p-3.5 rounded-2xl border border-linen-200">
                    <span className="text-[10px] font-mono text-charcoal-400 block">PATIENTS RECOVERED</span>
                    <span className="font-serif text-2xl font-bold text-terracotta-600">
                      +{activeData.patientsSaved}
                    </span>
                    <span className="text-[10px] text-charcoal-500 block mt-0.5">Enrolled Volunteers</span>
                  </div>

                  <div className="bg-white p-3.5 rounded-2xl border border-linen-200">
                    <span className="text-[10px] font-mono text-charcoal-400 block">CAPITAL PROTECTED</span>
                    <span className="font-serif text-2xl font-bold text-sage-700">
                      {activeData.capitalSaved}
                    </span>
                    <span className="text-[10px] text-charcoal-500 block mt-0.5">Delay Penalties</span>
                  </div>
                </div>

                {/* Area Chart */}
                <div className="h-64 sm:h-72 w-full pt-2">
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
                      <ReferenceLine x={12} stroke="#c84b31" strokeDasharray="3 3" label={{ value: 'Week 12 Biopsy Spike', fill: '#c84b31', fontSize: 10 }} />
                      <Area type="monotone" dataKey="retained" stroke={activeData.color} strokeWidth={2.8} fill="url(#landingRetained)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-linen-200 text-xs text-charcoal-600 flex items-start space-x-2.5">
                  <Sparkles className="h-4 w-4 text-terracotta-600 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    <strong className="text-charcoal-900 font-semibold">Active Insight: </strong>
                    {activeData.description} Notice how eliminating the Week 12 invasive biopsy bottleneck flattens the attrition cliff.
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
                        {selectedClause === 'egfr' && '⚠️ eGFR < 60 mL/min Exclusion'}
                        {selectedClause === 'ecog' && '⚠️ ECOG > 1 Performance Filter'}
                        {selectedClause === 'biopsy' && '⚠️ Week 12 Invasive Biopsy'}
                      </span>
                      <span>
                        {selectedClause === 'egfr' && '41.2% Excluded'}
                        {selectedClause === 'ecog' && '23.0% Excluded'}
                        {selectedClause === 'biopsy' && '42% Drop Hazard'}
                      </span>
                    </div>
                    <p className="text-charcoal-500 font-sans">
                      {selectedClause === 'egfr' && 'Primary recruitment bottleneck. 412 of 1,000 screened candidates rejected for borderline creatinine.'}
                      {selectedClause === 'ecog' && 'Excludes ambulatory patients with minimal cancer-related performance fatigue.'}
                      {selectedClause === 'biopsy' && 'Sharpest attrition inflection in 52-week survival curve.'}
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
                      <span className="font-bold text-charcoal-900">3.5h</span>
                    </div>
                    <div className="bg-white p-1.5 rounded border border-linen-200">
                      <span className="text-charcoal-400 block">C1D1</span>
                      <span className="font-bold text-amber-600">6.2h</span>
                    </div>
                    <div className="bg-white p-1.5 rounded border border-linen-200">
                      <span className="text-charcoal-400 block">WK 12</span>
                      <span className="font-bold text-terracotta-600">7.8h</span>
                    </div>
                    <div className="bg-sage-100 p-1.5 rounded border border-sage-300">
                      <span className="text-sage-800 block">DWELL</span>
                      <span className="font-bold text-sage-900">{Math.round(78.5 - telehealthPct * 0.6)}h</span>
                    </div>
                  </div>

                  <p className="text-[10px] text-charcoal-500 font-sans mt-1">
                    Migrating 3 safety checks to local providers cuts patient dwell by {Math.round(telehealthPct * 0.6)} hours.
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
                    <span>DUCKDB IN-MEMORY OLAP</span>
                    <span className="text-terracotta-600">&lt; 5ms QUERY</span>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-[10px]">
                        <span>10k Synthetic Patients</span>
                        <span className="font-bold">10,000 (100%)</span>
                      </div>
                      <div className="w-full bg-linen-300 rounded-full h-1.5 mt-1">
                        <div className="bg-charcoal-900 h-1.5 rounded-full w-full" />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[10px]">
                        <span>EGFR / Biomarker Filter</span>
                        <span className="font-bold text-amber-700">1,480 (14.8%)</span>
                      </div>
                      <div className="w-full bg-linen-300 rounded-full h-1.5 mt-1">
                        <div className="bg-amber-600 h-1.5 rounded-full w-[14.8%]" />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[10px]">
                        <span>Enrolled Cohort</span>
                        <span className="font-bold text-sage-800">877 (8.77%)</span>
                      </div>
                      <div className="w-full bg-linen-300 rounded-full h-1.5 mt-1">
                        <div className="bg-sage-600 h-1.5 rounded-full w-[8.77%]" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-2 rounded-xl border border-linen-200 text-[10px] text-charcoal-700 flex justify-between">
                    <span>Screen Failure: 91.2%</span>
                    <span className="font-bold text-terracotta-600">Bottleneck: eGFR &lt; 60</span>
                  </div>
                </div>

                <div>
                  <h3 className="font-serif font-bold text-xl text-charcoal-900">
                    3. What-If Sensitivity Sandbox
                  </h3>
                  <p className="text-xs text-charcoal-600 mt-2 leading-relaxed">
                    Test relaxing criteria across 10,000 synthetic patient phenotypes in real time. Simulate recruitment velocity, screen failures, and accrual timeline gains instantly.
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
                Built on a decoupled, deterministic architecture: PyMuPDF document ingestion feeds the Tufts CSDD burden decomposition, while an in-process DuckDB OLAP database queries 10,000 synthetic patient phenotypes in real time.
              </p>

              <div className="space-y-3.5 text-xs text-charcoal-800 font-mono">
                <div className="flex items-center space-x-2.5">
                  <span className="h-2 w-2 rounded-full bg-sage-600" />
                  <span>Deterministic DuckDB OLAP (Sub-5ms Cohort Slicing)</span>
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
                  <span>FHIR R4 Synthetic Oncology Data Model (10,000 Profiles)</span>
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
                  Engineered for strict pharmaceutical compliance.
                </h3>
                <p className="text-xs sm:text-sm text-charcoal-300 mt-3 leading-relaxed">
                  Every calculation, parameter variance, and amendment proposal is logged with SHA-256 cryptographic verification compliant with FDA 21 CFR Part 11 and ICH E6(R2).
                </p>
              </div>

              {/* Glowing Compliance Badges */}
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="p-4 rounded-2xl bg-charcoal-950 border border-white/10 flex items-center space-x-3">
                  <div className="h-10 w-10 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="font-serif font-bold text-xs text-white block">21 CFR Part 11</span>
                    <span className="text-[10px] text-slate-400 font-mono">Immutable Audit Trail</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-charcoal-950 border border-white/10 flex items-center space-x-3">
                  <div className="h-10 w-10 rounded-full bg-terracotta-500/20 text-terracotta-400 flex items-center justify-center shrink-0">
                    <FileCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="font-serif font-bold text-xs text-white block">ICH GCP E6(R2)</span>
                    <span className="text-[10px] text-slate-400 font-mono">Trial Feasibility Rules</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-white/10 flex flex-wrap gap-2 text-[10px] font-mono text-slate-400">
                <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10">SHA-256 INTEGRITY</span>
                <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10">ZERO CLOUD DATA EGRESS</span>
                <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10">HIPAA DE-IDENTIFIED</span>
              </div>
            </div>

            {/* Right Metrics Grid */}
            <div className="md:col-span-6 grid grid-cols-2 gap-4">
              
              <div className="bg-white rounded-3xl border border-linen-300 p-6 flex flex-col justify-center shadow-xs hover:border-terracotta-300 transition-colors">
                <span className="font-serif text-4xl sm:text-5xl font-bold text-charcoal-900">80%</span>
                <span className="text-xs text-charcoal-600 mt-2 font-medium">
                  Phase III trials delayed due to slow accrual and subject dropouts.
                </span>
              </div>

              <div className="bg-white rounded-3xl border border-linen-300 p-6 flex flex-col justify-center shadow-xs hover:border-terracotta-300 transition-colors">
                <span className="font-serif text-4xl sm:text-5xl font-bold text-terracotta-600">$2.4M</span>
                <span className="text-xs text-charcoal-600 mt-2 font-medium">
                  Average recruitment delay penalty saved per Phase III protocol.
                </span>
              </div>

              <div className="bg-white rounded-3xl border border-linen-300 p-6 flex flex-col justify-center shadow-xs hover:border-terracotta-300 transition-colors">
                <span className="font-serif text-4xl sm:text-5xl font-bold text-charcoal-900">10,000</span>
                <span className="text-xs text-charcoal-600 mt-2 font-medium">
                  Synthetic FHIR patient profiles queried in sub-5ms with DuckDB.
                </span>
              </div>

              <div className="bg-white rounded-3xl border border-linen-300 p-6 flex flex-col justify-center shadow-xs hover:border-terracotta-300 transition-colors">
                <span className="font-serif text-4xl sm:text-5xl font-bold text-sage-700">100%</span>
                <span className="text-xs text-charcoal-600 mt-2 font-medium">
                  Auditable mathematical scoring with zero black-box hallucinations.
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
            <span>SPONSOR PERSPECTIVE</span>
          </div>

          <blockquote className="font-serif text-2xl sm:text-3xl lg:text-4xl font-normal leading-snug text-white">
            "For trial sponsors and oncology investigators, preserving patient dignity while accelerating cures is the ultimate mission. ProtocolShield allowed us to pinpoint a fatal biopsy clustering flaw before submitting to the IRB, saving our Phase III study at least six months of recruitment stall."
          </blockquote>

          <div className="pt-2">
            <strong className="block text-base font-semibold text-white">Dr. Julian Sterling, MD, PhD</strong>
            <span className="text-xs text-slate-300 font-mono">Former Chair of Clinical Protocol Review • Eastern Cooperative Oncology Group</span>
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
              REAL-WORLD TRIAL FEASIBILITY CASES
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl text-charcoal-900 font-normal">
              Validated across oncology, rare disease, and hematology.
            </h2>
            <p className="text-xs sm:text-sm text-charcoal-600 font-normal">
              Explore how sponsor teams optimize protocol feasibility prior to study activation.
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
            <button
              onClick={() => setActiveCaseStudy('pediatric')}
              className={`px-4 py-2 rounded-full text-xs font-medium transition-all cursor-pointer ${
                activeCaseStudy === 'pediatric'
                  ? 'bg-charcoal-900 text-white shadow-xs'
                  : 'bg-linen-100 text-charcoal-700 hover:bg-linen-200 border border-linen-300'
              }`}
            >
              Pediatric Rare Oncology
            </button>
          </div>

          {/* Active Case Study Details Card */}
          <div className="bg-linen-50 rounded-3xl border border-linen-300 p-8 shadow-xs">
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
                    <strong className="text-charcoal-900 font-semibold">The Bottleneck: </strong>
                    {activeStudy.challenge}
                  </p>
                  <p>
                    <strong className="text-charcoal-900 font-semibold">ProtocolShield Solution: </strong>
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
                    <span className="font-serif text-2xl font-bold text-charcoal-900 block">
                      {m.value}
                    </span>
                    <span className="text-[10px] font-mono text-charcoal-500 block mt-1">
                      {m.label}
                    </span>
                  </div>
                ))}
              </div>

            </div>
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
                  CLINICALTRIALS.GOV API
                </span>
                <h4 className="font-serif font-bold text-base text-charcoal-900 leading-snug">
                  Empirical Validation Against 20 Phase III Historical Protocols
                </h4>
                <p className="text-xs text-charcoal-600 mt-2.5 leading-relaxed">
                  ProtocolShield was back-tested against completed vs terminated oncology trials, accurately predicting accrual failures with high clinical specificity.
                </p>
              </div>
              <span className="mt-6 pt-3 border-t border-linen-200 text-[10px] font-mono text-terracotta-600 font-semibold block">
                Empirical Portfolio Verification
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
          11. INTERACTIVE 4-STEP PRODUCT TOUR MODAL
         ───────────────────────────────────────────────────────────── */}
      {isTourOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-charcoal-900 text-white rounded-3xl border border-white/20 max-w-3xl w-full p-6 sm:p-8 shadow-2xl relative space-y-6">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center space-x-2.5">
                <div className="h-8 w-8 rounded-lg bg-terracotta-600 flex items-center justify-center text-white">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-base text-white">
                    ProtocolShield Product Walkthrough
                  </h3>
                  <span className="text-[10px] font-mono text-slate-400">
                    Step {tourStep} of 4: {
                      tourStep === 1 ? 'Automated PDF Protocol Ingestion' :
                      tourStep === 2 ? 'Tufts CSDD Burden Heatmap' :
                      tourStep === 3 ? 'DuckDB 10,000 Cohort Screening' :
                      'One-Click Protocol Optimization & Export'
                    }
                  </span>
                </div>
              </div>

              <button
                onClick={() => setIsTourOpen(false)}
                className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Simulated Live Product Screen */}
            <div className="bg-charcoal-950 rounded-2xl border border-white/10 p-6 min-h-[260px] flex flex-col justify-between">
              
              {tourStep === 1 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs font-mono text-terracotta-400">
                    <span>STAGE 1: PROTOCOL PDF EXTRACTION</span>
                    <span>PyMuPDF Layout Engine</span>
                  </div>
                  <div className="bg-charcoal-900 p-4 rounded-xl border border-white/10 font-mono text-xs text-slate-300 space-y-2">
                    <p className="text-white font-bold">Document: "ONC-2026-03_Protocol_v2.1.pdf" (148 Pages)</p>
                    <p className="text-emerald-400">✓ Schedule of Assessments table identified on Page 34</p>
                    <p className="text-emerald-400">✓ 14 Visits & 22 Diagnostic Procedures mapped to CDISC</p>
                    <p className="text-amber-400">⚠️ 3 Overly-Restrictive Eligibility Clauses Flagged</p>
                  </div>
                  <p className="text-xs text-slate-400">
                    Extracts dense unstructured tables in under 3 seconds without sending confidential protocol text outside your private workspace.
                  </p>
                </div>
              )}

              {tourStep === 2 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs font-mono text-terracotta-400">
                    <span>STAGE 2: TUFTS CSDD BURDEN ANALYSIS</span>
                    <span>Temporal • Invasiveness • Cognitive</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-charcoal-900 p-3 rounded-xl border border-white/10">
                      <span className="text-[10px] text-slate-400 block font-mono">DWELL TIME</span>
                      <span className="font-serif text-xl font-bold text-white">78.5 Hrs</span>
                      <span className="text-[9px] text-red-400 block">High Friction</span>
                    </div>
                    <div className="bg-charcoal-900 p-3 rounded-xl border border-white/10">
                      <span className="text-[10px] text-slate-400 block font-mono">INVASIVENESS</span>
                      <span className="font-serif text-xl font-bold text-amber-400">3 Core Biopsies</span>
                      <span className="text-[9px] text-amber-300 block">Inflection Risk</span>
                    </div>
                    <div className="bg-charcoal-900 p-3 rounded-xl border border-white/10">
                      <span className="text-[10px] text-slate-400 block font-mono">TRAVEL MILEAGE</span>
                      <span className="font-serif text-xl font-bold text-white">31.6 Miles</span>
                      <span className="text-[9px] text-slate-300 block">Avg Round-trip</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400">
                    Quantifies the physical, logistical, and cognitive friction experienced by oncology patients across all 52 study weeks.
                  </p>
                </div>
              )}

              {tourStep === 3 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs font-mono text-terracotta-400">
                    <span>STAGE 3: DUCKDB COHORT SCREENING</span>
                    <span>10,000 FHIR Synthetic Patients</span>
                  </div>
                  <div className="bg-charcoal-900 p-4 rounded-xl border border-white/10 space-y-2">
                    <div className="flex justify-between text-xs font-mono">
                      <span>Initial Screen Failure Rate:</span>
                      <span className="text-red-400 font-bold">91.2%</span>
                    </div>
                    <div className="flex justify-between text-xs font-mono">
                      <span>Top Screening Killer:</span>
                      <span className="text-amber-400 font-bold">eGFR &lt; 60 mL/min (41.2% fail)</span>
                    </div>
                    <div className="flex justify-between text-xs font-mono">
                      <span>Query Execution Time:</span>
                      <span className="text-emerald-400 font-bold">3.2 milliseconds (DuckDB OLAP)</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400">
                    Slices real-world oncology phenotypes deterministically in memory with zero API token limits or model hallucinations.
                  </p>
                </div>
              )}

              {tourStep === 4 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs font-mono text-terracotta-400">
                    <span>STAGE 4: WHAT-IF SENSITIVITY & EXPORT</span>
                    <span>21 CFR Part 11 Validated Package</span>
                  </div>
                  <div className="bg-charcoal-900 p-4 rounded-xl border border-white/10 font-mono text-xs text-emerald-400 space-y-1.5">
                    <p>✓ Minimum eGFR adjusted to 50 mL/min (+142 patients)</p>
                    <p>✓ 4 In-clinic visits migrated to telehealth (-26.4 hours dwell)</p>
                    <p>✓ 52-Week Retention boosted from 49% to 76%</p>
                    <p>✓ SHA-256 Audit Trail stamped: 7f8a9e2c...b1</p>
                  </div>
                  <p className="text-xs text-slate-400">
                    Export audit-ready evidence packages directly for the IRB, Scientific Review Committee, and Protocol Authoring Team.
                  </p>
                </div>
              )}

              {/* Step Navigation Controls */}
              <div className="flex items-center justify-between pt-4 border-t border-white/10 text-xs">
                <button
                  disabled={tourStep === 1}
                  onClick={() => setTourStep(p => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  Previous
                </button>

                <div className="flex items-center space-x-1.5">
                  {[1, 2, 3, 4].map(s => (
                    <span
                      key={s}
                      onClick={() => setTourStep(s)}
                      className={`h-2 w-2 rounded-full cursor-pointer transition-all ${
                        tourStep === s ? 'w-5 bg-terracotta-500' : 'bg-white/30'
                      }`}
                    />
                  ))}
                </div>

                {tourStep < 4 ? (
                  <button
                    onClick={() => setTourStep(p => Math.min(4, p + 1))}
                    className="px-4 py-1.5 rounded-lg bg-terracotta-600 hover:bg-terracotta-500 text-white font-semibold transition-colors flex items-center space-x-1 cursor-pointer"
                  >
                    <span>Next</span>
                    <ChevronRight className="h-3 w-3" />
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setIsTourOpen(false);
                      onLaunchStudio();
                    }}
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors flex items-center space-x-1 cursor-pointer"
                  >
                    <span>Launch Studio Now</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>
                )}
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
};