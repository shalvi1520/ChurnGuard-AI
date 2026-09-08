import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileSpreadsheet, X, Sparkles, AlertTriangle, ChevronDown, ArrowLeft } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { CHURNGUARD_FIELDS } from '../../mock/datasetSchema';
import { DATASET_UPLOAD } from '../../services/api';
import { DEMO_DATASET_ROWS } from '../../mock/demoDataset';
import { formatNumber } from '../../utils/helpers';

const MAX_SIZE_LABEL = `${Math.round(DATASET_UPLOAD.maxSizeBytes / (1024 * 1024))}MB`;
// Both the dropzone filter and the "Supported formats" line come from the
// service layer's list, which mirrors what the backend parser actually handles.
const FORMATS = DATASET_UPLOAD.extensions.map((e) => e.replace('.', '').toUpperCase());

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function describeRejection(rejection) {
  const code = rejection?.errors?.[0]?.code;
  if (code === 'file-too-large') {
    return {
      message: `"${rejection.file.name}" is larger than ${MAX_SIZE_LABEL}.`,
      hint: 'Split the export into smaller files, or upload a recent subset of your customers.',
    };
  }
  if (code === 'too-many-files') {
    return {
      message: 'Please add one file at a time.',
      hint: 'ChurnGuard analyses a single customer dataset per setup.',
    };
  }
  return {
    message: `That file type isn't supported. Upload ${FORMATS.join(', ')}.`,
    hint: 'In Excel or Google Sheets use File → Save as / Download to export one of these formats.',
  };
}

/**
 * Choose a file to analyse.
 *
 * The old version of this screen led with a full field guide, because the user
 * then had to map every column by hand. They don't any more — ChurnGuard works
 * the columns out itself — so the guide is collapsed by default. It is still
 * here, because "what does it actually need?" is a fair question to be able to
 * answer before uploading; it is just no longer homework.
 */
