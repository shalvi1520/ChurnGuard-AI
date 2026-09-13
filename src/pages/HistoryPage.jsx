import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Database, FileSpreadsheet, Plug, RotateCcw, Sparkles, Zap } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import { InfoTip } from '../components/ui/Tooltip';
import { datasetService } from '../services/api';
import { useApp } from '../context/AppContext';
import { formatDate, formatNumber, formatRelativeDate } from '../utils/helpers';

/**
 * Datasets this signed-in account has trained before, read straight from
 * Neon (GET /datasets/history) -- not the browser. That is what makes this
 * list the same on every device and after clearing site data, unlike the
 * old IndexedDB-only version of this page.
 *
 * Clicking a row that was fully cached (predictionsAvailable) calls
 * POST /datasets/history/{id}/reopen and jumps straight to the dashboard --
 * no re-upload, no re-validate/map-columns, no retrain. A row that predates
 * that cache (older runs, or ones whose model artifacts live on a different
 * machine) says so plainly and sends the user to Data Management to
 * reconnect the original file instead of pretending it can be one-clicked.
 */

const SOURCE_META = {
  upload: { icon: FileSpreadsheet, label: 'Upload' },
  demo: { icon: Sparkles, label: 'Demo' },
  crm: { icon: Plug, label: 'CRM' },
};

function SummaryTile({ label, value, help }) {
  return (
    <div className="px-4 py-3 min-w-0">
      <p className="text-[11px] text-text-tertiary flex items-center gap-1">
        {label}
        {help && <InfoTip content={help} label={`About ${label}`} size={11} />}
      </p>
      <p className="text-sm font-semibold text-text-primary mt-0.5 truncate">{value}</p>
    </div>
  );
}

function Fact({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-text-tertiary">{label}</dt>
      <dd className="text-xs font-medium text-text-primary mt-0.5 truncate tabular-nums">{value}</dd>
    </div>
  );
}

