import { ArrowRight, CheckCircle2, Clock, Sparkles, Users, Wand2, Zap } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Disclosure from '../ui/Disclosure';
import { InfoTip } from '../ui/Tooltip';
import DataSourceBadge from './DataSourceBadge';
import { formatDate, formatNumber } from '../../utils/helpers';

/**
 * The connected dataset, in full: where it came from, what is actually in it,
 * which of the user's columns the model is using, and how that model scored.
 *
 * Every number here is measured from the connected dataset or returned by the
 * training run — nothing is illustrative, and anything unavailable is left out
 * rather than filled in, which is why so much below is conditional.
 *
 * INFORMATION HIERARCHY: someone who only wants to know "is my data ready?"
 * should be able to read the summary row and stop. Everything that answers
 * "what exactly did you do with my file?" is still here in full, one click
 * away inside the processing-details disclosure — collapsed, not removed.
 *
 * SCOPE: this page describes DATA — quality, readiness and provenance.
 * Portfolio numbers (revenue at risk, customers at risk) belong to
 * Portfolio & Risk and are deliberately not repeated here.
 *
 * It reads entirely from the record `AppContext` already holds, so opening
 * Data Management with a dataset connected makes no API calls at all.
 */

function Stat({ label, value, help }) {
  return (
    <div>
      <dt className="text-[11px] text-text-tertiary flex items-center gap-1">
        {label}
        {help && <InfoTip content={help} label={`About ${label}`} size={11} />}
      </dt>
      <dd className="text-sm font-semibold text-text-primary tabular-nums mt-0.5">{value}</dd>
    </div>
  );
}

function SectionTitle({ children, help }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary flex items-center gap-1.5">
      {children}
      {help && <InfoTip content={help} size={12} />}
    </h3>
  );
}

/** One line of the "how your data was used" strip: a plain label, a plain
 *  value, detail behind the info icon. Deliberately not a MetricCard — see
 *  PROJECT_MEMORY: importing one here drags Recharts into a route that draws
 *  no charts. */
function FactRow({ label, value, help }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-border/50 last:border-0">
      <dt className="text-xs text-text-secondary flex items-center gap-1.5 min-w-0">
        {label}
        {help && <InfoTip content={help} label={`About ${label}`} size={11} />}
      </dt>
      <dd className="text-xs font-semibold text-text-primary tabular-nums shrink-0">{value}</dd>
    </div>
  );
}

/** The probability ranges ChurnGuard uses to label a customer's risk level
 *  -- must match backend/api/dataset_routes.py's _risk_tier() exactly, since
 *  this is describing that function's actual behavior, not a suggestion. */
const RISK_THRESHOLDS = [
  { key: 'critical', label: 'Critical', range: '80% and above', desc: 'Needs immediate attention' },
  { key: 'high', label: 'High', range: '60% – 79%', desc: 'Should be prioritized for outreach' },
  { key: 'medium', label: 'Medium', range: '35% – 59%', desc: 'Worth keeping an eye on' },
  { key: 'low', label: 'Low', range: 'Below 35%', desc: 'Currently stable' },
];

/** Business-facing framing of what the trained model actually does: which
 *  churn-probability ranges get labeled which way across the rest of the
 *  app. Deliberately shows only this, not the underlying ML metrics
 *  (accuracy/precision/recall/ROC-AUC) -- those describe the model in terms
 *  meaningful to a data scientist, not the person using this app. */