export default function UploadStep({
  file,
  onSelectFile,
  onClearFile,
  onUpload,
  onUseDemo,
  onBack,
  uploading,
  progress,
  error,
  onError,
}) {
  const [showFields, setShowFields] = useState(false);

  const onDrop = useCallback(
    (accepted) => {
      if (accepted.length > 0) onSelectFile(accepted[0]);
    },
    [onSelectFile]
  );

  const onDropRejected = useCallback(
    (rejections) => {
      onError(describeRejection(rejections[0]));
    },
    [onError]
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    onDropRejected,
    accept: DATASET_UPLOAD.accept,
    maxFiles: 1,
    multiple: false,
    maxSize: DATASET_UPLOAD.maxSizeBytes,
    noClick: true,
    noKeyboard: true,
    disabled: uploading,
  });

  const requiredFields = CHURNGUARD_FIELDS.filter((f) => f.required);
  const optionalFields = CHURNGUARD_FIELDS.filter((f) => !f.required);

  return (
    <div className="space-y-5 max-w-2xl">
      <Card>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Upload your customer data</h2>
            <p className="text-xs text-text-secondary mt-1 leading-relaxed">
              One row per customer, with a header row naming each column. ChurnGuard works out
              which column is which — you do not need to rename anything first.
            </p>
          </div>
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0">
              <ArrowLeft size={14} className="mr-1.5" />
              Back
            </Button>
          )}
        </div>

        <div
          {...getRootProps()}
          className={`rounded-xl border-2 border-dashed p-8 sm:p-10 text-center transition-colors ${
            isDragActive ? 'border-accent bg-accent/5' : 'border-border'
          } ${uploading ? 'opacity-60' : ''}`}
        >
          <input {...getInputProps()} aria-label="Choose a dataset file" />
          <div className="w-12 h-12 rounded-xl bg-bg-tertiary/60 flex items-center justify-center mx-auto mb-3">
            <Upload size={20} className={isDragActive ? 'text-accent' : 'text-text-tertiary'} />
          </div>
          <p className="text-sm font-medium text-text-primary">
            {isDragActive ? 'Drop your file to add it' : 'Drag your dataset here'}
          </p>
          <p className="text-xs text-text-tertiary mt-1 mb-4">
            or choose a file from your computer
          </p>
          <Button variant="secondary" size="sm" onClick={open} disabled={uploading} type="button">
            Browse files
          </Button>

          <div className="mt-5 pt-4 border-t border-border/60">
            <div className="flex items-center justify-center gap-1.5 flex-wrap">
              {FORMATS.map((format) => (
                <span
                  key={format}
                  className="px-2 py-0.5 rounded bg-bg-tertiary text-[10px] font-medium text-text-secondary"
                >
                  {format}
                </span>
              ))}
            </div>
            {/* The file is parsed by the ChurnGuard backend (pandas), not in the
                browser. Saying otherwise would be untrue. */}
            <p className="text-[11px] text-text-tertiary mt-2.5">
              Up to {MAX_SIZE_LABEL} · processed by your ChurnGuard backend, not shared with anyone
              else
            </p>
          </div>
        </div>

        {file && (
          <div className="mt-4 p-3 rounded-lg bg-bg-tertiary/30 border border-border flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <FileSpreadsheet size={18} className="text-accent shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{file.name}</p>
                <p className="text-xs text-text-tertiary">{formatFileSize(file.size)}</p>
              </div>
            </div>
            {!uploading && (
              <button
                onClick={onClearFile}
                className="p-1.5 rounded-md text-text-tertiary hover:text-risk-critical hover:bg-bg-tertiary transition-colors cursor-pointer shrink-0"
                aria-label={`Remove ${file.name}`}
                type="button"
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}

        {uploading && (
          <div className="mt-3" aria-live="polite">
            <div className="flex justify-between text-xs text-text-tertiary mb-1.5">
              <span>Sending your file…</span>
              <span className="tabular-nums">{progress}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {file && !uploading && (
          <Button className="mt-4 w-full" size="lg" icon={Upload} onClick={onUpload}>
            Analyse this file
          </Button>
        )}

        {error && (
          <div
            role="alert"
            className="mt-4 p-3 rounded-lg bg-risk-critical/10 border border-risk-critical/25 flex gap-2.5"
          >
            <AlertTriangle size={15} className="text-risk-critical shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-risk-critical">{error.message}</p>
              {error.hint && (
                <p className="text-xs text-text-secondary mt-1 leading-relaxed">{error.hint}</p>
              )}
            </div>
          </div>
        )}

        {/* ---------- What it looks for (collapsed: no longer a task) ---------- */}
        <div className="mt-4 border-t border-border/60 pt-4">
          <button
            type="button"
            onClick={() => setShowFields((v) => !v)}
            aria-expanded={showFields}
            className="flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          >
            <ChevronDown
              size={13}
              className={`transition-transform ${showFields ? 'rotate-180' : ''}`}
            />
            What does ChurnGuard look for in my file?
          </button>

          {showFields && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
                  Needed to predict churn
                </p>
                <ul className="space-y-1.5">
                  {requiredFields.map((f) => (
                    <li key={f.key} className="text-xs text-text-secondary leading-relaxed">
                      <span className="font-medium text-text-primary">{f.label}</span> —{' '}
                      {f.description}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
                  Used if present
                </p>
                <ul className="space-y-1.5">
                  {optionalFields.map((f) => (
                    <li key={f.key} className="text-xs text-text-secondary leading-relaxed">
                      <span className="font-medium text-text-primary">{f.label}</span> —{' '}
                      {f.description}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="sm:col-span-2 text-xs text-text-tertiary leading-relaxed">
                Your column names do not have to match these. Any other columns in the file are
                kept as additional data and simply not used for scoring.
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* ---------- Demo dataset ---------- */}
      <Card className="border-accent/25 bg-accent/[0.03]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
              <Sparkles size={16} className="text-accent" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-text-primary">Explore with demo data</h3>
                <Badge variant="accent" size="xs">
                  DEMO DATA
                </Badge>
              </div>
              <p className="text-xs text-text-secondary mt-1 leading-relaxed max-w-md">
                No dataset to hand? Load a sample of {formatNumber(DEMO_DATASET_ROWS)} fictional
                customers and run the exact same setup. A real model is trained on it, but the
                customers are invented — the results are illustrative, not real predictions.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            icon={Sparkles}
            onClick={onUseDemo}
            disabled={uploading}
            type="button"
          >
            Use demo dataset
          </Button>
        </div>
      </Card>
    </div>
  );
}