function DatasetRow({ record, isActive, onOpen, opening }) {
  const meta = SOURCE_META[record.sourceKind] || SOURCE_META.upload;
  const Icon = meta.icon;
  const instant = record.predictionsAvailable;

  const status = isActive
    ? { variant: 'active', text: 'Active' }
    : instant
      ? { variant: 'accent', text: 'Opens instantly' }
      : { variant: 'medium', text: 'Needs the original file' };

  return (
    <Card className="hover:border-border-light transition-colors">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-bg-tertiary/60 flex items-center justify-center shrink-0">
            <Icon size={17} className="text-text-secondary" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-text-primary break-all">{record.filename}</h3>
            <p className="text-xs text-text-tertiary mt-0.5">
              {meta.label} · last trained {formatRelativeDate(record.trainedAt || record.uploadedAt)}
            </p>
          </div>
        </div>
        <Badge variant={status.variant} size="sm">
          {status.text}
        </Badge>
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
        <Fact label="Rows" value={record.rowCount != null ? formatNumber(record.rowCount) : '—'} />
        <Fact label="Columns" value={record.columnCount != null ? formatNumber(record.columnCount) : '—'} />
        <Fact label="Recall" value={record.metrics?.recall != null ? `${(record.metrics.recall * 100).toFixed(0)}%` : '—'} />
        <Fact label="First uploaded" value={formatDate(record.uploadedAt)} />
      </dl>

      {!instant && (
        <p className="text-xs text-risk-medium mt-3 leading-relaxed">
          {record.trained
            ? 'Trained before instant reopen was added, or its model lives on a different machine — reconnect the file to open it.'
            : 'This upload never finished training — reconnect the file to try again.'}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <Button
          size="sm"
          variant={isActive ? 'secondary' : 'primary'}
          onClick={() => onOpen(record)}
          disabled={isActive || opening}
          loading={opening}
          icon={instant ? Zap : RotateCcw}
        >
          {isActive ? 'In use' : instant ? 'Open instantly' : 'Reconnect file'}
        </Button>
      </div>
    </Card>
  );
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const { activeDataset, addToast, completeDatasetSetup } = useApp();

  const [records, setRecords] = useState(null); // null = still loading
  const [loadError, setLoadError] = useState(null);
  const [openingId, setOpeningId] = useState(null);

  const load = useCallback(() => {
    setRecords(null);
    setLoadError(null);
    datasetService
      .getHistory()
      .then((data) => setRecords(data.datasets || []))
      .catch(async (err) => {
        // A timeout here is very often just Neon's free-tier compute
        // waking up from being idle (a fixed 5-minute auto-suspend on this
        // plan -- see services/api.js's keep-alive) rather than a real
        // failure: the very first request in a session, or one right after
        // a long gap, can pay that cold-start cost even with the keep-alive
        // running, since the keep-alive can only prevent it from happening
        // AGAIN once it's had a chance to run -- not the very first time.
        // Neon's own guidance for exactly this is to retry once rather
        // than surface a cold compute as a broken app, so a timeout gets
        // one silent retry a few seconds later (compute is normally awake
        // by then) before this ever becomes a visible error.
        const isTimeout = err?.message?.toLowerCase().includes('took too long');
        if (isTimeout) {
          await new Promise((resolve) => setTimeout(resolve, 4000));
          try {
            const data = await datasetService.getHistory();
            setRecords(data.datasets || []);
            return;
          } catch (retryErr) {
            err = retryErr; // fall through to showing this as a real error
          }
        }
        setRecords([]);
        setLoadError(
          err?.status === 503
            ? "Dataset history needs sign-in and a configured database — this server doesn't have one."
            : err?.message || 'Could not load dataset history from the server.'
        );
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeDatasetId = activeDataset?.datasetId || null;

  const mostRecent = records?.[0] || null;

  const summary = useMemo(
    () => [
      {
        label: 'Saved datasets',
        value: records ? formatNumber(records.length) : '—',
        help: 'Every dataset this account has trained, stored in ChurnGuard\u2019s database — the same list on any device.',
      },
      { label: 'Most recently used', value: mostRecent ? mostRecent.filename : 'None yet' },
      {
        label: 'Current dataset',
        value: activeDataset?.filename || 'None connected',
        help: 'The dataset ChurnGuard is running on right now.',
      },
    ],
    [records, mostRecent, activeDataset]
  );

  const handleOpen = useCallback(
    async (record) => {
      if (!record.predictionsAvailable) {
        // Nothing cached to reopen -- the honest path is a real reconnect,
        // not a fake instant open. Data Management still handles this file.
        navigate('/data-management');
        return;
      }
      setOpeningId(record.id);
      try {
        const result = await datasetService.reopenHistory(record.id);
        completeDatasetSetup({
          source: result.source,
          isDemo: result.source?.kind === 'demo',
          filename: result.filename,
          datasetId: result.datasetId,
          rows: result.customersProcessed ?? result.rows,
          datasetRows: result.rows,
          columns: result.columns,
          fieldsMapped: result.mappedFields?.length ?? null,
          mappedColumns: result.mappedFields ?? [],
          cleaning: result.cleaning ?? [],
          additionalColumns: result.extraColumnsUsed?.length ?? 0,
          trainingMetrics: result.trainingMetrics ?? null,
        });
        addToast({ type: 'success', message: `${record.filename} is open — nothing was retrained.` });
        navigate('/dashboard');
      } catch (err) {
        if (err?.status === 409) {
          addToast({
            type: 'info',
            message: err.message || 'This dataset needs to be reconnected to open.',
          });
          navigate('/data-management');
        } else {
          addToast({ type: 'error', message: 'Could not reopen that dataset. Try again in a moment.' });
        }
      } finally {
        setOpeningId(null);
      }
    },
    [navigate, completeDatasetSetup, addToast]
  );

  return (
    <div className="space-y-6">
      <header className="max-w-2xl">
        <h1 className="text-xl font-bold text-text-primary tracking-tight">Dataset history</h1>
        <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">
          Every dataset this account has trained, stored on ChurnGuard&apos;s server. A dataset that was
          fully processed before opens instantly — no re-upload, no retraining.
        </p>
      </header>

      <div className="rounded-xl border border-border bg-bg-card grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
        {summary.map((tile) => (
          <SummaryTile key={tile.label} {...tile} />
        ))}
      </div>

      {loadError && (
        <Card role="alert" className="border-risk-medium/30 bg-risk-medium/[0.05]">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-risk-medium mt-0.5 shrink-0" />
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Couldn&apos;t load dataset history</h2>
              <p className="text-xs text-text-secondary mt-1 leading-relaxed">{loadError}</p>
            </div>
          </div>
        </Card>
      )}

      {records === null ? (
        <div className="space-y-4" aria-busy="true">
          <span className="sr-only">Loading saved datasets</span>
          {[0, 1].map((i) => (
            <Card key={i} className="space-y-3">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-10 w-full" />
            </Card>
          ))}
        </div>
      ) : records.length === 0 ? (
        <Card padding={false}>
          <EmptyState
            icon={Database}
            title="No trained datasets yet"
            description="Datasets you connect and train will appear here so you can reopen them instantly next time."
            actionLabel="Connect data"
            action={() => navigate('/data-management')}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {records.map((record) => (
            <DatasetRow
              key={record.id}
              record={record}
              isActive={record.id === activeDatasetId}
              onOpen={handleOpen}
              opening={openingId === record.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}