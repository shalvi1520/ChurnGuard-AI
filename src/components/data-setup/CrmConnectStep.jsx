import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, Link2, Lock, AlertTriangle, ExternalLink } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Skeleton from '../ui/Skeleton';
import { connectorService } from '../../services/api';

/**
 * Connect a CRM / API as the data source.
 *
 * Credentials are typed here, sent straight to our own backend, used for that
 * one request and dropped. They are deliberately NOT persisted: not in
 * localStorage, not in a context store, not in a VITE_ variable. When this
 * component unmounts the credentials are gone with it, which is why
 * reconnecting asks for them again.
 *
 * Providers marked "Coming soon" are scaffolded but not implemented, and the
 * backend refuses to run them. Nothing here simulates a connection — a
 * connection either really happened or the user is told it cannot yet.
 */

const PHASE = { PROVIDER: 'provider', CREDENTIALS: 'credentials', SOURCE: 'source' };

function ProviderCard({ connector, onSelect }) {
  const available = connector.status === 'available';

  return (
    <button
      type="button"
      onClick={() => available && onSelect(connector)}
      disabled={!available}
      className={`text-left w-full rounded-lg border p-4 transition-colors ${
        available
          ? 'border-border bg-surface hover:border-accent/50 hover:bg-accent/[0.03] cursor-pointer'
          : 'border-border/60 bg-surface/50 cursor-not-allowed opacity-70'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <h3 className="text-sm font-semibold text-text-primary">{connector.label}</h3>
        <Badge variant={available ? 'active' : 'default'} size="xs">
          {available ? 'Available' : 'Coming soon'}
        </Badge>
      </div>
      <p className="text-xs text-text-secondary leading-relaxed">{connector.description}</p>
    </button>
  );
}

export default function CrmConnectStep({ onBack, onImported }) {
  const [connectors, setConnectors] = useState(null);
  const [limits, setLimits] = useState({ defaultLimit: 5000, maxLimit: 20000 });
  const [loadError, setLoadError] = useState(null);

  const [phase, setPhase] = useState(PHASE.PROVIDER);
  const [provider, setProvider] = useState(null);
  const [credentials, setCredentials] = useState({});
  const [sources, setSources] = useState([]);
  const [sourceId, setSourceId] = useState('');
  const [connection, setConnection] = useState(null);

  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    connectorService
      .listConnectors()
      .then((res) => {
        if (cancelled) return;
        setConnectors(res.connectors || []);
        setLimits({ defaultLimit: res.defaultLimit, maxLimit: res.maxLimit });
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectProvider = useCallback((connector) => {
    setProvider(connector);
    setCredentials({});
    setFormError(null);
    setConnection(null);
    setPhase(PHASE.CREDENTIALS);
  }, []);

  /** Connect = authenticate, then list what can be imported. One user action,
   * because "test" and "what can I pull?" are the same question to them. */
  const handleConnect = useCallback(async () => {
    setBusy(true);
    setFormError(null);
    try {
      const result = await connectorService.testConnection(provider.id, credentials);
      setConnection(result);
      const res = await connectorService.listSources(provider.id, credentials);
      const list = res.sources || [];
      setSources(list);
      // Contacts, when the provider offers them, is the right default record
      // type: it's the level churn is actually measured at. Falls back to
      // whatever the connector lists first for providers with no such source.
      const preferred = list.find((s) => s.id === 'contacts');
      setSourceId(preferred?.id || list[0]?.id || 'default');
      setPhase(PHASE.SOURCE);
    } catch (err) {
      setFormError({ message: err.message, hint: err.hint });
    } finally {
      setBusy(false);
    }
  }, [provider, credentials]);

  const handleImport = useCallback(async () => {
    setBusy(true);
    setFormError(null);
    try {
      const dataset = await connectorService.importRecords(provider.id, {
        credentials,
        sourceId,
        limit: limits.defaultLimit,
      });
      onImported(dataset);
    } catch (err) {
      setFormError({ message: err.message, hint: err.hint });
      setBusy(false);
    }
  }, [provider, credentials, sourceId, limits.defaultLimit, onImported]);

  // ---------- provider list ----------

  if (phase === PHASE.PROVIDER) {
    return (
      <Card className="max-w-2xl">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Connect a CRM or API</h2>
            <p className="text-xs text-text-secondary mt-1 leading-relaxed">
              ChurnGuard pulls your customer records over the provider&apos;s API, then analyses
              them exactly as it would an uploaded file.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0">
            <ArrowLeft size={14} className="mr-1.5" />
            Back
          </Button>
        </div>

        {loadError && (
          <div className="rounded-lg border border-danger/30 bg-danger/5 p-4">
            <p className="text-sm font-medium text-text-primary">
              We couldn&apos;t load the available integrations.
            </p>
            {/* The service layer already explains the cause (unreachable
                backend vs. a real API error) -- don't append a second guess. */}
            <p className="text-xs text-text-secondary mt-1">
              {loadError.message} {loadError.hint}
            </p>
          </div>
        )}

        {!connectors && !loadError && (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {connectors && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {connectors.map((c) => (
              <ProviderCard key={c.id} connector={c} onSelect={selectProvider} />
            ))}
          </div>
        )}

        <p className="text-xs text-text-tertiary mt-4 leading-relaxed flex items-start gap-1.5">
          <Lock size={12} className="mt-0.5 shrink-0" />
          Credentials are sent to the ChurnGuard backend, used for that one request and then
          discarded. They are never stored in your browser.
        </p>
      </Card>
    );
  }

  // ---------- credentials ----------

  if (phase === PHASE.CREDENTIALS) {
    // Only genuinely required fields gate the button. An optional field (an
    // auth header for an endpoint that doesn't need one) must never block a
    // connection -- treating every field as mandatory made the HTTP endpoint
    // connector unusable.
    const missing = provider.credentialFields.filter(
      (f) => f.required !== false && !credentials[f.key]?.trim()
    );

    return (
      <Card className="max-w-2xl">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">
              Connect to {provider.label}
            </h2>
            <p className="text-xs text-text-secondary mt-1 leading-relaxed">
              {provider.description}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPhase(PHASE.PROVIDER)}
            className="shrink-0"
          >
            <ArrowLeft size={14} className="mr-1.5" />
            Back
          </Button>
        </div>

        <div className="space-y-4">
          {provider.credentialFields.map((field) => (
            <div key={field.key}>
              <Input
                label={field.required === false ? `${field.label} (optional)` : field.label}
                type={field.secret ? 'password' : 'text'}
                placeholder={field.placeholder}
                value={credentials[field.key] || ''}
                autoComplete="off"
                onChange={(e) =>
                  setCredentials((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
              />
              {field.help && (
                <p className="text-xs text-text-tertiary mt-1.5 leading-relaxed">{field.help}</p>
              )}
            </div>
          ))}
        </div>

        {formError && (
          <div className="mt-4 rounded-lg border border-danger/30 bg-danger/5 p-3.5">
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className="text-danger mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-text-primary">{formError.message}</p>
                {formError.hint && (
                  <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                    {formError.hint}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 mt-5">
          <Button onClick={handleConnect} loading={busy} disabled={missing.length > 0}>
            <Link2 size={14} className="mr-1.5" />
            Connect
          </Button>
          {provider.docsUrl && (
            <a
              href={provider.docsUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs text-accent hover:underline inline-flex items-center gap-1"
            >
              How to get these credentials
              <ExternalLink size={11} />
            </a>
          )}
        </div>
      </Card>
    );
  }

  // ---------- choose what to import ----------

  return (
    <Card className="max-w-2xl">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
            {provider.label}
            <Badge variant="active" size="xs">
              <Check size={10} className="mr-1" strokeWidth={3} />
              Connected
            </Badge>
          </h2>
          {/* `message` is the connector's own confirmation, e.g. "Read 320
              records with 5 columns" -- real evidence the connection worked. */}
          {(connection?.message || connection?.account) && (
            <p className="text-xs text-text-secondary mt-1 leading-relaxed">
              {connection.message || connection.account}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPhase(PHASE.CREDENTIALS)}
          className="shrink-0"
        >
          <ArrowLeft size={14} className="mr-1.5" />
          Back
        </Button>
      </div>

      <Select
        label="Which records should ChurnGuard analyse?"
        options={sources.map((s) => ({ value: s.id, label: s.label }))}
        value={sourceId}
        placeholder={null}
        onChange={(e) => setSourceId(e.target.value)}
      />
      {sources.find((s) => s.id === sourceId)?.description && (
        <p className="text-xs text-text-tertiary mt-1.5 leading-relaxed">
          {sources.find((s) => s.id === sourceId).description}
        </p>
      )}

      <p className="text-xs text-text-tertiary mt-4 leading-relaxed">
        ChurnGuard imports up to {limits.defaultLimit.toLocaleString()} records in one go, then
        analyses them the same way it analyses an uploaded file.
      </p>

      {formError && (
        <div className="mt-4 rounded-lg border border-danger/30 bg-danger/5 p-3.5">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="text-danger mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-text-primary">{formError.message}</p>
              {formError.hint && (
                <p className="text-xs text-text-secondary mt-1 leading-relaxed">{formError.hint}</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 mt-5">
        <Button onClick={handleImport} loading={busy} disabled={!sourceId}>
          Import and analyse
        </Button>
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
