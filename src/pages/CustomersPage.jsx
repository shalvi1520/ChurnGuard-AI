import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Filter, Download, ChevronUp, ChevronDown, Eye, Brain, Mail, Lightbulb, Users } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { RiskBadge, StatusBadge } from '../components/ui/Badge';
import Select from '../components/ui/Select';
import Pagination from '../components/ui/Pagination';
import EmptyState from '../components/ui/EmptyState';
import { SkeletonTable } from '../components/ui/Skeleton';
import { customerService } from '../services/api';
import { formatCurrency, formatRelativeDate } from '../utils/helpers';

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [risk, setRisk] = useState('all');
  const [status, setStatus] = useState('all');
  const [plan, setPlan] = useState('all');
  const [sortBy, setSortBy] = useState('churnProbability');
  const [sortDir, setSortDir] = useState('desc');
  const [selected, setSelected] = useState([]);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const riskParam = searchParams.get('risk');
    if (riskParam) setRisk(riskParam);
  }, [searchParams]);

  useEffect(() => {
    loadCustomers();
  }, [page, risk, status, plan, sortBy, sortDir]);

  useEffect(() => {
    const timer = setTimeout(() => { setPage(1); loadCustomers(); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const data = await customerService.getCustomers({ search, risk, status, plan, page, limit: 10, sortBy, sortDir });
      setCustomers(data.customers);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
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
    { key: 'name', label: 'Customer', sortable: true },
    { key: 'plan', label: 'Plan', sortable: true },
    { key: 'mrr', label: 'MRR', sortable: true },
    { key: 'usage', label: 'Usage', sortable: true },
    { key: 'engagement', label: 'Engagement', sortable: true },
    { key: 'churnProbability', label: 'Churn Prob.', sortable: true },
    { key: 'riskTier', label: 'Risk', sortable: false },
    { key: 'lastActive', label: 'Last Active', sortable: true },
    { key: 'status', label: 'Status', sortable: false },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">Customer Management</h1>
          <p className="text-sm text-text-tertiary mt-0.5">{total} customers · {customers.filter(c => c.riskTier === 'critical' || c.riskTier === 'high').length} at high risk</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.length > 0 && (
            <span className="text-xs text-accent font-medium mr-2">{selected.length} selected</span>
          )}
          <Button variant="outline" size="sm" icon={Download}>Export</Button>
        </div>
      </div>

      {/* Filters */}
      <Card padding={false}>
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-border">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customers, IDs, companies..."
              className="w-full pl-9 pr-3 py-2 bg-bg-tertiary/50 border border-border rounded-lg text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent transition-colors"
            />
          </div>
          <Select value={risk} onChange={(e) => { setRisk(e.target.value); setPage(1); }} options={[{ value: 'all', label: 'All Risk' }, { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'critical', label: 'Critical' }]} placeholder="" />
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} options={[{ value: 'all', label: 'All Status' }, { value: 'active', label: 'Active' }, { value: 'at-risk', label: 'At Risk' }, { value: 'dormant', label: 'Dormant' }, { value: 'churned', label: 'Churned' }]} placeholder="" />
          <Select value={plan} onChange={(e) => { setPlan(e.target.value); setPage(1); }} options={[{ value: 'all', label: 'All Plans' }, { value: 'Starter', label: 'Starter' }, { value: 'Professional', label: 'Professional' }, { value: 'Enterprise', label: 'Enterprise' }]} placeholder="" />
        </div>

        {/* Table */}
        {loading ? (
          <div className="p-5"><SkeletonTable rows={8} cols={9} /></div>
        ) : customers.length === 0 ? (
          <EmptyState icon={Users} title="No customers found" description="Try adjusting your search or filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-2.5 w-10">
                    <input type="checkbox" checked={selected.length === customers.length && customers.length > 0} onChange={toggleSelectAll} className="rounded border-border" />
                  </th>
                  {columns.map(col => (
                    <th
                      key={col.key}
                      className="px-4 py-2.5 text-left text-xs font-semibold text-text-tertiary uppercase tracking-wider cursor-pointer hover:text-text-secondary"
                      onClick={() => col.sortable && handleSort(col.key)}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {col.sortable && <SortIcon field={col.key} />}
                      </span>
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-tertiary uppercase tracking-wider">Actions</th>
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
                      <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggleSelect(c.id)} className="rounded border-border" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">{c.name}</div>
                      <div className="text-xs text-text-tertiary">{c.id} · {c.contactName}</div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-xs">{c.plan}</td>
                    <td className="px-4 py-3 text-text-primary tabular-nums">{formatCurrency(c.mrr)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${c.usage}%` }} />
                        </div>
                        <span className="text-xs text-text-secondary tabular-nums">{c.usage}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${c.engagement}%`, backgroundColor: c.engagement > 60 ? '#4ADE80' : c.engagement > 35 ? '#FBBF24' : '#F97316' }} />
                        </div>
                        <span className="text-xs text-text-secondary tabular-nums">{c.engagement}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-primary font-semibold tabular-nums">{c.churnProbability}%</td>
                    <td className="px-4 py-3"><RiskBadge tier={c.riskTier} size="xs" /></td>
                    <td className="px-4 py-3 text-text-tertiary text-xs">{formatRelativeDate(c.lastActive)}</td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} size="xs" /></td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-0.5">
                        <button className="p-1.5 rounded hover:bg-bg-tertiary text-text-tertiary hover:text-text-primary cursor-pointer" title="View" onClick={() => navigate(`/customers/${c.id}`)}><Eye size={13} /></button>
                        <button className="p-1.5 rounded hover:bg-bg-tertiary text-text-tertiary hover:text-text-primary cursor-pointer" title="Analyze" onClick={() => navigate(`/explainability?customer=${c.id}`)}><Brain size={13} /></button>
                        <button className="p-1.5 rounded hover:bg-bg-tertiary text-text-tertiary hover:text-text-primary cursor-pointer" title="Email" onClick={() => navigate(`/outreach?customer=${c.id}`)}><Mail size={13} /></button>
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
