import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import Card from '../components/ui/Card';
import SetupStepper from '../components/data-setup/SetupStepper';
import UploadStep from '../components/data-setup/UploadStep';
import ValidationStep from '../components/data-setup/ValidationStep';
import MappingStep from '../components/data-setup/MappingStep';
import ProcessingStep from '../components/data-setup/ProcessingStep';
import CompleteStep from '../components/data-setup/CompleteStep';
import { SETUP_STEPS, PROCESSING_STAGES } from '../components/data-setup/steps';
import { datasetService, DatasetError } from '../services/api';
import { buildDemoDatasetFile } from '../mock/demoDataset';
import { useApp } from '../context/AppContext';
import { delay } from '../utils/helpers';

const STEP = { UPLOAD: 0, VALIDATE: 1, MAP: 2, PROCESS: 3, PREDICT: 4 };

const IDLE_STAGES = Object.fromEntries(PROCESSING_STAGES.map((s) => [s.key, 'pending']));

const GENERIC_ERROR = {
  message: 'Something went wrong while handling your dataset.',
  hint: 'Please try again — if it keeps happening, use a different file or the demo dataset.',
};

/** DatasetError carries user-facing copy; anything else gets a safe fallback. */
function asUserError(err) {
  return err instanceof DatasetError ? { message: err.message, hint: err.hint } : GENERIC_ERROR;
}

/** Keeps a stage on screen long enough to read while the real work completes. */
function withMinDuration(promise, ms = 550) {
  return Promise.all([promise, delay(ms)]).then(([result]) => result);
}