function RiskConfiguration() {
  return (
    <ul className="space-y-2">
      {RISK_THRESHOLDS.map((tier) => (
        <li key={tier.key} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`w-2 h-2 rounded-full shrink-0 bg-risk-${tier.key}`}
              aria-hidden="true"
            />
            <span className="text-xs font-semibold text-text-primary">{tier.label}</span>
            <span className="text-xs text-text-tertiary truncate">{tier.desc}</span>
          </div>
          <span className="text-xs font-semibold text-text-primary tabular-nums shrink-0">
            {tier.range}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Only ever lists operations the backend reported actually running. */
function CleaningDetail({ cleaning }) {
  if (!cleaning?.length) return null;

  return (
    <div>
      <SectionTitle help="ChurnGuard applied these to prepare your data for training. Your original file is unchanged.">
        Fixed automatically
      </SectionTitle>
      <ul className="mt-2.5 space-y-1.5">
        {cleaning.map((action, i) => (
          <li
            key={`${action.action}-${i}`}
            className="text-xs text-text-secondary leading-relaxed flex gap-2"
          >
            <span className="text-success mt-0.5 shrink-0" aria-hidden="true">
              •
            </span>
            <span>{action.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MappingRow({ column }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-xs font-medium text-text-primary">{column.label}</span>
      <span className="text-[11px] text-text-tertiary" aria-hidden="true">
        ←
      </span>
      <span className="text-xs text-text-secondary font-mono truncate max-w-full">
        {column.column}
      </span>
      {column.matchedBy === 'ai' && (
        <Badge variant="accent" size="xs" className="inline-flex items-center gap-1">
          <Sparkles size={10} aria-hidden="true" />
          AI-matched
        </Badge>
      )}
      {column.matchedBy === 'derived' && (
        <Badge variant="accent" size="xs" className="inline-flex items-center gap-1">
          <Clock size={10} aria-hidden="true" />
          Derived
        </Badge>
      )}
      <Badge variant="default" size="xs" className="ml-auto">
        {column.required ? 'Required' : 'Optional'}
      </Badge>
    </li>
  );
}

/** Your columns on the right, the ChurnGuard field each one filled on the
 *  left. This is the literal answer to "what did it do with my file?". */
function MappingDetail({ mappedColumns, optionalDetected, optionalTotal }) {
  if (!mappedColumns?.length) return null;
  const required = mappedColumns.filter((c) => c.required);
  const optional = mappedColumns.filter((c) => !c.required);

  const anyAiMatched = mappedColumns.some((c) => c.matchedBy === 'ai');
  const anyDerived = mappedColumns.some((c) => c.matchedBy === 'derived');

  return (
    <div>
      <SectionTitle help="ChurnGuard matched your column names and values against the fields its model needs automatically — there is no mapping screen to fill in. Most matches come from names and values alone; when that wasn't confident enough, an AI made the call instead.">
        Your columns, and what each one became
      </SectionTitle>
      <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
        Your column names are on the right, the ChurnGuard field each one filled on the left.
        {anyAiMatched &&
          ' Fields marked "AI-matched" needed a second opinion beyond names and values alone.'}
        {anyDerived && ' The field marked "Derived" was calculated, not read directly from your data.'}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 mt-3">
        <ul>
          {required.map((c) => (
            <MappingRow key={c.key} column={c} />
          ))}
        </ul>
        <ul>
          {optional.map((c) => (
            <MappingRow key={c.key} column={c} />
          ))}
        </ul>
      </div>

      {typeof optionalDetected === 'number' && optionalTotal ? (
        <p className="text-[11px] text-text-tertiary leading-relaxed mt-2.5">
          {optionalDetected} of {optionalTotal} optional fields were found in this file. Missing
          optional fields don&apos;t stop anything — they just add detail when present.
        </p>
      ) : null}
    </div>
  );
}

/** The columns beyond the mapped fields: the ones the model genuinely trained
 *  on, and the ones it looked at and set aside — with the reason, grouped, so
 *  six near-identical lines read as one fact instead of six. */
function ExtraColumnsDetail({
  extraColumnsUsed,
  extraColumnsSkipped,
  additionalColumns,
  additionalColumnNames,
}) {
  const hasBreakdown = Boolean(extraColumnsUsed?.length || extraColumnsSkipped?.length);

  // A dataset connected before the used/skipped split existed has neither
  // field in its stored summary — fall back to the older, more general line
  // rather than claiming a breakdown that was never recorded.
  if (!hasBreakdown) {
    if (!additionalColumns) return null;
    const shown = additionalColumnNames?.slice(0, 8) || [];
    return (
      <div>
        <SectionTitle>Other columns in your file</SectionTitle>
        <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
          {formatNumber(additionalColumns)}{' '}
          {additionalColumns === 1 ? 'column was' : 'columns were'} left alone — kept in your file,
          not used for scoring
          {shown.length
            ? `: ${shown.join(', ')}${additionalColumns > shown.length ? ' and more' : ''}`
            : ''}
          .
        </p>
      </div>
    );
  }

  // Grouped by reason so "looks like an identifier" is said once rather than
  // once per column.
  const byReason = new Map();
  (extraColumnsSkipped || []).forEach(({ column, reason }) => {
    const list = byReason.get(reason) || [];
    list.push(column);
    byReason.set(reason, list);
  });

  return (
    <div className="space-y-4">
      {extraColumnsUsed?.length > 0 && (
        <div>
          <SectionTitle help="Columns outside ChurnGuard's own field list that still carried real predictive signal, so the model trained on them as well.">
            Extra columns the model used
          </SectionTitle>
          <p className="text-xs text-text-secondary mt-1.5 leading-relaxed break-words">
            {extraColumnsUsed.join(', ')}.
          </p>
        </div>
      )}

      {byReason.size > 0 && (
        <div>
          <SectionTitle>Columns left out of training</SectionTitle>
          <ul className="mt-2 space-y-2">
            {[...byReason.entries()].map(([reason, columns]) => (
              <li key={reason}>
                <p className="text-xs text-text-secondary leading-relaxed">{reason}</p>
                <p className="text-[11px] text-text-tertiary font-mono leading-relaxed mt-0.5 break-words">
                  {columns.join(', ')}
                </p>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-text-tertiary leading-relaxed mt-2.5">
            These columns are still in your file — they were just not used to predict churn.
          </p>
        </div>
      )}
    </div>
  );
}

export default function CompleteStep({ summary, onViewOverview, onViewCustomers }) {
  const {
    filename,
    rows,
    datasetRows,
    columns,
    fieldsMapped,
    optionalDetected,
    optionalTotal,
    requiredTotal,
    mappedColumns,
    additionalColumns,
    additionalColumnNames,
    missingCells,
    duplicateRows,
    labelledChurnCount,
    cleaning,
    extraColumnsUsed,
    extraColumnsSkipped,
    churnDerivation,
    reusedModel,
    source,
    completedAt,
  } = summary || {};

  const rowsInFile = typeof datasetRows === 'number' ? datasetRows : rows;
  const usedCount = extraColumnsUsed?.length ?? 0;
  const skippedCount = extraColumnsSkipped?.length ?? 0;
  const cleaningCount = cleaning?.length ?? 0;
  const hasDetails =
    Boolean(mappedColumns?.length) ||
    cleaningCount > 0 ||
    usedCount > 0 ||
    skippedCount > 0 ||
    Boolean(additionalColumns);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* ---------- The dataset itself ---------- */}
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
                  <CheckCircle2 size={18} className="text-success" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-text-primary truncate">
                    {filename || 'Connected dataset'}
                  </h2>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {completedAt
                      ? `Processed ${formatDate(completedAt)}`
                      : 'Processed in this session'}
                  </p>
                </div>
              </div>
              <Badge variant="active" size="sm">
                Ready
              </Badge>
            </div>

            <div className="mt-3">
              <DataSourceBadge source={source} filename={filename} />
            </div>

            {reusedModel && (
              <div className="mt-4 rounded-lg border border-accent/25 bg-accent/[0.04] p-3 flex items-start gap-2.5">
                <Zap size={14} className="text-accent mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-xs font-medium text-text-primary">
                    Scored against your existing model — no retraining needed
                  </p>
                  <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                    This data had no churn column, so ChurnGuard reused a model it already trained
                    on data shaped the same way
                    {reusedModel.trainedAt ? ` (${formatDate(reusedModel.trainedAt)})` : ''}.
                    {reusedModel.driftState === 'moderate' &&
                      ' This data looks somewhat different from what that model was trained on — treat these scores with a bit more caution.'}
                    {reusedModel.driftState === 'high' &&
                      ' This data looks quite different from what that model was trained on, so these scores may not be reliable. Connecting a churn column would let ChurnGuard train fresh on this data instead.'}
                  </p>
                </div>
              </div>
            )}

            {/* ---------- Measured facts: the part everyone reads ---------- */}
            <div className="mt-5 pt-5 border-t border-border">
              <SectionTitle help="Counted from the file itself when it was read — not estimates, and not model output.">
                Dataset summary
              </SectionTitle>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-4 mt-3">
                {typeof rowsInFile === 'number' && (
                  <Stat
                    label="Rows"
                    value={formatNumber(rowsInFile)}
                    help="Customer records read from your file, before duplicates were excluded."
                  />
                )}
                {typeof columns === 'number' && (
                  <Stat
                    label="Columns"
                    value={formatNumber(columns)}
                    help="Columns found in your file. Not all of them predict churn — the processing details below say which were used."
                  />
                )}
                {typeof missingCells === 'number' && (
                  <Stat
                    label="Blank values"
                    value={formatNumber(missingCells)}
                    help="Empty cells across the whole file. Numeric gaps are filled with the column's median; missing categories become their own group."
                  />
                )}
                {typeof duplicateRows === 'number' && (
                  <Stat
                    label="Duplicate rows"
                    value={formatNumber(duplicateRows)}
                    help="Identical rows found in your file. Exact duplicates are excluded from training."
                  />
                )}
                {typeof labelledChurnCount === 'number' && (
                  <Stat
                    label={churnDerivation ? 'Estimated churn examples' : 'Past churn examples'}
                    value={formatNumber(labelledChurnCount)}
                    help={
                      churnDerivation
                        ? `Customers estimated as churned from inactivity (${churnDerivation.inactivityDays}+ days since ${churnDerivation.sourceColumn}), not a recorded cancellation. These are what the model learned the pattern from.`
                        : 'Customers in your data with a recorded churn outcome. These are what the model learned the pattern from.'
                    }
                  />
                )}
                {typeof rows === 'number' && (
                  <Stat
                    label="Customers scored"
                    value={formatNumber(rows)}
                    help="Records that made it through cleaning and now carry a churn score."
                  />
                )}
              </dl>
            </div>
          </Card>

          {/* ---------- How the data was used: summary first, detail on request ---------- */}
          <Card>
            <h2 className="text-sm font-semibold text-text-primary">How ChurnGuard used your data</h2>
            <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
              Your columns were matched to the fields the model needs, the data was cleaned, and
              every customer was scored. Nothing further is needed from you.
            </p>

            <dl className="mt-4">
              {typeof fieldsMapped === 'number' && (
                <FactRow
                  label="Required fields matched"
                  value={
                    requiredTotal
                      ? `${Math.min(fieldsMapped, requiredTotal)} of ${requiredTotal}`
                      : formatNumber(fieldsMapped)
                  }
                  help="The fields the churn model needs. ChurnGuard matched these to your columns automatically."
                />
              )}
              {typeof optionalDetected === 'number' && (
                <FactRow
                  label="Optional fields found"
                  value={
                    optionalTotal
                      ? `${optionalDetected} of ${optionalTotal}`
                      : formatNumber(optionalDetected)
                  }
                  help="Extra fields that were present in your data and add detail to the customer view. Missing ones stop nothing."
                />
              )}
              {usedCount > 0 && (
                <FactRow
                  label="Other useful columns used"
                  value={`${formatNumber(usedCount)} ${usedCount === 1 ? 'column' : 'columns'}`}
                  help="Columns outside ChurnGuard's field list that still carried real signal, so the model trained on them too."
                />
              )}
              {skippedCount > 0 && (
                <FactRow
                  label="Columns left out"
                  value={`${formatNumber(skippedCount)} ${skippedCount === 1 ? 'column' : 'columns'}`}
                  help="Left out of training only — every column is still in your file, unchanged."
                />
              )}
              {cleaningCount > 0 && (
                <FactRow
                  label="Issues fixed automatically"
                  value={formatNumber(cleaningCount)}
                  help="Cleaning steps ChurnGuard ran before training, such as filling blanks or dropping duplicate rows. Your original file is unchanged."
                />
              )}
            </dl>

            {skippedCount > 0 && (
              <p className="text-xs text-text-tertiary mt-3 leading-relaxed">
                Columns are usually left out because they identify the customer, hold a date, never
                change, or repeat a field already in use.
              </p>
            )}

            {churnDerivation?.sourceColumn && (
              <div className="mt-4 rounded-lg border border-accent/25 bg-accent/[0.04] p-3 flex items-start gap-2">
                <Clock size={13} className="text-accent mt-0.5 shrink-0" aria-hidden="true" />
                <p className="text-xs text-text-secondary leading-relaxed">
                  Your data had no churn or cancellation column, so churn was estimated from{' '}
                  <span className="font-mono text-text-primary">{churnDerivation.sourceColumn}</span>
                  {churnDerivation.note ? `: ${churnDerivation.note}` : ''}. This is an estimate,
                  not a recorded outcome — treat predictions built on it accordingly.
                </p>
              </div>
            )}

            {hasDetails && (
              <Disclosure
                className="mt-4 pt-4 border-t border-border"
                label="View processing details"
                openLabel="Hide processing details"
                contentClassName="space-y-5"
              >
                <MappingDetail
                  mappedColumns={mappedColumns}
                  optionalDetected={optionalDetected}
                  optionalTotal={optionalTotal}
                />
                <ExtraColumnsDetail
                  extraColumnsUsed={extraColumnsUsed}
                  extraColumnsSkipped={extraColumnsSkipped}
                  additionalColumns={additionalColumns}
                  additionalColumnNames={additionalColumnNames}
                />
                <CleaningDetail cleaning={cleaning} />
              </Disclosure>
            )}
          </Card>
        </div>

        {/* ---------- The model built from it ---------- */}
        <Card>
          <div className="flex items-start gap-2.5">
            <Wand2 size={16} className="text-accent mt-0.5 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-text-primary">Model trained on this data</h2>
              <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                A model was trained on your customers and scored against ones it had never seen.
              </p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-border">
            <SectionTitle help="These are the churn-probability ranges ChurnGuard uses to label a customer's risk level everywhere in the app.">
              What each risk level means
            </SectionTitle>
            <div className="mt-3">
              <RiskConfiguration />
            </div>
          </div>

          <div className="mt-5 pt-5 border-t border-border">
            <SectionTitle>Where to go next</SectionTitle>
            <p className="text-xs text-text-secondary mt-1.5 mb-3 leading-relaxed">
              Start with the portfolio picture, or go straight to the accounts that need attention.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={onViewOverview}>
                View Portfolio &amp; Risk
                <ArrowRight size={14} className="ml-1" aria-hidden="true" />
              </Button>
              <Button variant="secondary" size="sm" onClick={onViewCustomers} icon={Users}>
                Customers
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* ---------- Replace ---------- */}
      {/* The action itself lives in the page header; this says what it costs,
          which is not something to hide behind a tooltip. */}
      <div className="rounded-xl border border-border bg-bg-tertiary/25 px-5 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            Replacing this dataset
            <Badge variant="default" size="xs">
              Clears predictions
            </Badge>
          </h3>
          <p className="text-xs text-text-secondary mt-1 leading-relaxed max-w-2xl">
            <span className="text-text-primary font-medium">Replace dataset</span>, at the top of
            this page, swaps this data out and retrains the model. The current customers, risk
            scores and drafts are discarded — a model is never left running on data it wasn&apos;t
            built from. This dataset stays in your History, ready to reconnect.
          </p>
        </div>
      </div>
    </div>
  );
}
