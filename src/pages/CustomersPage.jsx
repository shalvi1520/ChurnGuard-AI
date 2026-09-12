import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useMatch, useNavigate, useSearchParams } from 'react-router-dom';
import { Search, ChevronUp, ChevronDown, Brain, Mail, Users, AlertTriangle, X } from 'lucide-react';
import Card from '../components/ui/Card';
import { RiskBadge, StatusBadge } from '../components/ui/Badge';
import Select from '../components/ui/Select';
import Pagination from '../components/ui/Pagination';
import EmptyState from '../components/ui/EmptyState';
import PageTrail from '../components/ui/PageTrail';
import Tooltip, { InfoTip } from '../components/ui/Tooltip';
import { SkeletonTable } from '../components/ui/Skeleton';
import { customerService, dashboardService } from '../services/api';
import { formatCurrency } from '../utils/helpers';
import { metric } from '../utils/glossary';
import { useWorkflowNav, withCustomer } from '../utils/navigation';

const PAGE_SIZE = 10;
const DEFAULT_SORT = { by: 'churnProbability', dir: 'desc' };
const SORTABLE = ['id', 'tenure', 'monthlyCharges', 'contractType', 'churnProbability'];

const RISK_NAMES = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
const STATUS_NAMES = { active: 'Active', 'at-risk': 'At risk' };

/** A URL value from a fixed set, or the fallback for anything else. */
function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

/**
 * The two things you can do with an account from this table, following the
 * product's PREDICT → EXPLAIN → ACT flow: understand why it is at risk, then
 * act on it. Both go to pages that already exist and take the customer's real
 * ID with them.
 *
 * Icon-only to keep the table narrow, but never icon-only in meaning: each has
 * an aria-label naming the account and a tooltip that opens on hover AND on
 * keyboard focus, so touch and keyboard users get the same explanation.
 */