export default function DataManagementPage() {
  const navigate = useNavigate();
  const { addToast, datasetSetupComplete, activeDataset, completeDatasetSetup, resetDatasetSetup } = useApp();

  const [stepIndex, setStepIndex] = useState(STEP.UPLOAD);
  const [file, setFile] = useState(null);
  const [source, setSource] = useState('upload');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState(null);

  const [dataset, setDataset] = useState(null);
  const [validation, setValidation] = useState(null);
  const [validating, setValidating] = useState(false);

  const [mappings, setMappings] = useState({});
  const [stageStates, setStageStates] = useState(IDLE_STAGES);
  const [processError, setProcessError] = useState(null);
  const [submittingMapping, setSubmittingMapping] = useState(false);

  const resetFlow = useCallback(() => {
    setStepIndex(STEP.UPLOAD);
    setFile(null);
    setSource('upload');
    setProgress(0);
    setUploadError(null);
    setDataset(null);
    setValidation(null);
    setMappings({});
    setStageStates(IDLE_STAGES);
    setProcessError(null);
  }, []);

  // ---------- Step 1 + 2: upload, then check the file straight away ----------

  const runUploadAndValidation = useCallback(async (selectedFile, fileSource) => {
    setUploading(true);
    setUploadError(null);
    setProgress(0);
    try {
      const uploaded = await datasetService.uploadDataset(selectedFile, setProgress);
      setDataset(uploaded);
      setUploading(false);
      setStepIndex(STEP.VALIDATE);
      setValidating(true);

      const report = await datasetService.validateDataset(uploaded.id);
      setValidation(report);
      setMappings(report.suggestedMappings || {});
      setValidating(false);
      addToast({
        type: report.status === 'blocked' ? 'error' : 'success',
        message:
          report.status === 'blocked'
            ? 'We found problems that stop this file being analysed'
            : `${fileSource === 'demo' ? 'Demo dataset' : 'Dataset'} checked — ${uploaded.rows.toLocaleString()} customers found`,
      });
    } catch (err) {
      setUploading(false);
      setValidating(false);
      setStepIndex(STEP.UPLOAD);
      setDataset(null);
      setUploadError(asUserError(err));
      addToast({ type: 'error', message: 'We could not read that dataset' });
    }
  }, [addToast]);

  const handleSelectFile = useCallback((selected) => {
    setUploadError(null);
    setSource('upload');
    setFile(selected);
  }, []);

  const handleUseDemo = useCallback(() => {
    const demoFile = buildDemoDatasetFile();
    setSource('demo');
    setFile(demoFile);
    runUploadAndValidation(demoFile, 'demo');
  }, [runUploadAndValidation]);

  // ---------- Step 4 + 5: process the dataset, then generate predictions ----------

  const runProcessing = useCallback(async (activeMappings) => {
    // The service contract is `{ yourColumnName: churnguardFieldKey }`.
    const payload = Object.entries(activeMappings).reduce((acc, [fieldKey, column]) => {
      if (column) acc[column] = fieldKey;
      return acc;
    }, {});

    setProcessError(null);
    setSubmittingMapping(true);
    setStepIndex(STEP.PROCESS);
    setStageStates({ ...IDLE_STAGES, received: 'done', validated: 'done', mapped: 'active' });

    try {
      await withMinDuration(datasetService.mapColumns(dataset.id, payload));
      setStageStates((s) => ({ ...s, mapped: 'done', records: 'active' }));
      await delay(550);

      setStageStates((s) => ({ ...s, records: 'done', predictions: 'active' }));
      setStepIndex(STEP.PREDICT);
      const result = await withMinDuration(datasetService.runPrediction(dataset.id), 700);

      setStageStates((s) => ({ ...s, predictions: 'done', insights: 'active' }));
      await delay(550);
      setStageStates((s) => ({ ...s, insights: 'done' }));

      completeDatasetSetup({
        source,
        filename: dataset.filename,
        rows: dataset.rows,
        columns: dataset.columns,
        fieldsMapped: Object.keys(payload).length,
        labelledChurnCount: result?.labelledChurnCount ?? null,
        trainingMetrics: result?.trainingMetrics ?? null,
      });
      addToast({ type: 'success', message: 'Your dataset is ready — Overview unlocked' });
    } catch (err) {
      setStageStates((s) => {
        const failedKey = PROCESSING_STAGES.find((stage) => s[stage.key] === 'active')?.key;
        return failedKey ? { ...s, [failedKey]: 'error' } : s;
      });
      setProcessError(asUserError(err));
      addToast({ type: 'error', message: 'Processing could not be completed' });
    } finally {
      setSubmittingMapping(false);
    }
  }, [dataset, source, completeDatasetSetup, addToast]);

  const handleReplaceDataset = useCallback(() => {
    resetDatasetSetup();
    resetFlow();
    addToast({ type: 'info', message: 'Connect a dataset to unlock your Overview again' });
  }, [resetDatasetSetup, resetFlow, addToast]);

  // ---------- Rendering ----------

  const complete = datasetSetupComplete && Boolean(activeDataset);
  const currentStepLabel = complete ? 'Complete' : SETUP_STEPS[stepIndex].label;

  return (
    <div className="space-y-6">
      {/* Breadcrumb / flow context */}
      <nav aria-label="Breadcrumb">
        <ol className="flex items-center gap-1.5 text-xs text-text-tertiary">
          <li className="font-medium text-text-secondary">Data Setup</li>
          <li aria-hidden="true"><ChevronRight size={12} /></li>
          <li className="text-text-primary font-medium">{currentStepLabel}</li>
        </ol>
      </nav>

      <header className="max-w-2xl">
        <h1 className="text-xl font-bold text-text-primary tracking-tight">
          {complete ? 'Your customer data' : 'Connect Your Customer Data'}
        </h1>
        <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">
          {complete
            ? 'ChurnGuard is running on the dataset below. Replace it at any time to analyse a different customer export.'
            : 'Upload your customer dataset to generate churn predictions, risk explanations and retention insights — the one thing ChurnGuard needs before it can show you anything else.'}
        </p>
      </header>

      <SetupStepper current={stepIndex} complete={complete} />

      {complete ? (
        <CompleteStep
          summary={activeDataset}
          onViewOverview={() => navigate('/dashboard')}
          onViewCustomers={() => navigate('/customers')}
          onReplace={handleReplaceDataset}
        />
      ) : (
        <>
          {stepIndex === STEP.UPLOAD && (
            <UploadStep
              file={file}
              onSelectFile={handleSelectFile}
              onClearFile={() => setFile(null)}
              onUpload={() => runUploadAndValidation(file, source)}
              onUseDemo={handleUseDemo}
              uploading={uploading}
              progress={progress}
              error={uploadError}
              onError={setUploadError}
            />
          )}

          {stepIndex === STEP.VALIDATE && validating && (
            <Card className="py-14 text-center">
              <div className="w-10 h-10 rounded-full border-2 border-border border-t-accent animate-spin mx-auto mb-4" />
              <p className="text-sm font-medium text-text-primary">Checking your file</p>
              <p className="text-xs text-text-tertiary mt-1">
                Counting rows, looking for gaps and duplicates, and matching your columns.
              </p>
            </Card>
          )}

          {stepIndex === STEP.VALIDATE && !validating && validation && dataset && (
            <ValidationStep
              dataset={dataset}
              validation={validation}
              onContinue={() => setStepIndex(STEP.MAP)}
              onRestart={resetFlow}
            />
          )}

          {stepIndex === STEP.MAP && validation && (
            <MappingStep
              validation={validation}
              mappings={mappings}
              onChange={(fieldKey, column) => setMappings((prev) => ({ ...prev, [fieldKey]: column }))}
              onSubmit={() => runProcessing(mappings)}
              onBack={() => setStepIndex(STEP.VALIDATE)}
              submitting={submittingMapping}
            />
          )}

          {(stepIndex === STEP.PROCESS || stepIndex === STEP.PREDICT) && (
            <ProcessingStep
              stageStates={stageStates}
              error={processError}
              onRetry={() => runProcessing(mappings)}
              onBack={() => {
                setProcessError(null);
                setStageStates(IDLE_STAGES);
                setStepIndex(STEP.MAP);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
