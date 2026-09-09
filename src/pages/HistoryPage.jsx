import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronDown,
  Database,
  FileSpreadsheet,
  Plug,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import { InfoTip } from '../components/ui/Tooltip';
import datasetHistory, { HISTORY_STATUS, UNAVAILABLE_MESSAGE } from '../services/datasetHistory';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatNumber, formatRelativeDate } from '../utils/helpers';

/**
 * Datasets this user has connected before, and a one-click way back to any of
 * them.
 *
 * The problem it solves: the backend holds one dataset in process memory, so
 * before this page existed, coming back tomorrow meant finding the same export
 * on disk and uploading it again. History keeps the file in the browser's
 * IndexedDB and hands it straight back to the normal ingestion pipeline — the
 * user never opens a file picker twice for the same data.
 *
 * What it is NOT: a second customer database. It stores dataset metadata and
 * the original file, never customer records, scores or dashboards — those
 * belong to the active dataset and would be stale copies here.
 *
 * The honest part: reconnecting genuinely re-registers the file, because a
 * previous session's *in-memory* dataset does not survive a backend restart.
 * Training itself is skipped when signed in and this exact data (same
 * columns, same values) was already trained on this account — see
 * backend/api/dataset_routes.py's fingerprint cache — otherwise it retrains
 * for real. The page says so rather than promising either behaviour blindly.
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
      <dd className="text-xs font-medium text-text-primary mt-0.5 truncate tabular-nums">
        {value}
      </dd>
    </div>
  );
}

function DatasetRow({ record, isActive, onUse, onDelete, expanded, onToggle }) {
  const meta = SOURCE_META[record.sourceKind] || SOURCE_META.upload;
  const Icon = meta.icon;
  const restorable = record.status === HISTORY_STATUS.restorable;

  // Status is a labelled badge plus a sentence — never colour on its own.
  const status = isActive
    ? { variant: 'active', text: 'Active' }
    : restorable
      ? { variant: 'accent', text: 'Ready to reuse' }
      : { variant: 'medium', text: 'Needs the original file' };

  return (
    <Card className="hover:border-border-light transition-colors">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-bg-tertiary/60 flex items-center justify-center shrink-0">
            <Icon size={17} className="text-text-secondary" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-text-primary break-all">{record.name}</h3>
            <p className="text-xs text-text-tertiary mt-0.5">
              {meta.label}
              {record.sourceDetail && record.sourceDetail !== record.name
                ? ` · ${record.sourceDetail}`
                : ''}{' '}
              · last used {formatRelativeDate(record.lastUsedAt)}
            </p>
          </div>
        </div>
        <Badge variant={status.variant} size="sm">
          {status.text}
        </Badge>
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
        <Fact label="Rows" value={record.rowCount != null ? formatNumber(record.rowCount) : '—'} />
        <Fact
          label="Columns"
          value={record.columnCount != null ? formatNumber(record.columnCount) : '—'}
        />
        <Fact
          label="Required fields"
          value={
            record.requiredFieldCount != null && record.requiredTotal
              ? `${record.requiredFieldCount} of ${record.requiredTotal}`
              : '—'
          }
        />
        <Fact label="First connected" value={formatDate(record.createdAt)} />
      </dl>

      {!restorable && (
        <p className="text-xs text-risk-medium mt-3 leading-relaxed">
          {record.unavailableReason || UNAVAILABLE_MESSAGE}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <Button
          size="sm"
          // A disabled accent button reads as an unavailable primary action;
          // "in use" is a state, so it renders as one.
          variant={isActive ? 'secondary' : 'primary'}
          onClick={() => onUse(record)}
          disabled={!restorable || isActive}
          icon={RotateCcw}
        >
          {isActive ? 'In use' : 'Use dataset'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={`history-details-${record.id}`}
        >
          <ChevronDown
            size={14}
            className={`mr-1 transition-transform ${expanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
          {expanded ? 'Hide details' : 'View details'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-text-tertiary hover:text-risk-critical ml-auto"
          onClick={() => onDelete(record)}
          icon={Trash2}
        >
          Delete
        </Button>
      </div>

      {expanded && (
        <div
          id={`history-details-${record.id}`}
          className="mt-4 pt-4 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          <div>
            <p className="text-[11px] text-text-tertiary">ChurnGuard fields mapped</p>
            <p className="text-xs text-text-secondary mt-1 leading-relaxed">
              {record.mappedFields?.length ? record.mappedFields.join(', ') : 'Not recorded'}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-text-tertiary">Saved copy</p>
            <p className="text-xs text-text-secondary mt-1 leading-relaxed">
              {record.file
                ? `${record.file.name} · ${(record.file.size / 1024).toFixed(0)} KB, kept in this browser`
                : 'No file kept — this entry is metadata only.'}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeDataset, addToast } = useApp();
  const userKey = user?.email || null;

  const [records, setRecords] = useState(null); // null = still loading
  const [storageError, setStorageError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  // Bumped after a delete to re-read the store — the effect below is the one
  // place that reads it, so there is a single load path.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    datasetHistory
      .list(userKey)
      .then((saved) => {
        if (cancelled) return;
        setRecords(saved);
        setStorageError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setRecords([]);
        setStorageError(
          err?.message || 'This browser would not let ChurnGuard read its saved datasets.'
        );
      });
    return () => {
      cancelled = true;
    };
  }, [userKey, reloadToken]);

  const activeHistoryId = activeDataset?.historyId || null;

  const mostRecent = records?.[0] || null;

  const summary = useMemo(
    () => [
      {
        label: 'Saved datasets',
        value: records ? formatNumber(records.length) : '—',
        help: 'Datasets you have connected in this browser. They are stored locally and are not uploaded anywhere.',
      },
      {
        label: 'Most recently used',
        value: mostRecent ? mostRecent.name : 'None yet',
      },
      {
        label: 'Current dataset',
        value: activeDataset?.filename || 'None connected',
        help: 'The dataset ChurnGuard is running on right now.',
      },
    ],
    [records, mostRecent, activeDataset]
  );

  const handleUse = useCallback(
    (record) => {
      // Restoration runs through the normal Data Management pipeline — there is
      // deliberately no second ingestion path.
      navigate(`/data-management?restore=${encodeURIComponent(record.id)}`);
    },
    [navigate]
  );

  const handleDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await datasetHistory.remove(pendingDelete.id);
      addToast({ type: 'info', message: `Removed ${pendingDelete.name} from history` });
      setReloadToken((t) => t + 1);
    } catch {
      addToast({ type: 'error', message: 'That dataset could not be removed from this browser' });
    }
    setDeleting(false);
    setPendingDelete(null);
  }, [pendingDelete, addToast]);

  const deletingActive = pendingDelete && pendingDelete.id === activeHistoryId;

  return (
    <div className="space-y-6">
      <header className="max-w-2xl">
        <h1 className="text-xl font-bold text-text-primary tracking-tight">Dataset history</h1>
        <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">
          Reconnect to previously used datasets without uploading them again. ChurnGuard keeps a
          copy in this browser and hands it back to the same setup pipeline — retraining for real,
          unless you're signed in and this exact data was already trained on your account, in which
          case the existing model is reused instead of retrained.
        </p>
      </header>

      {/* ---------- Summary ---------- */}
      <div className="rounded-xl border border-border bg-bg-card grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
        {summary.map((tile) => (
          <SummaryTile key={tile.label} {...tile} />
        ))}
      </div>

      {storageError && (
        <Card role="alert" className="border-risk-medium/30 bg-risk-medium/[0.05]">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-risk-medium mt-0.5 shrink-0" />
            <div>
              <h2 className="text-sm font-semibold text-text-primary">
                Saved datasets are unavailable in this browser
              </h2>
              <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                {storageError} Private-browsing windows and blocked site data both do this. You can
                still connect data normally from Data Management.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* ---------- The list ---------- */}
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
            title="No saved datasets yet"
            description="Datasets you connect will appear here so you can reuse them without uploading again."
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
              isActive={record.id === activeHistoryId}
              onUse={handleUse}
              onDelete={setPendingDelete}
              expanded={expandedId === record.id}
              onToggle={() => setExpandedId(expandedId === record.id ? null : record.id)}
            />
          ))}
          <p className="text-[11px] text-text-tertiary leading-relaxed max-w-2xl">
            Saved datasets live in this browser only, under your signed-in account. They are not
            uploaded to ChurnGuard&apos;s backend or shared between devices, and clearing site data
            removes them.
          </p>
        </div>
      )}

      {/* ---------- Delete confirmation ---------- */}
      <Modal
        isOpen={Boolean(pendingDelete)}
        onClose={() => (deleting ? null : setPendingDelete(null))}
        title="Delete this saved dataset?"
        size="sm"
      >
        <p className="text-sm text-text-secondary leading-relaxed">
          <span className="font-medium text-text-primary">{pendingDelete?.name}</span> and its
          saved copy will be removed from this browser. You will need the original file to use it
          again.
        </p>
        {deletingActive && (
          <p className="text-xs text-risk-medium mt-3 leading-relaxed" role="alert">
            This is the dataset ChurnGuard is currently running on. Deleting its saved copy does
            not disconnect it — your Overview and customers stay exactly as they are — but you
            will not be able to bring it back from History later.
          </p>
        )}
        <div className="flex flex-wrap gap-2 mt-5">
          <Button variant="danger" onClick={handleDelete} loading={deleting} icon={Trash2}>
            Delete
          </Button>
          <Button variant="ghost" onClick={() => setPendingDelete(null)} disabled={deleting}>
            Keep it
          </Button>
        </div>
      </Modal>
    </div>
  );
}
