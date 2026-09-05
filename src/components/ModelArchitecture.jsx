import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, Filter, Layers, GitMerge, Cpu, Sparkles, Boxes, Server, LayoutDashboard, ChevronDown } from 'lucide-react';

// Represents ChurnGuard's actual prediction pipeline. This is a conceptual
// visualization of the architecture — the frontend does not run these models
// itself; predictions shown elsewhere in the app are demo/mock data unless a
// real FastAPI backend is connected (see PROJECT_MEMORY.md).
const stages = [
  { icon: Database, label: 'Telco Dataset', detail: 'Raw customer & usage data' },
  { icon: Filter, label: 'Cleaning', detail: 'Missing values, duplicates' },
  { icon: Filter, label: 'Leakage Removal', detail: 'Drop target-leaking fields' },
  { icon: Layers, label: 'Scaling', detail: 'Normalize numeric features' },
  { icon: GitMerge, label: 'PSO / ACO Selection', detail: 'Swarm-based feature selection' },
  { icon: Cpu, label: 'TabNet', detail: 'Deep tabular prediction' },
  { icon: Sparkles, label: 'SHAP', detail: 'Per-customer explainability' },
  { icon: Boxes, label: 'Stacking Ensemble', detail: 'LightGBM · CatBoost · Random Forest · Logistic Regression' },
  { icon: Server, label: 'FastAPI', detail: 'Model serving layer' },
  { icon: LayoutDashboard, label: 'Dashboard', detail: 'This application' },
];

export default function ModelArchitecture({ defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 text-left cursor-pointer hover:bg-bg-tertiary/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
            <Cpu size={16} className="text-accent" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">How ChurnGuard's prediction pipeline works</p>
            <p className="text-xs text-text-tertiary mt-0.5">Data → Feature Selection → TabNet → SHAP → Stacking Ensemble → FastAPI</p>
          </div>
        </div>
        <ChevronDown size={16} className={`text-text-tertiary transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-5 pt-1 border-t border-border">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
                {stages.map((s, i) => (
                  <div key={s.label} className="flex flex-col items-center text-center gap-2 p-3 rounded-lg bg-bg-tertiary/30 border border-border/60">
                    <div className="w-9 h-9 rounded-lg bg-bg-elevated flex items-center justify-center">
                      <s.icon size={16} className="text-accent" />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-text-primary leading-tight">{s.label}</p>
                      <p className="text-[10px] text-text-tertiary leading-tight mt-0.5">{s.detail}</p>
                    </div>
                    <span className="text-[9px] text-text-tertiary font-mono">{i + 1}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-text-tertiary mt-4 leading-relaxed">
                This is a conceptual view of ChurnGuard's intended production architecture. In this prototype, predictions and SHAP values shown throughout the app are realistic demo data — connecting a live FastAPI backend swaps in real model output without changing this UI.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
