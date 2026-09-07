import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronUp, ChevronDown, Brain, Mail, Users, AlertTriangle, X } from 'lucide-react';
import Card from '../components/ui/Card';
import { RiskBadge, StatusBadge } from '../components/ui/Badge';
import Select from '../components/ui/Select';
import Pagination from '../components/ui/Pagination';
import EmptyState from '../components/ui/EmptyState';
import { InfoTip } from '../components/ui/Tooltip';
import { SkeletonTable } from '../components/ui/Skeleton';
import { customerService } from '../services/api';
import { formatCurrency } from '../utils/helpers';
import { metric } from '../utils/glossary';

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [risk, setRisk] = useState(() => new URLSearchParams(window.location.search).get('risk') || 'all');
  const [status, setStatus] = useState('all');
  const [sortBy, setSortBy] = useState('churnProbability');
  const [sortDir, setSortDir] = useState('desc');
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const navigate = useNavigate();

  // Typing shouldn't fire a request per keystroke; the debounced value is what
  // the fetch effect below actually depends on.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await customerService.getCustomers({
        search: debouncedSearch, risk, status, page, limit: 10, sortBy, sortDir,
      });
      setCustomers(data.customers);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setError(false);
    } catch {
      setError(true);
    }
    setLoading(false);
  }, [debouncedSearch, risk, status, page, sortBy, sortDir]);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  const activeFilters = [
    risk !== 'all' && { key: 'risk', label: `Risk: ${risk}`, clear: () => setRisk('all') },
    status !== 'all' && { key: 'status', label: `Status: ${status}`, clear: () => setStatus('all') },
    debouncedSearch && { key: 'search', label: `Search: "${debouncedSearch}"`, clear: () => setSearch('') },
  ].filter(Boolean);

  const clearFilters = () => {
    setRisk('all');
    setStatus('all');
    setSearch('');
    setPage(1);
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  };

  const toggleSelect = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selected.length === customers.length) setSelected([]);
    else setSelected(customers.map(c => c.id));
  };

  const SortIcon = ({ field }) => {
    if (sortBy !== field) return null;
    return sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  };

  const columns = [
    { key: 'id', label: 'Customer ID', sortable: true },
    { key: 'tenure', label: 'Tenure', sortable: true, help: metric('tenure').help },
    { key: 'monthlyCharges', label: 'Monthly Charges', sortable: true, help: metric('monthlyCharges').help },
    { key: 'contractType', label: 'Contract', sortable: true, help: metric('contractType').help },
    { key: 'churnProbability', label: 'Churn Risk', sortable: true, help: metric('churnProbability').help },
    { key: 'riskTier', label: 'Risk Tier', sortable: false, help: metric('riskTier').help },
    { key: 'status', label: 'Status', sortable: false, help: metric('status').help },
  ];

  return (
    <div className="space-y-6">
      <header className="max-w-3xl">
        <h1 className="text-xl font-bold text-text-primary tracking-tight">Customers</h1>
        <p className="text-sm text-text-secondary mt-1 leading-relaxed">
          Every account in your dataset with its current churn risk. Sort by any column, filter to a segment, or open
          an account to see why it's scored the way it is.
        </p>
      </header>

      {/* Filters */}
      <Card padding={false}>
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label htmlFor="customer-search" className="block text-[10px] uppercase tracking-wide text-text-tertiary mb-1">
                Search
              </label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" aria-hidden="true" />
                <input
                  id="customer-search"
                  type="search"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Customer ID"
                  className="w-full pl-9 pr-3 py-2.5 bg-bg-tertiary/50 border border-border rounded-lg text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent transition-colors"
                />
              </div>
            </div>
            <Select
              label="Risk tier"
              value={risk}
              onChange={(e) => { setRisk(e.target.value); setPage(1); }}
              options={[
                { value: 'all', label: 'All risk tiers' },
                { value: 'critical', label: 'Critical (80%+)' },
                { value: 'high', label: 'High (60–79%)' },
                { value: 'medium', label: 'Medium (35–59%)' },
                { value: 'low', label: 'Low (under 35%)' },
              ]}
              placeholder=""
            />
            <Select
              label="Account status"
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              options={[
                { value: 'all', label: 'All statuses' },
                { value: 'active', label: 'Active' },
                { value: 'at-risk', label: 'At risk' },
              ]}
              placeholder=""
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap min-h-[24px]" aria-live="polite">
            <span className="text-xs text-text-tertiary">
              {loading ? 'Loading…' : `${total} ${total === 1 ? 'account' : 'accounts'} match`}
            </span>
            {activeFilters.map((f) => (
              <button
                key={f.key}
                onClick={() => { f.clear(); setPage(1); }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border bg-bg-tertiary/50 text-[11px] text-text-secondary hover:text-text-primary hover:border-border-light transition-colors cursor-pointer"
              >
                {f.label}
                <X size={11} aria-hidden="true" />
                <span className="sr-only">Remove this filter</span>
              </button>
            ))}
            {activeFilters.length > 1 && (
              <button onClick={clearFilters} className="text-[11px] text-accent hover:underline cursor-pointer">
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="p-5"><SkeletonTable rows={8} cols={9} /></div>
        ) : error ? (
          <EmptyState
            icon={AlertTriangle}
            title="We couldn't load your customers"
            description="The customer list didn't come back. Your dataset is still connected — this is usually temporary."
            actionLabel="Try again"
            action={loadCustomers}
          />
        ) : customers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No accounts match these filters"
            description={
              activeFilters.length > 0
                ? 'Nothing in your dataset matches every filter at once. Clearing one usually helps.'
                : 'Your dataset has no customer records to show.'
            }
            actionLabel={activeFilters.length > 0 ? 'Clear all filters' : undefined}
            action={activeFilters.length > 0 ? clearFilters : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Customer accounts with churn risk and account health</caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="px-4 py-2.5 w-10">
                    <input
                      type="checkbox"
                      checked={selected.length === customers.length && customers.length > 0}
                      onChange={toggleSelectAll}
                      aria-label="Select all accounts on this page"
                      className="rounded border-border"
                    />
                  </th>
                  {columns.map(col => (
                    <th
                      key={col.key}
                      scope="col"
                      aria-sort={sortBy === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                      className="px-4 py-2.5 text-left text-xs font-semibold text-text-tertiary uppercase tracking-wider"
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.sortable ? (
                          <button
                            type="button"
                            onClick={() => handleSort(col.key)}
                            className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-text-secondary cursor-pointer"
                          >
                            {col.label}
                            <SortIcon field={col.key} />
                          </button>
                        ) : col.label}
                        {col.help && <InfoTip content={col.help} label={`What ${col.label} means`} size={12} />}
                      </span>
                    </th>
                  ))}
                  <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-text-tertiary uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border/50 hover:bg-bg-tertiary/30 transition-colors cursor-pointer"
                    onClick={() => navigate(`/customers/${c.id}`)}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.includes(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        aria-label={`Select ${c.id}`}
                        className="rounded border-border"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">{c.id}</div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-xs tabular-nums">
                      {c.tenure !== null && c.tenure !== undefined ? `${c.tenure} mo` : '—'}
                    </td>
                    <td className="px-4 py-3 text-text-primary tabular-nums">{formatCurrency(c.monthlyCharges)}</td>
                    <td className="px-4 py-3 text-text-secondary text-xs">{c.contractType || '—'}</td>
                    <td className="px-4 py-3 text-text-primary font-semibold tabular-nums">{c.churnProbability}%</td>
                    <td className="px-4 py-3"><RiskBadge tier={c.riskTier} size="xs" /></td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} size="xs" /></td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-0.5">
                        <button
                          className="p-1.5 rounded hover:bg-bg-tertiary text-text-tertiary hover:text-text-primary cursor-pointer"
                          aria-label={`Explain why ${c.id} is at risk`}
                          onClick={() => navigate(`/explainability?customer=${c.id}`)}
                        >
                          <Brain size={13} aria-hidden="true" />
                        </button>
                        <button
                          className="p-1.5 rounded hover:bg-bg-tertiary text-text-tertiary hover:text-text-primary cursor-pointer"
                          aria-label={`Draft outreach for ${c.id}`}
                          onClick={() => navigate(`/outreach?customer=${c.id}`)}
                        >
                          <Mail size={13} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border">
            <span className="text-xs text-text-tertiary">Showing {(page - 1) * 10 + 1}–{Math.min(page * 10, total)} of {total}</span>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </Card>
    </div>
  );
}
