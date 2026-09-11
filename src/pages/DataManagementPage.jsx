import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { History, RefreshCw } from 'lucide-react';
import SourceSelector from '../components/data-setup/SourceSelector';
import PipelineProgress from '../components/data-setup/PipelineProgress';
import CompleteStep from '../components/data-setup/CompleteStep';
import BackendNotice from '../components/data-setup/BackendNotice';
import DataFlowRail from '../components/data-setup/DataFlowRail';
import { IDLE_STAGES } from '../components/data-setup/steps';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Skeleton from '../components/ui/Skeleton';
import { datasetService, DatasetError } from '../services/api';
import datasetHistory, { UNAVAILABLE_MESSAGE, toRestorableFile } from '../services/datasetHistory';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

/**
 * Connect customer data, then get out of the way.
 *
 * The flow used to be Upload → Validate → Map → Process → Predict, with a
 * button between every pair. Four of those five clicks asked the user to
 * approve work they had no input into, so they are gone: once data arrives,
 * everything runs automatically and the user watches it happen.
 *
 * There is no manual column-mapping screen. Matching a column to a field is
 * ChurnGuard's job: the deterministic matcher (backend/api/mapping.py) runs
 * first, and an LLM gets a second opinion on anything it couldn't confidently
 * resolve (backend POST /datasets/{id}/auto-map) — never the other way
 * around, and never for every column, only the ones still ambiguous after
 * the heuristic pass. There are exactly two reasons the flow stops and asks
 * something:
 *   1. the data genuinely can't be used (no rows, no usable columns) → issues
 *   2. connecting a CRM needs credentials                            → CRM step
 * If even the AI can't place a required field, that is also an issues
 * screen, not a form — ChurnGuard says plainly what it still needs.
 *
 * Everything else — profiling, column matching, validation, cleaning,
 * training, scoring, aggregation — happens without a click.
 *
 * `?restore=<historyId>` re-runs a dataset the user connected before, using
 * the copy History kept in IndexedDB. It deliberately lands here and re-runs
 * the pipeline above rather than having its own: the backend holds one dataset
 * in memory, so reconnecting genuinely re-registers and re-trains. What the
 * user is spared is finding and picking the file again.
 *
 * PERFORMANCE: the page shell and whichever view the user actually needs are
 * the only things loaded up front. The upload dropzone (react-dropzone), the
 * CRM connect form, the blocked-data screen and the demo dataset generator
 * are all fetched on demand — a returning user with a dataset already
 * connected downloads none of them.
 */

const UploadStep = lazy(() => import('../components/data-setup/UploadStep'));
const CrmConnectStep = lazy(() => import('../components/data-setup/CrmConnectStep'));
const IssueList = lazy(() => import('../components/data-setup/IssueList'));

const PHASE = {
  CHOOSE: 'choose',
  UPLOAD: 'upload',
  CRM: 'crm',
  RUNNING: 'running',
  BLOCKED: 'blocked',
};

const GENERIC_ERROR = {
  message: 'Something went wrong while handling your dataset.',
  hint: 'Please try again — if it keeps happening, use a different file or the demo dataset.',
};

/** DatasetError carries user-facing copy; anything else gets a safe fallback. */
function asUserError(err) {
  return err instanceof DatasetError ? { message: err.message, hint: err.hint } : GENERIC_ERROR;
}

/** Placeholder for a lazily-loaded step. Sized to roughly what replaces it so
 *  the page doesn't jump when the chunk lands. */
function StepFallback() {
  return (
    <Card className="max-w-2xl space-y-3">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-3 w-72" />
      <Skeleton className="h-40 w-full" />
    </Card>
  );
}

