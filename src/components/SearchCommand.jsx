import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Users, BarChart3, Settings, ArrowRight } from 'lucide-react';
import { mockCustomers } from '../mock/customers';
import { cn, getRiskColor } from '../utils/helpers';

const quickLinks = [
  { label: 'Dashboard', path: '/dashboard', icon: BarChart3 },
  { label: 'Customer List', path: '/customers', icon: Users },
  { label: 'Risk Analytics', path: '/analytics', icon: BarChart3 },
  { label: 'Settings', path: '/settings', icon: Settings },
];

export default function SearchCommand({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) setQuery('');
  }, [isOpen]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return mockCustomers
      .filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.contactName.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [query]);

  const handleSelect = (path) => {
    navigate(path);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60]">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        <div className="flex items-start justify-center pt-[15vh]">
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="relative w-full max-w-xl mx-4 bg-bg-secondary border border-border rounded-xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 border-b border-border">
              <Search size={16} className="text-text-tertiary shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search customers, IDs, companies..."
                className="w-full py-3.5 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
              />
              <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-tertiary font-mono shrink-0">ESC</kbd>
            </div>

            <div className="max-h-80 overflow-y-auto p-2">
              {query.trim() ? (
                results.length > 0 ? (
                  <div className="space-y-0.5">
                    <div className="px-2 py-1.5 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Customers</div>
                    {results.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => handleSelect(`/customers/${c.id}`)}
                        className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm hover:bg-bg-tertiary transition-colors text-left cursor-pointer group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: getRiskColor(c.riskTier) }}
                          />
                          <div className="min-w-0">
                            <div className="text-text-primary font-medium truncate">{c.name}</div>
                            <div className="text-xs text-text-tertiary">{c.id} · {c.contactName}</div>
                          </div>
                        </div>
                        <ArrowRight size={14} className="text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-sm text-text-tertiary">
                    No results found for "{query}"
                  </div>
                )
              ) : (
                <div className="space-y-0.5">
                  <div className="px-2 py-1.5 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Quick Links</div>
                  {quickLinks.map((link) => (
                    <button
                      key={link.path}
                      onClick={() => handleSelect(link.path)}
                      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
                    >
                      <link.icon size={16} className="text-text-tertiary" />
                      {link.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
}
