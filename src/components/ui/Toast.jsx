import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';

const icons = {
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
};

const colors = {
  success: 'border-risk-low/30 bg-risk-low/5 text-risk-low',
  warning: 'border-risk-medium/30 bg-risk-medium/5 text-risk-medium',
  error: 'border-risk-critical/30 bg-risk-critical/5 text-risk-critical',
  info: 'border-accent/30 bg-accent/5 text-accent',
};

export default function ToastContainer() {
  const { toasts, dispatch } = useApp();

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = icons[toast.type] || icons.info;
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className={`flex items-start gap-3 p-3.5 rounded-lg border backdrop-blur-sm ${colors[toast.type] || colors.info}`}
            >
              <Icon size={16} className="shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                {toast.title && <p className="text-sm font-medium text-text-primary">{toast.title}</p>}
                <p className="text-xs text-text-secondary">{toast.message}</p>
              </div>
              <button
                onClick={() => dispatch({ type: 'REMOVE_TOAST', payload: toast.id })}
                className="p-0.5 text-text-tertiary hover:text-text-primary cursor-pointer"
              >
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