export default function DataManagementPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { addToast, datasetSetupComplete, activeDataset, completeDatasetSetup, resetDatasetSetup } =
    useApp();

  const [phase, setPhase] = useState(PHASE.CHOOSE);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState(null);

  const [validation, setValidation] = useState(null);

  const [stageStates, setStageStates] = useState(IDLE_STAGES);
  const [runError, setRunError] = useState(null);

  // Offering to derive churn from a last-activity date when the data has no
  // churn/cancellation column at all — see handleDeriveChurn below.
  const [derivingChurn, setDerivingChurn] = useState(false);
  const [deriveChurnError, setDeriveChurnError] = useState(null);

  // Restoring a saved dataset from History.
  const restoreId = searchParams.get('restore');
  const restoreStarted = useRef(false);
  const [restoring, setRestoring] = useState(Boolean(restoreId));
  const [restoreError, setRestoreError] = useState(null);

  // The dataset the backend registered for this run. A ref, not state: it is
  // read by `process`, which `analyse` calls in the same tick it connects the
  // dataset — a state value would still be the previous render's (that stale
  // closure is why the connected dataset used to be recorded under its backend
  // id, "DS-1788…", instead of the file's real name).
  const connectedDataset = useRef(null);
  // `isDemo` is a UI label only — the demo file goes through the identical
  // upload/validate/train path a real file does.
  const isDemo = useRef(false);
  // The file behind the connected dataset, so History can keep a copy of it.
  // Null for a CRM import, which has no file to keep.
  const connectedFile = useRef(null);

  const resetFlow = useCallback(() => {
    setPhase(PHASE.CHOOSE);
    setFile(null);
    setUploading(false);
    setProgress(0);
    setUploadError(null);
    connectedDataset.current = null;
    setValidation(null);
    setStageStates(IDLE_STAGES);
    setRunError(null);
    setRestoreError(null);
    isDemo.current = false;
    connectedFile.current = null;
    setDerivingChurn(false);
    setDeriveChurnError(null);
  }, []);

  const setStage = useCallback((updates) => {
    setStageStates((prev) => ({ ...prev, ...updates }));
  }, []);

  // ---------------------------------------------------------------- process --

  /**
   * Map the resolved columns, train, score. `aiResolved` (optional) is the
   * subset of `fieldToColumn` an LLM had to work out rather than the
   * deterministic matcher; `derivedField` (optional) is `{ key, column,
   * sourceColumn, inactivityDays }` when the churn label itself was built
   * from a last-activity date rather than read from the data — both are
   * carried through only so the completion screen can say so, never to
   * change what happens here.
   */
  const process = useCallback(
    async (report, fieldToColumn, aiResolved = [], derivedField = null) => {
      // The backend's wire format is { yourColumnName: churnguardFieldKey }.
      const payload = Object.entries(fieldToColumn).reduce((acc, [fieldKey, column]) => {
        if (column) acc[column] = fieldKey;
        return acc;
      }, {});
      const aiResolvedKeys = new Set(aiResolved.map((f) => f.key));

      setRunError(null);
      setPhase(PHASE.RUNNING);
      setStage({ reading: 'done', understanding: 'done', validating: 'done', preparing: 'active' });

      try {
        await datasetService.mapColumns(report.datasetId, payload);

        setStage({ predicting: 'active' });
        const result = await datasetService.runPrediction(report.datasetId);

        setStage({ preparing: 'done', predicting: 'done', insights: 'active' });

        const requiredTotal = report.requiredTotal;
        const requiredMapped = report.mapping.fields.filter(
          (f) => f.required && fieldToColumn[f.key]
        ).length;
        const optionalDetected = report.mapping.fields.filter(
          (f) => !f.required && fieldToColumn[f.key]
        ).length;
        // Which of the user's columns ended up powering the model. Names only —
        // no values are copied out of the dataset.
        const mappedColumns = report.mapping.fields
          .filter((f) => fieldToColumn[f.key])
          .map((f) => ({
            key: f.key,
            label: f.label,
            column: fieldToColumn[f.key],
            required: Boolean(f.required),
            matchedBy:
              derivedField?.key === f.key ? 'derived' : aiResolvedKeys.has(f.key) ? 'ai' : 'auto',
          }));

        const filename = connectedDataset.current?.filename ?? report.datasetId;
        const datasetRows = report.rows;
        const datasetColumns = report.columns?.length ?? null;

        // Remember this dataset so it can be reconnected later without the
        // user going and finding the file again. Never fatal: if the browser
        // won't store it, setup still completes and History says why.
        let historyId = null;
        try {
          const saved = await datasetHistory.save({
            userKey: user?.email || null,
            name: filename,
            sourceKind: result.source?.kind || (isDemo.current ? 'demo' : 'upload'),
            provider: result.source?.provider || null,
            sourceDetail: result.source?.detail || null,
            rowCount: datasetRows,
            columnCount: datasetColumns,
            requiredFieldCount: requiredMapped,
            requiredTotal,
            mappedFields: result.mappedFields ?? [],
            file: connectedFile.current,
          });
          historyId = saved.id;
        } catch {
          // Storage unavailable or full — see HistoryPage for what the user is told.
        }

        completeDatasetSetup({
          source: result.source,
          isDemo: isDemo.current,
          filename,
          rows: result.customersProcessed ?? datasetRows,
          datasetRows,
          columns: datasetColumns,
          fieldsMapped: requiredMapped,
          requiredTotal,
          optionalDetected,
          optionalTotal: report.optionalTotal ?? null,
          mappedColumns,
          additionalColumns: report.additionalColumns?.length ?? 0,
          // Capped: this record lives in localStorage, and a 300-column file
          // has no business filling it.
          additionalColumnNames: (report.additionalColumns || []).slice(0, 24),
          missingCells: report.missingCells,
          missingPercent: report.missingPercent ?? null,
          duplicateRows: report.duplicateRows,
          labelledChurnCount: result.labelledChurnCount ?? null,
          trainingMetrics: result.trainingMetrics ?? null,
          cleaning: result.cleaning ?? [],
          // Of the "additional" columns above, which ones the model actually
          // ended up training on (real signal, not just present in the file)
          // versus which it looked at and set aside, and why.
          extraColumnsUsed: result.extraColumnsUsed ?? [],
          extraColumnsSkipped: result.extraColumnsSkipped ?? [],
          churnDerivation: derivedField
            ? {
                rule: derivedField.rule,
                sourceColumn: derivedField.sourceColumn,
                inactivityDays: derivedField.inactivityDays,
                note: derivedField.note,
              }
            : null,
          // Set only when this connect had no churn column and was instead
          // scored with a model trained on a different, earlier connect of
          // the same data shape (see resolve_training_eligibility()'s
          // REUSE_MODEL case) -- CompleteStep says so plainly rather than
          // implying a fresh model was just trained on this data.
          reusedModel: result.reusedModel ?? null,
          historyId,
        });

        setStage({ insights: 'done' });
        addToast({ type: 'success', message: 'Your data is ready — Overview unlocked' });
      } catch (err) {
        setStageStates((prev) => {
          const failed = Object.keys(prev).find((k) => prev[k] === 'active');
          return failed ? { ...prev, [failed]: 'error' } : prev;
        });
        setRunError(asUserError(err));
        addToast({ type: 'error', message: 'Processing could not be completed' });
      }
    },
    [completeDatasetSetup, addToast, setStage, user]
  );

  // ---------------------------------------------------------------- analyse --

  /**
   * Everything between "we have data" and "the dashboard is ready", with no
   * user interaction unless the data forces one.
   */
  const analyse = useCallback(
    async (connected) => {
      connectedDataset.current = connected;
      setPhase(PHASE.RUNNING);
      setRunError(null);
      setStage({ reading: 'done', understanding: 'active' });

      try {
        const report = await datasetService.validateDataset(connected.id);
        setValidation(report);
        setStage({ understanding: 'done', validating: 'done' });

        // Data the trainer genuinely cannot use (too few rows, no usable
        // columns) — no amount of smarter column matching fixes this. A
        // missing churn column specifically is handled below instead: the
        // backend already stripped that one issue out when `eligibility`
        // says it isn't actually a dead end (see validate_dataset()).
        if (report.issues?.length > 0) {
          setPhase(PHASE.BLOCKED);
          return;
        }

        // No churn column, but ChurnGuard found a model already trained on
        // this exact data shape — score with it directly, no training step
        // at all. `report.mapping.autoMappings` has no 'churn' key here
        // (that's precisely why eligibility was computed), so process()'s
        // normal payload-building already omits it correctly.
        if (report.eligibility?.state === 'REUSE_MODEL') {
          await process(report, report.mapping.autoMappings);
          return;
        }

        // No churn column, no reusable model, but a plausible proxy label
        // exists — offer it for confirmation instead of blocking outright.
        if (report.eligibility?.state === 'DERIVE_LABEL') {
          setPhase(PHASE.BLOCKED);
          return;
        }

        if (report.eligibility?.state === 'BLOCKED') {
          setPhase(PHASE.BLOCKED);
          return;
        }

        if (report.canAutoProcess) {
          await process(report, report.mapping.autoMappings);
          return;
        }

        // The deterministic matcher couldn't confidently place every required
        // field on its own — ask an LLM for a second opinion before ever
        // asking the user. There is no manual mapping screen: this either
        // resolves it, or the flow explains plainly what it still needs.
        setStage({ understanding: 'active' });
        const autoMap = await datasetService.autoMapColumns(report.datasetId);
        setStage({ understanding: 'done' });

        if (autoMap.resolved) {
          // The backend's wire format is { yourColumnName: churnguardFieldKey };
          // process() needs the opposite direction, { fieldKey: column }.
          const fieldToColumn = Object.fromEntries(
            Object.entries(autoMap.mappings).map(([column, fieldKey]) => [fieldKey, column])
          );
          await process(report, fieldToColumn, autoMap.aiResolved);
          return;
        }

        setValidation({
          ...report,
          issues: autoMap.missingRequired.map((f) => ({
            title: `Couldn't work out which column holds "${f.label}"`,
            why: f.whyNeeded,
            action: f.lookFor,
          })),
        });
        setPhase(PHASE.BLOCKED);
      } catch (err) {
        setStage({ understanding: 'error' });
        setRunError(asUserError(err));
      }
    },
    [process, setStage]
  );

  // ------------------------------------------------------- derive churn from --
  // whichever rule the backend suggested (status column, cancellation date,
  // or last-activity date) when the data has no churn column ChurnGuard's
  // matcher recognises. Offered inline on the blocked screen — never
  // automatic, the user reviews and confirms it first.
  const handleDeriveChurn = useCallback(
    async (rule, column, { inactivityDays, churnValues } = {}) => {
      if (!connectedDataset.current || !validation) return;
      setDerivingChurn(true);
      setDeriveChurnError(null);
      try {
        const result = await datasetService.deriveChurn(connectedDataset.current.id, {
          rule,
          column,
          inactivityDays,
          churnValues,
        });
        if (!result.resolved) {
          setDeriveChurnError({
            message: "That didn't resolve every required field.",
            hint:
              result.missingRequired?.map((f) => f.label).join(', ') ||
              'Some required fields are still unmatched.',
          });
          setDerivingChurn(false);
          return;
        }
        // Wire format is { yourColumnName: churnguardFieldKey }; process()
        // needs the opposite direction, { fieldKey: column }.
        const fieldToColumn = Object.fromEntries(
          Object.entries(result.mappings).map(([col, fieldKey]) => [fieldKey, col])
        );
        setDerivingChurn(false);
        await process(validation, fieldToColumn, [], {
          key: 'churn',
          column: result.derivation?.derivedColumn,
          rule: result.derivation?.rule ?? rule,
          sourceColumn: result.derivation?.sourceColumn ?? column,
          inactivityDays: result.derivation?.inactivityDays ?? inactivityDays,
          note: result.derivation?.note ?? null,
        });
      } catch (err) {
        setDerivingChurn(false);
        setDeriveChurnError(asUserError(err));
      }
    },
    [process, validation]
  );

  // ----------------------------------------------------------------- upload --

  const runUpload = useCallback(
    async (selectedFile) => {
      connectedFile.current = selectedFile;
      setUploading(true);
      setUploadError(null);
      setProgress(0);
      try {
        const uploaded = await datasetService.uploadDataset(selectedFile, setProgress);
        setUploading(false);
        await analyse(uploaded);
      } catch (err) {
        setUploading(false);
        setUploadError(asUserError(err));
        setPhase(PHASE.UPLOAD);
        addToast({ type: 'error', message: 'We could not read that dataset' });
      }
    },
    [analyse, addToast]
  );

  const handleUseDemo = useCallback(async () => {
    isDemo.current = true;
    // Only pulled in when someone actually asks for demo data.
    const { buildDemoDatasetFile } = await import('../mock/demoDataset');
    runUpload(buildDemoDatasetFile());
  }, [runUpload]);

  const handleImported = useCallback(
    (imported) => {
      isDemo.current = false;
      connectedFile.current = null; // a CRM pull has no file to keep
      analyse(imported);
    },
    [analyse]
  );

  // ---------------------------------------------------------------- replace --

  const disconnectCurrent = useCallback(async () => {
    resetDatasetSetup();
    try {
      // Drop it server-side too, so a trained model can't outlive its dataset.
      await datasetService.clearDataset();
    } catch {
      // The local record is already cleared and the next connect overwrites
      // the server's — nothing useful to tell the user here.
    }
  }, [resetDatasetSetup]);

  const handleReplace = useCallback(async () => {
    resetFlow();
    await disconnectCurrent();
    addToast({ type: 'info', message: 'Connect data to unlock your Overview again' });
  }, [disconnectCurrent, resetFlow, addToast]);

  // ---------------------------------------------------------------- restore --

  useEffect(() => {
    if (!restoreId || restoreStarted.current) return;
    restoreStarted.current = true;

    (async () => {
      try {
        const record = await datasetHistory.get(restoreId);
        const restored = toRestorableFile(record);
        if (!record || !restored) {
          setRestoring(false);
          setRestoreError({
            message: UNAVAILABLE_MESSAGE,
            hint:
              record?.unavailableReason ||
              'Datasets are kept in this browser only, so clearing site data or switching browser removes them.',
          });
          return;
        }

        // Whatever is connected now is replaced — a trained model must never
        // outlive the data it was built from.
        if (datasetSetupComplete) await disconnectCurrent();

        isDemo.current = record.sourceKind === 'demo';
        await datasetHistory.touch(record.id).catch(() => {});
        setRestoring(false);
        addToast({ type: 'info', message: `Reconnecting ${record.name}` });
        await runUpload(restored);
      } catch {
        setRestoring(false);
        setRestoreError({
          message: UNAVAILABLE_MESSAGE,
          hint: 'This browser would not let ChurnGuard read its saved datasets.',
        });
      } finally {
        // Drop the parameter so a refresh doesn't kick off a second run.
        setSearchParams({}, { replace: true });
      }
    })();
  }, [
    restoreId,
    datasetSetupComplete,
    disconnectCurrent,
    runUpload,
    addToast,
    setSearchParams,
  ]);

  // --------------------------------------------------------------- rendering --

  const complete = datasetSetupComplete && Boolean(activeDataset);

  // Which stage of DATA → QUALITY → PROCESSING → MODEL → READY we are at.
  const railStage = complete
    ? 'ready'
    : phase === PHASE.RUNNING
      ? stageStates.predicting === 'done'
        ? 'model'
        : stageStates.validating === 'done'
          ? 'processing'
          : 'quality'
      : 'data';

  return (
    <div className="space-y-6">
      {/* ---------- Header: renders immediately, never waits on data ---------- */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-xl font-bold text-text-primary tracking-tight">Data Management</h1>
          <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">
            {complete
              ? 'The dataset powering every prediction, explanation and draft in ChurnGuard — what it contains, what was measured in it, and which of your columns the model is using.'
              : 'Connect the customer data ChurnGuard analyses. It reads your file, checks its quality, works out which column is which, and trains a model on it.'}
          </p>
        </div>
        {/* Both actions are secondary on purpose: the primary thing to do with
            a ready dataset is go and use it (that CTA sits with the model),
            and replacing one discards predictions — not a green button. */}
        {complete && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button variant="secondary" size="sm" icon={History} onClick={() => navigate('/history')}>
              Dataset history
            </Button>
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={handleReplace}>
              Replace dataset
            </Button>
          </div>
        )}
      </header>

      <DataFlowRail current={railStage} />

      {/* Nothing in setup can work without the API, so say so before the user
          picks a file rather than failing afterwards with a data-shaped error. */}
      {!complete && <BackendNotice />}

      {restoreError && (
        <Card role="alert" className="max-w-2xl border-risk-critical/30 bg-risk-critical/[0.05]">
          <h2 className="text-sm font-semibold text-text-primary">{restoreError.message}</h2>
          <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">{restoreError.hint}</p>
          <Button size="sm" variant="secondary" className="mt-3" onClick={() => navigate('/history')}>
            Back to history
          </Button>
        </Card>
      )}

      {restoring ? (
        <Card className="max-w-2xl space-y-3">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-3 w-80" />
          <Skeleton className="h-24 w-full" />
          <span className="sr-only">Loading your saved dataset</span>
        </Card>
      ) : complete ? (
        <CompleteStep
          summary={activeDataset}
          onViewOverview={() => navigate('/dashboard')}
          onViewCustomers={() => navigate('/customers')}
        />
      ) : (
        <Suspense fallback={<StepFallback />}>
          {phase === PHASE.CHOOSE && (
            <SourceSelector
              onSelect={(key) => setPhase(key === 'crm' ? PHASE.CRM : PHASE.UPLOAD)}
              onViewHistory={() => navigate('/history')}
            />
          )}

          {phase === PHASE.UPLOAD && (
            <UploadStep
              file={file}
              onSelectFile={(selected) => {
                setUploadError(null);
                setFile(selected);
              }}
              onClearFile={() => setFile(null)}
              onUpload={() => runUpload(file)}
              onUseDemo={handleUseDemo}
              onBack={resetFlow}
              uploading={uploading}
              progress={progress}
              error={uploadError}
              onError={setUploadError}
            />
          )}

          {phase === PHASE.CRM && (
            <CrmConnectStep onBack={resetFlow} onImported={handleImported} />
          )}

          {phase === PHASE.RUNNING && (
            <PipelineProgress
              stageStates={stageStates}
              error={runError}
              onRetry={() =>
                connectedDataset.current ? analyse(connectedDataset.current) : runUpload(file)
              }
              onStartOver={resetFlow}
            />
          )}

          {phase === PHASE.BLOCKED && validation && (
            <IssueList
              validation={validation}
              onStartOver={resetFlow}
              onDeriveChurn={handleDeriveChurn}
              derivingChurn={derivingChurn}
              deriveChurnError={deriveChurnError}
            />
          )}
        </Suspense>
      )}
    </div>
  );
}
