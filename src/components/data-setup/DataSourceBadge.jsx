import { FileSpreadsheet, Plug, Sparkles } from 'lucide-react';

/**
 * Says where the data currently driving the app came from.
 *
 * The source is whatever the backend recorded when the dataset was connected
 * (`store.DatasetSource`), never a guess and never a hardcoded "Demo" — real
 * uploaded data must not be labelled as demo data, and demo data must not be
 * passed off as real.
 */

const KINDS = {
  upload: { icon: FileSpreadsheet, label: 'Uploaded file' },
  demo: { icon: Sparkles, label: 'Demo dataset' },
  crm: { icon: Plug, label: 'Connected CRM' },
};

export default function DataSourceBadge({ source, filename, className = '' }) {
  if (!source && !filename) return null;

  const kind = KINDS[source?.kind] || KINDS.upload;
  const Icon = kind.icon;
  // `label` is the provider's own name for a CRM ("HubSpot"); `detail` is the
  // specific thing that was read (the file name, or the CRM object).
  const primary = source?.label || kind.label;
  const detail = source?.detail || filename;

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-lg border border-border bg-bg-tertiary/40 px-2.5 py-1.5 ${className}`}
    >
      <Icon size={13} className="text-text-tertiary shrink-0" />
      <span className="text-[11px] text-text-tertiary">Data source</span>
      <span className="text-xs font-medium text-text-primary truncate max-w-[16rem]">
        {primary}
      </span>
      {detail && detail !== primary && (
        <span className="text-[11px] text-text-tertiary truncate max-w-[14rem] hidden sm:inline">
          · {detail}
        </span>
      )}
    </div>
  );
}
