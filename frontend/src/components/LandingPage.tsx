import { useState } from 'react';
import type { FC } from 'react';
import { InteractiveGridCanvas } from './InteractiveGridCanvas';
import { 
  ArrowRight, 
  ShieldCheck, 
  ChevronRight
} from 'lucide-react';

interface LandingPageProps {
  onLaunchStudio: () => void;
  totalCohortSize: number;
}

export const LandingPage: FC<LandingPageProps> = ({ onLaunchStudio, totalCohortSize }) => {
  const [activeEvidence, setActiveEvidence] = useState<'egfr' | 'biopsy' | 'brain_mets'>('egfr');

  return (
    <div className="min-h-screen bg-linen-100 text-charcoal-900 font-sans selection:bg-terracotta-100 selection:text-terracotta-700 relative overflow-hidden">
      {/* Top Floating Navbar */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-linen-100/80 border-b border-linen-300">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-xl bg-charcoal-900 flex items-center justify-center text-white shadow-xs">
              <ShieldCheck className="h-5 w-5 text-terracotta-200" />
            </div>
            <div>
              <span className="font-serif font-bold text-lg tracking-tight text-charcoal-900">
                ProtocolShield
              </span>
              <span className="hidden sm:inline-block ml-2 text-[10px] font-mono px-2 py-0.5 rounded-full bg-linen-200 text-charcoal-700 border border-linen-300">
                STUDIO 1.0
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="hidden md:flex items-center space-x-1.5 text-xs text-charcoal-700 bg-linen-200/70 px-3 py-1.5 rounded-full border border-linen-300">
              <span className="h-2 w-2 rounded-full bg-sage-600 animate-pulse" />
              <span>DuckDB Active:</span>
              <strong className="font-mono text-charcoal-900">{totalCohortSize.toLocaleString()} patients</strong>
            </div>

            <button
              onClick={onLaunchStudio}
              className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold rounded-full bg-charcoal-900 hover:bg-charcoal-800 text-white shadow-xs transition-all duration-200 hover:translate-x-0.5"
            >
              <span>Launch Studio</span>
              <ArrowRight className="h-3.5 w-3.5 text-terracotta-200" />
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section with Interactive Cursor-Reactive Background */}
      <section className="relative pt-16 pb-20 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto text-center">
        {/* Cursor Reactive Floating Micro-Blocks Canvas */}
        <div className="absolute inset-0 h-[480px] overflow-hidden -z-0 pointer-events-auto">
          <InteractiveGridCanvas />
        </div>

        {/* Hero Content (Floating Above Interactive Canvas) */}
        <div className="relative z-10 max-w-3xl mx-auto space-y-6 pointer-events-none">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/90 border border-linen-300 text-xs font-medium text-charcoal-700 shadow-2xs backdrop-blur-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-terracotta-600" />
            <span>Autonomous Clinical Trial Feasibility & Attrition Synthesizer</span>
          </div>

          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-normal tracking-tight text-charcoal-950 leading-[1.12]">
            Stop designing clinical trials that fail before they start.
          </h1>

          <p className="text-base sm:text-lg text-charcoal-700 leading-relaxed max-w-2xl mx-auto font-normal">
            Over 80% of Phase III trials suffer multi-month delays or outright termination due to over-engineered schedules and rigid eligibility. ProtocolShield simulates real-world patient friction against <strong className="text-charcoal-900 font-semibold">10,000 synthetic patient records</strong> before millions are committed.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3 pointer-events-auto">
            <button
              onClick={onLaunchStudio}
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-6 py-3 text-sm font-semibold rounded-full bg-charcoal-900 hover:bg-charcoal-800 text-white shadow-sm transition-all duration-200 hover:scale-[1.02]"
            >
              <span>Launch Feasibility Studio</span>
              <ArrowRight className="h-4 w-4 text-terracotta-200" />
            </button>

            <a
              href="#interactive-evidence"
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-5 py-3 text-sm font-medium rounded-full bg-white/90 hover:bg-white text-charcoal-800 border border-linen-300 shadow-2xs transition-all duration-200"
            >
              <span>Explore Linked Evidence</span>
              <ChevronRight className="h-4 w-4 text-charcoal-500" />
            </a>
          </div>
        </div>
      </section>

      {/* Upward-Sliding Interactive Evidence Showcase */}
      <section id="interactive-evidence" className="relative z-20 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="text-center mb-6 space-y-1">
          <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-terracotta-600 block">
            THE LINKED EVIDENCE ENGINE
          </span>
          <h2 className="font-serif text-2xl sm:text-3xl text-charcoal-900 font-normal">
            Every predicted risk is mathematically tied to the source protocol.
          </h2>
          <p className="text-xs text-charcoal-600 max-w-lg mx-auto">
            Click any clinical bottleneck below to see the protocol document dynamically highlight the exact ground-truth clause.
          </p>
        </div>

        {/* Interactive Linked Evidence Showcase Container */}
        <div className="bg-white rounded-2xl border border-linen-300 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          {/* Top Switcher Bar */}
          <div className="p-3 bg-linen-200/60 border-b border-linen-300 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-mono font-semibold text-charcoal-500 uppercase">Interactive Flags:</span>
              <div className="flex space-x-2">
                <button
                  onClick={() => setActiveEvidence('egfr')}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    activeEvidence === 'egfr'
                      ? 'bg-charcoal-900 text-white shadow-xs'
                      : 'bg-white text-charcoal-700 border border-linen-300 hover:bg-linen-100'
                  }`}
                >
                  1. Renal Clearance Cutoff
                </button>
                <button
                  onClick={() => setActiveEvidence('biopsy')}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    activeEvidence === 'biopsy'
                      ? 'bg-charcoal-900 text-white shadow-xs'
                      : 'bg-white text-charcoal-700 border border-linen-300 hover:bg-linen-100'
                  }`}
                >
                  2. Week 12 Biopsy Spike
                </button>
                <button
                  onClick={() => setActiveEvidence('brain_mets')}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    activeEvidence === 'brain_mets'
                      ? 'bg-charcoal-900 text-white shadow-xs'
                      : 'bg-white text-charcoal-700 border border-linen-300 hover:bg-linen-100'
                  }`}
                >
                  3. CNS Metastases Exclusion
                </button>
              </div>
            </div>

            <span className="text-[11px] font-mono text-charcoal-500">
              Protocol: PS-ONC-2026-001 (Phase III NSCLC)
            </span>
          </div>

          {/* Split View: Ground-Truth Document (Left) + AI Feasibility Finding (Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-linen-300">
            {/* Left: Publication-Grade Protocol Document (7 cols) */}
            <div className="lg:col-span-7 p-6 bg-linen-50/50 space-y-4 text-xs leading-relaxed">
              <div className="flex items-center justify-between pb-3 border-b border-linen-200">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-charcoal-500 block">
                    Source Document Excerpt (PDF Page 48)
                  </span>
                  <h3 className="font-serif font-bold text-sm text-charcoal-900">
                    Section 4.2 Study Eligibility & Schedule of Events
                  </h3>
                </div>
                <span className="text-[10px] font-mono bg-linen-200 px-2 py-0.5 rounded text-charcoal-700">
                  CONFIDENTIAL
                </span>
              </div>

              {/* Protocol Prose with Dynamic Linked Highlights */}
              <div className="space-y-3 text-charcoal-800 font-serif">
                <p>
                  <strong>4.2.1 Inclusion Criteria:</strong> Patients eligible for enrollment in this Phase III double-blind study must have histologically confirmed metastatic Non-Small Cell Lung Cancer (Stage IV) with measurable lesions per RECIST v1.1.
                </p>

                {/* Highlightable Sentence 1: eGFR */}
                <div 
                  className={`p-3 rounded-xl transition-all duration-300 ${
                    activeEvidence === 'egfr'
                      ? 'bg-terracotta-50 border-2 border-terracotta-500 shadow-xs'
                      : 'bg-white border border-linen-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono font-bold mb-1">
                    <span className="text-charcoal-500">Criterion 4.2.1 (c) — Renal Function</span>
                    {activeEvidence === 'egfr' && (
                      <span className="px-1.5 py-0.2 rounded bg-terracotta-600 text-white">
                        LINKED EVIDENCE: RECRUITMENT BOTTLENECK
                      </span>
                    )}
                  </div>
                  <p className="text-charcoal-900">
                    "Adequate organ and marrow function defined as Absolute Neutrophil Count (ANC) ≥ 1,500/µL, Platelet count ≥ 100,000/µL, and <strong className="bg-terracotta-200/80 px-1 py-0.5 rounded">estimated Glomerular Filtration Rate (eGFR) ≥ 60 mL/min/1.73m²</strong>."
                  </p>
                </div>

                {/* Highlightable Sentence 2: Biopsy */}
                <div 
                  className={`p-3 rounded-xl transition-all duration-300 ${
                    activeEvidence === 'biopsy'
                      ? 'bg-terracotta-50 border-2 border-terracotta-500 shadow-xs'
                      : 'bg-white border border-linen-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono font-bold mb-1">
                    <span className="text-charcoal-500">Schedule of Assessments (Table 5 — Week 12)</span>
                    {activeEvidence === 'biopsy' && (
                      <span className="px-1.5 py-0.2 rounded bg-terracotta-600 text-white">
                        LINKED EVIDENCE: PEAK FATIGUE SPIKE
                      </span>
                    )}
                  </div>
                  <p className="text-charcoal-900">
                    "At Week 12 (Cycle 5 Day 1), participants shall undergo contrast-enhanced chest CT scan, mandatory 6-hour pharmacokinetic draws, and <strong className="bg-terracotta-200/80 px-1 py-0.5 rounded">a mandatory on-treatment core needle tumor re-biopsy</strong>."
                  </p>
                </div>

                {/* Highlightable Sentence 3: Brain Mets */}
                <div 
                  className={`p-3 rounded-xl transition-all duration-300 ${
                    activeEvidence === 'brain_mets'
                      ? 'bg-terracotta-50 border-2 border-terracotta-500 shadow-xs'
                      : 'bg-white border border-linen-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono font-bold mb-1">
                    <span className="text-charcoal-500">Criterion 4.2.2 (b) — Central Nervous System</span>
                    {activeEvidence === 'brain_mets' && (
                      <span className="px-1.5 py-0.2 rounded bg-terracotta-600 text-white">
                        LINKED EVIDENCE: POPULATION FALLOUT
                      </span>
                    )}
                  </div>
                  <p className="text-charcoal-900">
                    "Exclusion: Presence of any active, untreated, or <strong className="bg-terracotta-200/80 px-1 py-0.5 rounded">prior treated asymptomatic central nervous system (CNS) metastases</strong>."
                  </p>
                </div>
              </div>
            </div>

            {/* Right: AI Synthesized Finding & Live What-If Lift (5 cols) */}
            <div className="lg:col-span-5 p-6 bg-white space-y-5 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-terracotta-600 block">
                  SYNTHESIZED FEASIBILITY INSIGHT
                </span>

                {activeEvidence === 'egfr' && (
                  <div className="mt-2 space-y-3">
                    <h4 className="font-serif text-lg font-bold text-charcoal-900">
                      Rigid eGFR Cutoff Disqualifies 18.4% of Target Candidates
                    </h4>
                    <p className="text-xs text-charcoal-700 leading-relaxed font-sans">
                      Our engine vectorized this rule against 10,000 synthetic patient records. Because metastatic lung cancer disproportionately affects patients over 65, an eGFR cutoff of 60 mL/min arbitrarily eliminates viable subjects who have safe, stable mild renal variance (eGFR 50–59).
                    </p>
                    <div className="p-3 bg-sage-50 rounded-xl border border-sage-200">
                      <span className="text-[11px] font-mono font-bold text-sage-800 block">
                        WHAT-IF RECOMMENDATION:
                      </span>
                      <p className="text-xs text-sage-700 mt-0.5">
                        Relaxing cutoff to <strong className="text-sage-800">eGFR ≥ 50 mL/min</strong> immediately unlocks <strong className="text-sage-800 font-bold">+133 eligible patients (+15.2% yield boost)</strong> without compromising oncology safety margins.
                      </p>
                    </div>
                  </div>
                )}

                {activeEvidence === 'biopsy' && (
                  <div className="mt-2 space-y-3">
                    <h4 className="font-serif text-lg font-bold text-charcoal-900">
                      Week 12 Stacks 6.5 Hours of Clinical Dwell Time
                    </h4>
                    <p className="text-xs text-charcoal-700 leading-relaxed font-sans">
                      Week 12 demands an IV infusion, contrast CT scan, and invasive core needle biopsy on the exact same day. Under the Tufts CSDD complexity model, this visit creates a <strong>42% drop-out hazard</strong> due to physical exhaustion and post-procedure recovery friction.
                    </p>
                    <div className="p-3 bg-terracotta-50 rounded-xl border border-terracotta-200">
                      <span className="text-[11px] font-mono font-bold text-terracotta-700 block">
                        PROTOCOL AMENDMENT PROPOSAL:
                      </span>
                      <p className="text-xs text-terracotta-700 mt-0.5">
                        Decouple the biopsy window by ±7 days or convert to circulating tumor DNA (ctDNA) liquid biopsy to reduce visit dwell from 6.5 hours to 1.5 hours.
                      </p>
                    </div>
                  </div>
                )}

                {activeEvidence === 'brain_mets' && (
                  <div className="mt-2 space-y-3">
                    <h4 className="font-serif text-lg font-bold text-charcoal-900">
                      Blanket CNS Exclusion Disqualifies 24% of Stage IV NSCLC
                    </h4>
                    <p className="text-xs text-charcoal-700 leading-relaxed font-sans">
                      Up to one-fourth of metastatic lung cancer patients present with stable, treated brain metastases. Excluding stable patients starves the trial of recruitment volume and delays primary study completion by an estimated <strong>5.4 months</strong>.
                    </p>
                    <div className="p-3 bg-sage-50 rounded-xl border border-sage-200">
                      <span className="text-[11px] font-mono font-bold text-sage-800 block">
                        WHAT-IF RECOMMENDATION:
                      </span>
                      <p className="text-xs text-sage-700 mt-0.5">
                        Permit stable, treated, asymptomatic lesions (steroid-free for over 14 days) to recover <strong>+180 viable candidates</strong>.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-linen-300 flex items-center justify-between">
                <span className="text-xs text-charcoal-500 font-mono">10,000 Patient Cohort Model</span>
                <button
                  onClick={onLaunchStudio}
                  className="inline-flex items-center space-x-1.5 text-xs font-semibold text-charcoal-900 hover:text-terracotta-600 transition-colors"
                >
                  <span>Open in Full Studio</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Enterprise ROI & Impact Metrics Strip */}
      <section className="bg-linen-200/50 border-y border-linen-300 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-6 text-center">
          <div>
            <span className="font-serif text-3xl sm:text-4xl font-bold text-charcoal-900 block">80%</span>
            <span className="text-xs text-charcoal-600 mt-1 block">
              Trials delayed or terminated due to protocol over-engineering
            </span>
          </div>

          <div>
            <span className="font-serif text-3xl sm:text-4xl font-bold text-terracotta-600 block">$2.4M</span>
            <span className="text-xs text-charcoal-600 mt-1 block">
              Average recruitment delay penalty avoided per Phase III study
            </span>
          </div>

          <div>
            <span className="font-serif text-3xl sm:text-4xl font-bold text-charcoal-900 block">10,000</span>
            <span className="text-xs text-charcoal-600 mt-1 block">
              Synthetic FHIR patient profiles sliced in sub-5ms via DuckDB
            </span>
          </div>

          <div>
            <span className="font-serif text-3xl sm:text-4xl font-bold text-sage-700 block">100%</span>
            <span className="text-xs text-charcoal-600 mt-1 block">
              Auditable mathematical scoring calibrated to Tufts CSDD index
            </span>
          </div>
        </div>
      </section>

      {/* Bottom CTA Card */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto text-center">
        <div className="bg-charcoal-900 text-white rounded-3xl p-8 sm:p-12 shadow-xl space-y-5">
          <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-terracotta-200 block">
            ENTERPRISE CLINICAL FEASIBILITY
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl font-normal leading-tight">
            Stress-test your trial protocol before spending $50M.
          </h2>
          <p className="text-sm text-charcoal-100 max-w-xl mx-auto leading-relaxed">
            Experience the full split-screen studio: live Schedule of Assessments matrix, real-time What-If sensitivity sliders, and ClinicalTrials.gov historical benchmarks.
          </p>
          <div className="pt-2">
            <button
              onClick={onLaunchStudio}
              className="inline-flex items-center space-x-2 px-6 py-3 text-sm font-semibold rounded-full bg-white text-charcoal-900 hover:bg-linen-100 shadow-sm transition-all duration-200 hover:scale-[1.02]"
            >
              <span>Enter ProtocolShield Studio</span>
              <ArrowRight className="h-4 w-4 text-terracotta-600" />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-linen-300 py-6 px-4 sm:px-6 lg:px-8 text-center text-xs text-charcoal-500">
        <p>ProtocolShield Platform • Autonomous Clinical Trial Feasibility & Patient Attrition Synthesizer</p>
        <p className="text-[11px] text-charcoal-400 mt-1 font-mono">Calibrated to Tufts CSDD Metrics • In-Memory DuckDB OLAP Engine</p>
      </footer>
    </div>
  );
};
