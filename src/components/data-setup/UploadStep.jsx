import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileSpreadsheet, X, Sparkles, AlertTriangle, Info } from 'lucide-react';
import Card, { CardHeader, CardTitle, CardDescription } from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { CHURNGUARD_FIELDS } from '../../mock/datasetSchema';
import { DATASET_UPLOAD } from '../../services/api';
import { DEMO_DATASET_ROWS } from '../../mock/demoDataset';
import { formatNumber } from '../../utils/helpers';

const MAX_SIZE_LABEL = `${Math.round(DATASET_UPLOAD.maxSizeBytes / (1024 * 1024))}MB`;
// Both the dropzone filter and the "Supported formats" line come from the
// service layer's list, which mirrors what the parser actually handles.
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
    return { message: 'Please add one file at a time.', hint: 'ChurnGuard analyses a single customer dataset per setup.' };
  }
  return {
    message: `"${rejection?.file?.name || 'That file'}" isn't a format ChurnGuard can read.`,
    hint: `Upload a ${FORMATS.join(', ')} file — in Excel or Google Sheets use File → Save as / Download.`,
  };
}

export default function UploadStep({
  file,
  onSelectFile,
  onClearFile,
  onUpload,
  onUseDemo,
  uploading,
  progress,
  error,
  onError,
}) {
  const onDrop = useCallback((accepted) => {
    if (accepted.length > 0) onSelectFile(accepted[0]);
  }, [onSelectFile]);

  const onDropRejected = useCallback((rejections) => {
    onError(describeRejection(rejections[0]));
  }, [onError]);

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
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">
      {/* ---------- Upload ---------- */}
      <div className="lg:col-span-3 space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Upload your customer dataset</CardTitle>
            <CardDescription>One row per customer, with a header row naming each column.</CardDescription>
          </CardHeader>

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
            <p className="text-xs text-text-tertiary mt-1 mb-4">or choose a file from your computer</p>
            <Button variant="secondary" size="sm" onClick={open} disabled={uploading} type="button">
              Browse files
            </Button>

            <div className="mt-5 pt-4 border-t border-border/60">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
                Supported formats
              </p>
              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                {FORMATS.map((format) => (
                  <span key={format} className="px-2 py-0.5 rounded bg-bg-tertiary text-[10px] font-medium text-text-secondary">
                    {format}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-text-tertiary mt-2.5">
                Up to {MAX_SIZE_LABEL} · read in your browser, never uploaded anywhere
              </p>
            </div>
          </div>

          {/* Selected file */}
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
                <span>Reading and checking your file…</span>
                <span className="tabular-nums">{progress}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
                <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {file && !uploading && (
            <Button className="mt-4 w-full" size="lg" icon={Upload} onClick={onUpload}>
              Continue with this file
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
                {error.hint && <p className="text-xs text-text-secondary mt-1 leading-relaxed">{error.hint}</p>}
              </div>
            </div>
          )}
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
                  <Badge variant="accent" size="xs">DEMO DATA</Badge>
                </div>
                <p className="text-xs text-text-secondary mt-1 leading-relaxed max-w-md">
                  No dataset to hand? Load a sample of {formatNumber(DEMO_DATASET_ROWS)} fictional customers and walk
                  through the exact same setup. Results generated from it are illustrative, not real customer predictions.
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" icon={Sparkles} onClick={onUseDemo} disabled={uploading} type="button">
              Use demo dataset
            </Button>
          </div>
        </Card>
      </div>

      {/* ---------- Requirements ---------- */}
      <div className="lg:col-span-2 space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Before you upload</CardTitle>
            <CardDescription>What ChurnGuard looks for in your file.</CardDescription>
          </CardHeader>

          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Required</p>
          <ul className="space-y-2.5 mb-5">
            {requiredFields.map((field) => (
              <li key={field.key} className="flex gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-text-primary">
                    {field.label}{' '}
                    <span className="text-text-tertiary font-normal">· e.g. {field.example}</span>
                  </p>
                  <p className="text-[11px] text-text-tertiary leading-relaxed mt-0.5">{field.description}</p>
                </div>
              </li>
            ))}
          </ul>

          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
            Helpful, but optional
          </p>
          <ul className="space-y-1.5">
            {optionalFields.map((field) => (
              <li key={field.key} className="flex items-center gap-2.5 text-[11px] text-text-secondary">
                <span className="w-1.5 h-1.5 rounded-full bg-border-light shrink-0" />
                {field.label}
              </li>
            ))}
          </ul>

          <p className="text-[11px] text-text-tertiary mt-4 pt-4 border-t border-border leading-relaxed">
            Column names don't need to match exactly — ChurnGuard suggests matches after upload and you confirm them
            in the mapping step. Any extra columns are kept alongside your dataset.
          </p>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What a row looks like</CardTitle>
          </CardHeader>
          <div className="rounded-lg bg-bg-tertiary/40 border border-border p-3 overflow-x-auto">
            <pre className="text-[10px] leading-relaxed text-text-secondary font-mono whitespace-pre">
{`customerID,tenure,MonthlyCharges,Contract,Churn
7590-VHVEG,34,56.95,One year,No
5575-GNVDE,2,53.85,Month-to-month,Yes`}
            </pre>
          </div>
          <div className="flex gap-2 mt-3 text-[11px] text-text-tertiary leading-relaxed">
            <Info size={13} className="shrink-0 mt-0.5" />
            <p>
              Excel workbooks work as-is. If yours has several sheets, ChurnGuard reads the first one containing data
              and tells you which it used.
            </p>
          </div>
        </Card>

      </div>
    </div>
  );
}