function RowAction({ icon: Icon, label, tooltip, onClick }) {
  return (
    <Tooltip content={tooltip}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className="p-1.5 rounded-md text-text-tertiary hover:text-accent hover:bg-bg-tertiary transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      >
        <Icon size={15} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}

export default function CustomersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { from, stateFrom, drill } = useWorkflowNav();

  // Every filter lives in the URL, so a Portfolio & Risk drill-down
  // (`?risk=critical`, `?status=at-risk`, `?contract=…`), a refresh, a shared
  // link and Back/Forward all show the same list. Filter keys are GET
  // /customers's own parameter names and pass straight through.
  const risk = oneOf(searchParams.get('risk'), Object.keys(RISK_NAMES), 'all');
  const status = oneOf(searchParams.get('status'), Object.keys(STATUS_NAMES), 'all');
  const contract = searchParams.get('contract') ?? '';
  const serviceTier = searchParams.get('serviceTier') ?? '';
  const query = searchParams.get('q') ?? '';
  const sortBy = oneOf(searchParams.get('sort'), SORTABLE, DEFAULT_SORT.by);
  const sortDir = oneOf(searchParams.get('dir'), ['asc', 'desc'], DEFAULT_SORT.dir);
  const page = Math.max(1, Number.parseInt(searchParams.get('page'), 10) || 1);

  // Refining the list replaces the current history entry instead of pushing
  // one: Back from here should return to where the user came from, not step
  // through every filter they tried. The drill-down context in location state
  // is carried across, and the scroll position stays put.
  const updateParams = useCallback(
    (changes) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          Object.entries(changes).forEach(([key, value]) => {
            if (value === null || value === undefined || value === '' || value === 'all') next.delete(key);
            else next.set(key, String(value));
          });
          return next;
        },
        { replace: true, state: location.state, preventScrollReset: true }
      );
    },
    [setSearchParams, location.state]
  );

  const [customers, setCustomers] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState([]);
  // null until loaded -- columns default to showing while unknown, rather
  // than flicker-hiding then reappearing. Only ever used to hide a column
  // whose backing field genuinely wasn't part of this dataset (see
  // backend's _dataset_context()'s `available` flags), never to hide one
  // that simply hasn't loaded yet.
  const [available, setAvailable] = useState(null);

  // The search box is local while typing; the list follows the URL's `q`,
  // written 300ms after the last keystroke so typing doesn't fire a request
  // per key.
  const [search, setSearch] = useState(query);
  const [syncedQuery, setSyncedQuery] = useState(query);
  if (query !== syncedQuery) {
    // The URL changed underneath the box (Back/Forward, or the sidebar's
    // plain /customers link) -- show what the list is really filtered by.
    setSyncedQuery(query);
    setSearch(query);
  }

  useEffect(() => {
    const next = search.trim();
    if (next === syncedQuery) return undefined;
    const timer = setTimeout(() => {
      setSyncedQuery(next);
      updateParams({ q: next, page: null });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, syncedQuery, updateParams]);

  useEffect(() => {
    let cancelled = false;
    dashboardService.getMetrics()
      .then((data) => { if (!cancelled) setAvailable(data?.dataset?.available ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Only load while this route is the current one. A page can render once
  // against a location that no longer matches it while the route is being
  // replaced. Measured back when page transitions still ran through
  // AnimatePresence's `mode="wait"`: the filters below re-read as their
  // defaults, and this effect fired a full unfiltered /customers query — for a
  // page nobody was looking at — once per navigation away.
  const onThisRoute = Boolean(useMatch('/customers'));

  useEffect(() => {
    if (!onThisRoute) return undefined;

    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await customerService.getCustomers({
          search: query,
          risk,
          status,
          contract: contract || undefined,
          serviceTier: serviceTier || undefined,
          page,
          limit: PAGE_SIZE,
          sortBy,
          sortDir,
        });
        if (cancelled) return;
        // A page number past the end (an old link, or a list that shrank)
        // would otherwise read as "no accounts match".
        if (data.customers.length === 0 && data.total > 0 && page > 1) {
          updateParams({ page: data.totalPages > 1 ? data.totalPages : null });
          return;
        }
        setCustomers(data.customers);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setError(false);
      } catch {
        if (!cancelled) setError(true);
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [onThisRoute, query, risk, status, contract, serviceTier, page, sortBy, sortDir, reloadKey, updateParams]);

  const clearSearchBox = () => {
    setSearch('');
    setSyncedQuery('');
  };

  const activeFilters = [
    risk !== 'all' && { key: 'risk', label: `Risk tier: ${RISK_NAMES[risk]}` },
    status !== 'all' && { key: 'status', label: `Status: ${STATUS_NAMES[status]}` },
    contract && { key: 'contract', label: `Contract: ${contract}` },
    serviceTier && { key: 'serviceTier', label: `Service tier: ${serviceTier}` },
    query && { key: 'q', label: `Search: "${query}"` },
  ].filter(Boolean);

  const removeFilter = (key) => {
    if (key === 'q') clearSearchBox();
    updateParams({ [key]: null, page: null });
  };

  const clearFilters = () => {
    clearSearchBox();
    updateParams({ risk: null, status: null, contract: null, serviceTier: null, q: null, page: null });
  };

  const handleSort = (field) => {
    const dir = sortBy === field && sortDir === 'desc' ? 'asc' : 'desc';
    const isDefault = field === DEFAULT_SORT.by && dir === DEFAULT_SORT.dir;
    updateParams({ sort: isDefault ? null : field, dir: isDefault ? null : dir, page: null });
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

  const showMonthlyCharges = available === null || available.revenue !== false;

  const columns = [
    { key: 'id', label: 'Customer ID', sortable: true },
    { key: 'tenure', label: 'Tenure', sortable: true, help: metric('tenure').help },
    ...(showMonthlyCharges
      ? [{ key: 'monthlyCharges', label: 'Monthly Charges', sortable: true, help: metric('monthlyCharges').help }]
      : []),
    { key: 'contractType', label: 'Contract', sortable: true, help: metric('contractType').help },
    { key: 'churnProbability', label: 'Churn Risk', sortable: true, help: metric('churnProbability').help },
    { key: 'riskTier', label: 'Risk Tier', sortable: false, help: metric('riskTier').help },
    { key: 'status', label: 'Status', sortable: false, help: metric('status').help },
  ];

  // Opening an account remembers this exact list (filters, sort, page), so
  // "Back to Customers" -- or the browser's Back -- returns to it.
  const openState = stateFrom('Customers');

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <PageTrail
          crumbs={[{ label: 'Portfolio & Risk', to: '/dashboard' }, { label: 'Customers' }]}
          back={from && { label: from.label, to: from.path }}
        />
        <header className="max-w-3xl">
          <h1 className="text-xl font-bold text-text-primary tracking-tight">Customers</h1>
          <p className="text-sm text-text-secondary mt-1 leading-relaxed">
            Every account in your dataset with its current churn risk. Sort by any column, filter to a segment, or open
            an account to see why it's scored the way it is.
          </p>
        </header>
      </div>

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
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Customer ID"
                  className="w-full pl-9 pr-3 py-2.5 bg-bg-tertiary/50 border border-border rounded-lg text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent transition-colors"
                />
              </div>
            </div>
            <Select
              label="Risk tier"
              value={risk}
              onChange={(e) => updateParams({ risk: e.target.value, page: null })}
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
              onChange={(e) => updateParams({ status: e.target.value, page: null })}
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
                type="button"
                onClick={() => removeFilter(f.key)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border bg-bg-tertiary/50 text-[11px] text-text-secondary hover:text-text-primary hover:border-border-light transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1"
              >
                {f.label}
                <X size={11} aria-hidden="true" />
                <span className="sr-only">Remove this filter</span>
              </button>
            ))}
            {activeFilters.length > 1 && (
              <button type="button" onClick={clearFilters} className="text-[11px] text-accent hover:underline cursor-pointer">
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
            action={() => setReloadKey((k) => k + 1)}
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
            actionLabel={activeFilters.length > 0 ? 'Clear all filters' : 'Go to Data Management'}
            action={activeFilters.length > 0 ? clearFilters : () => navigate('/data-management')}
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
                  <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                    <span className="inline-flex items-center gap-1">
                      Actions
                      <InfoTip
                        content="Understand an account, then act on it: the brain icon opens Explainability for this customer, the envelope icon opens Outreach."
                        label="What the action icons do"
                        size={12}
                      />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border/50 hover:bg-bg-tertiary/30 transition-colors cursor-pointer"
                    onClick={() => drill(`/customers/${c.id}`, 'Customers')}
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
                      {/* The keyboard way into an account; the whole row is the mouse way. */}
                      <Link
                        to={`/customers/${c.id}`}
                        state={openState}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-text-primary hover:text-accent hover:underline underline-offset-2 rounded-sm focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
                      >
                        {c.id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-xs tabular-nums">
                      {c.tenure !== null && c.tenure !== undefined ? `${c.tenure} mo` : '—'}
                    </td>
                    {showMonthlyCharges && (
                      <td className="px-4 py-3 text-text-primary tabular-nums">{formatCurrency(c.monthlyCharges)}</td>
                    )}
                    <td className="px-4 py-3 text-text-secondary text-xs">{c.contractType || '—'}</td>
                    <td className="px-4 py-3 text-text-primary font-semibold tabular-nums">{c.churnProbability}%</td>
                    <td className="px-4 py-3"><RiskBadge tier={c.riskTier} size="xs" /></td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} size="xs" /></td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <RowAction
                          icon={Brain}
                          label={`View explainability for ${c.id}`}
                          tooltip="View explainability — why this account is scored the way it is"
                          onClick={() => drill(withCustomer('/explainability', c.id), 'Customers')}
                        />
                        <RowAction
                          icon={Mail}
                          label={`Create outreach for ${c.id}`}
                          tooltip="Create outreach — draft a retention email for this account"
                          onClick={() => drill(withCustomer('/outreach', c.id), 'Customers')}
                        />
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
            <span className="text-xs text-text-tertiary">Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
            <Pagination page={page} totalPages={totalPages} onPageChange={(p) => updateParams({ page: p > 1 ? p : null })} />
          </div>
        )}
      </Card>
    </div>
  );
}
