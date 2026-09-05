import { useState, useRef, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import {
  Shield, ArrowRight, Brain, LineChart, Mail, Zap, Lock, Users,
  BarChart3, TrendingDown, ChevronDown, CheckCircle, Sparkles, Database,
  Target, ShieldCheck, Globe, ChevronRight, Activity
} from 'lucide-react';
import Button from '../components/ui/Button';
import { cn } from '../utils/helpers';

// Heavy (three.js) — lazy-loaded so it never delays first paint of the hero
// text/CTAs, and skips itself on reduced-motion or small screens.
const Hero3DBackground = lazy(() => import('../components/Hero3DBackground'));

// Staggered fade in component
function FadeIn({ children, delay = 0, className = '', direction = 'up' }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-50px' });
  
  const yOffset = direction === 'up' ? 40 : direction === 'down' ? -40 : 0;
  const xOffset = direction === 'left' ? 40 : direction === 'right' ? -40 : 0;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: yOffset, x: xOffset }}
      animate={inView ? { opacity: 1, y: 0, x: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const pipelineSteps = [
  { icon: Database, label: 'Ingest Data', color: '#9BA3B8' },
  { icon: Brain, label: 'AI Prediction', color: '#86BC25' },
  { icon: BarChart3, label: 'Risk Scoring', color: '#F97316' },
  { icon: Sparkles, label: 'Explainability', color: '#FBBF24' },
  { icon: Target, label: 'Action Plan', color: '#4ADE80' },
  { icon: Mail, label: 'Outreach', color: '#86BC25' },
];

const features = [
  {
    icon: Brain,
    title: 'Predict with Precision',
    description: 'Proprietary ML models analyze hundreds of behavioral signals to predict churn probability with up to 94% accuracy.',
    color: '#F97316',
    glow: 'rgba(249, 115, 22, 0.15)'
  },
  {
    icon: Sparkles,
    title: 'Explain the "Why"',
    description: 'No black boxes. SHAP-based explainability reveals exactly which factors are driving each customer\'s specific risk score.',
    color: '#FBBF24',
    glow: 'rgba(251, 191, 36, 0.15)'
  },
  {
    icon: Mail,
    title: 'Act Instantly',
    description: 'AI-generated recommendations and perfectly drafted outreach emails empower your team to save accounts immediately.',
    color: '#4ADE80',
    glow: 'rgba(74, 222, 128, 0.15)'
  },
];

const faqs = [
  { q: 'How does ChurnGuard predict churn?', a: 'ChurnGuard uses advanced machine learning models trained on your historical customer data. It analyzes patterns in usage, engagement, support interactions, and other behavioral signals to predict churn probability for each customer.' },
  { q: 'What is SHAP-based explainability?', a: 'SHAP (SHapley Additive exPlanations) is a game theory approach to explain model predictions. It shows exactly how much each feature (e.g., login frequency, support tickets) contributes to a customer\'s churn risk score.' },
  { q: 'Can I use my own data?', a: 'Yes. ChurnGuard supports CSV and Excel uploads. After uploading your dataset, our column mapping interface helps you map your data fields to the required format. The platform then processes your data and generates predictions.' },
  { q: 'Are emails sent automatically?', a: 'No. ChurnGuard generates AI-powered email drafts, but every email requires human review and approval before sending. This ensures quality control and appropriate messaging for each customer.' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#090A0F] text-text-primary selection:bg-accent/30 selection:text-white font-sans overflow-x-hidden">
      
      {/* Decorative Background Glows.
          Rendered as radial gradients rather than `blur-[150px]` layers: a 150px
          filter blur on a half-viewport `fixed` element forces an expensive
          re-composite on every scroll frame (measured ~10fps scrolling on a
          throttled CPU). Gradients are visually equivalent here and essentially
          free. Do not reintroduce large blur radii on fixed/large elements. */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(60% 50% at 15% 0%, rgba(134,188,37,0.13) 0%, transparent 60%), ' +
            'radial-gradient(60% 55% at 90% 100%, rgba(30,58,138,0.13) 0%, transparent 60%)',
        }}
      />

      {/* Navigation */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-border/40 bg-[#090A0F]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-16 text-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl gradient-accent flex items-center justify-center shadow-[0_0_15px_rgba(134,188,37,0.4)]">
              <Shield size={16} className="text-bg-primary" />
            </div>
            <span className="font-bold tracking-widest text-white text-base">CHURNGUARD</span>
          </div>
          <div className="hidden md:flex items-center gap-8 font-medium">
            <a href="#features" className="text-text-secondary hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="text-text-secondary hover:text-white transition-colors">How It Works</a>
            <a href="#security" className="text-text-secondary hover:text-white transition-colors">Security</a>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/login" className="font-medium text-text-secondary hover:text-white transition-colors hidden sm:block">Sign In</Link>
            <Link to="/signup"><Button size="sm" className="shadow-[0_0_15px_rgba(134,188,37,0.3)] font-semibold">Start Free Trial</Button></Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden flex flex-col items-center text-center px-6 min-h-screen justify-start">
        <Suspense fallback={null}>
          <Hero3DBackground />
        </Suspense>

        <FadeIn delay={0.1} className="relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-bg-elevated/50 border border-border/50 text-text-secondary text-xs font-semibold uppercase tracking-widest mb-8 backdrop-blur-md">
            <Sparkles size={14} className="text-accent" />
            Deloitte Capstone 2026
          </div>
        </FadeIn>

        <FadeIn delay={0.2} className="max-w-5xl relative z-10">
          <h1 className="text-5xl md:text-7xl font-extrabold text-white tracking-tighter leading-[1.1] mb-6">
            Stop Churn Before <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent via-green-400 to-emerald-300">It Even Happens.</span>
          </h1>
        </FadeIn>

        <FadeIn delay={0.3} className="max-w-2xl relative z-10">
          <p className="text-lg md:text-xl text-text-secondary mb-10 leading-relaxed font-medium">
            AI-powered retention intelligence that predicts risk, explains the "why", and empowers your Customer Success team to take targeted action.
          </p>
        </FadeIn>

        <FadeIn delay={0.4} className="flex flex-col sm:flex-row items-center gap-4 mb-24 w-full justify-center relative z-10">
          <Link to="/signup">
            <Button size="xl" iconRight={ArrowRight} className="w-full sm:w-auto shadow-[0_0_30px_rgba(134,188,37,0.3)]">
              See ChurnGuard in Action
            </Button>
          </Link>
          <Link to="/login?demo=true">
            <Button variant="outline" size="xl" className="w-full sm:w-auto bg-bg-elevated/30 backdrop-blur-sm border-border hover:bg-bg-elevated/50">
              Explore Demo
            </Button>
          </Link>
        </FadeIn>

        {/* Hero Glass Pipeline */}
        <FadeIn delay={0.6} className="w-full max-w-5xl mx-auto relative z-10">
          <div className="relative p-1 rounded-3xl bg-gradient-to-b from-white/10 to-transparent">
            <div className="bg-[#12151C]/95 rounded-[23px] p-8 md:p-12 border border-white/5 shadow-2xl">
              <div className="flex flex-col md:flex-row items-center justify-between gap-8 md:gap-4 relative">
                {/* Connecting Line (Hidden on mobile for stack) */}
                <div className="hidden md:block absolute top-1/2 left-[5%] right-[5%] h-0.5 bg-gradient-to-r from-border via-accent/30 to-border -translate-y-1/2 z-0" />
                
                {pipelineSteps.map((step, i) => (
                  <div key={step.label} className="relative z-10 flex flex-col items-center gap-3 group">
                    <div 
                      className="w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center bg-[#1A1D27] border border-white/5 shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:-translate-y-1"
                      style={{ boxShadow: `0 8px 30px ${step.color}15` }}
                    >
                      <step.icon size={28} style={{ color: step.color }} className="opacity-90 group-hover:opacity-100" />
                    </div>
                    <span className="text-xs md:text-sm font-semibold text-text-secondary group-hover:text-white transition-colors">{step.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </FadeIn>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 md:py-32 relative z-10">
        <div className="max-w-7xl mx-auto px-6">
          <FadeIn className="text-center mb-20">
            <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight mb-4">Intelligence at Every Step</h2>
            <p className="text-lg text-text-secondary max-w-2xl mx-auto">An end-to-end pipeline designed specifically for enterprise Customer Success teams.</p>
          </FadeIn>

          <div className="grid md:grid-cols-3 gap-6 md:gap-8">
            {features.map((f, i) => (
              <FadeIn key={f.title} delay={i * 0.15}>
                <div className="h-full p-8 md:p-10 rounded-3xl bg-bg-card border border-border/50 hover:border-white/10 transition-all duration-500 group relative overflow-hidden flex flex-col items-center text-center">
                  {/* Hover Glow Effect */}
                  <div 
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                    style={{ background: `radial-gradient(circle at center, ${f.glow}, transparent 70%)` }}
                  />
                  
                  <div className="relative z-10">
                    <div 
                      className="w-16 h-16 rounded-2xl flex items-center justify-center mb-8 mx-auto transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-3"
                      style={{ backgroundColor: `${f.color}15`, border: `1px solid ${f.color}30` }}
                    >
                      <f.icon size={32} style={{ color: f.color }} />
                    </div>
                    <h3 className="text-xl md:text-2xl font-bold text-white mb-4">{f.title}</h3>
                    <p className="text-base text-text-secondary leading-relaxed">{f.description}</p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* Zig-Zag How It Works */}
      <section id="how-it-works" className="py-24 md:py-32 bg-[#12151C]/50 border-y border-white/5 relative z-10">
        <div className="max-w-6xl mx-auto px-6">
          <FadeIn className="text-center mb-24">
            <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight mb-4">How It Works</h2>
            <p className="text-lg text-text-secondary max-w-2xl mx-auto">From raw CRM data to personalized retention action in minutes.</p>
          </FadeIn>

          <div className="space-y-24 md:space-y-32">
            {[
              {
                step: '01',
                title: 'Connect & Ingest',
                desc: 'Upload your CSV/Excel files or connect directly to your CRM. ChurnGuard automatically maps your schema and sanitizes the data for modeling.',
                icon: Database,
                color: 'from-blue-500 to-cyan-400'
              },
              {
                step: '02',
                title: 'Predictive Modeling',
                desc: 'Our ensemble machine learning models analyze product usage, login frequency, support tickets, and contract data to predict the exact probability of churn.',
                icon: Activity,
                color: 'from-accent to-emerald-400'
              },
              {
                step: '03',
                title: 'Explainable AI',
                desc: 'Every risk score is backed by SHAP values. You will see exactly why a customer is at risk—whether it is a drop in engagement or an unresolved support ticket.',
                icon: Sparkles,
                color: 'from-amber-400 to-orange-500'
              }
            ].map((item, i) => (
              <div key={item.step} className={`flex flex-col ${i % 2 !== 0 ? 'md:flex-row-reverse' : 'md:flex-row'} items-center gap-12 md:gap-24`}>
                <FadeIn direction={i % 2 !== 0 ? 'left' : 'right'} className="flex-1 w-full relative">
                  <div className={`absolute inset-0 bg-gradient-to-br ${item.color} opacity-20 blur-3xl rounded-full`} />
                  <div className="relative aspect-[4/3] rounded-3xl bg-bg-card border border-white/10 shadow-2xl flex items-center justify-center overflow-hidden glass-light">
                    <item.icon size={80} className="text-white/80 drop-shadow-2xl" />
                  </div>
                </FadeIn>
                
                <FadeIn direction={i % 2 !== 0 ? 'right' : 'left'} className="flex-1 space-y-6">
                  <div className={`inline-flex font-mono text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r ${item.color}`}>
                    STEP {item.step}
                  </div>
                  <h3 className="text-3xl md:text-4xl font-bold text-white tracking-tight">{item.title}</h3>
                  <p className="text-lg text-text-secondary leading-relaxed font-medium">
                    {item.desc}
                  </p>
                </FadeIn>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Enterprise Security */}
      <section id="security" className="py-24 md:py-32 relative z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="bg-gradient-to-br from-[#12151C] to-[#0D0F13] rounded-[40px] p-8 md:p-16 border border-white/5 shadow-2xl overflow-hidden relative">
            {/* Background Pattern */}
            <div className="absolute top-0 right-0 w-1/2 h-full bg-[radial-gradient(circle_at_top_right,rgba(134,188,37,0.1),transparent_50%)]" />
            
            <div className="grid lg:grid-cols-2 gap-16 relative z-10 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-widest mb-6">
                  <Shield size={14} /> Enterprise Grade
                </div>
                <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight mb-6">Security & Compliance First.</h2>
                <p className="text-lg text-text-secondary mb-10 leading-relaxed font-medium">
                  Your customer data is protected with military-grade encryption. ChurnGuard is built from the ground up for enterprise compliance and strict data governance.
                </p>
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-6">
                  {[
                    { icon: Lock, text: 'End-to-End Encryption' },
                    { icon: ShieldCheck, text: 'Role-Based Access' },
                    { icon: Globe, text: 'SOC 2 Compliant (Pending)' },
                    { icon: Users, text: 'Human-in-the-loop AI' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-bg-elevated flex items-center justify-center shrink-0 border border-white/5 shadow-sm">
                        <item.icon size={18} className="text-blue-400" />
                      </div>
                      <span className="text-sm font-semibold text-white">{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative">
                <div
                  className="absolute inset-0 rounded-full pointer-events-none"
                  style={{ background: 'radial-gradient(closest-side, rgba(134,188,37,0.22), transparent 75%)' }}
                />
                <div className="relative p-10 md:p-14 rounded-3xl glass-light border border-white/10 flex flex-col justify-center items-center text-center shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent to-emerald-500 flex items-center justify-center mb-8 shadow-lg">
                    <ShieldCheck size={40} className="text-bg-primary" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-4">Human-in-the-Loop</h3>
                  <p className="text-base text-text-secondary leading-relaxed font-medium">
                    We believe AI should empower humans, not replace them. Every AI-generated outreach email requires explicit human review and approval before sending. No rogue automation.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 relative z-10 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-accent/5 pointer-events-none" />
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <FadeIn>
            <h2 className="text-4xl md:text-6xl font-extrabold text-white tracking-tighter mb-6">
              Ready to Save Your Revenue?
            </h2>
            <p className="text-xl text-text-secondary mb-12 font-medium">
              Join the future of Customer Success. Start predicting churn today.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/signup">
                <Button size="xl" iconRight={ArrowRight} className="w-full sm:w-auto shadow-[0_0_30px_rgba(134,188,37,0.3)]">
                  Get Started For Free
                </Button>
              </Link>
              <Link to="/login">
                <Button variant="outline" size="xl" className="w-full sm:w-auto border-white/20 hover:bg-white/5">
                  Sign In to Demo
                </Button>
              </Link>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-12 relative z-10 bg-[#06070A]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <Shield size={18} className="text-accent" />
              <span className="text-sm font-bold tracking-widest text-white">CHURNGUARD</span>
              <span className="text-xs text-text-tertiary ml-2 font-medium">Deloitte Capstone 2026</span>
            </div>
            <div className="flex flex-wrap justify-center items-center gap-8 text-sm font-medium text-text-tertiary">
              <a href="#" className="hover:text-white transition-colors">Platform</a>
              <a href="#" className="hover:text-white transition-colors">Pricing</a>
              <a href="#" className="hover:text-white transition-colors">Privacy</a>
              <a href="#" className="hover:text-white transition-colors">Terms</a>
            </div>
            <p className="text-sm text-text-tertiary font-medium">
              © 2026 ChurnGuard. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
