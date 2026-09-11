import { ArrowRight, CheckCircle2, Clock, Sparkles, Users, Wand2, Zap } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
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
 * SCOPE: this page describes DATA — quality, readiness and provenance.
 * Portfolio numbers (revenue at risk, customers at risk) belong to the
 * Overview and are deliberately not repeated here.
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
function CleaningSummary({ cleaning }) {
  if (!cleaning?.length) return null;

  return (
    <div className="mt-5 pt-5 border-t border-border">
      <SectionTitle help="ChurnGuard applied these to prepare your data for training. Your original file is unchanged.">
        Handled automatically
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

/**
 * Which of the user's columns ended up in the model. This is the answer to
 * "what did it do with my file?" — and the reason the setup flow can get away
 * with asking nothing: it shows its work instead.
 */
function ColumnUsage({
  mappedColumns,
  additionalColumns,
  additionalColumnNames,
  optionalDetected,
  optionalTotal,
  extraColumnsUsed,
  extraColumnsSkipped,
  churnDerivation,
}) {
  if (!mappedColumns?.length) return null;
  const required = mappedColumns.filter((c) => c.required);
  const optional = mappedColumns.filter((c) => !c.required);

  const anyAiMatched = mappedColumns.some((c) => c.matchedBy === 'ai');
  const anyDerived = mappedColumns.some((c) => c.matchedBy === 'derived');

  const Row = ({ column }) => (
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

  return (
    <div className="mt-5 pt-5 border-t border-border">
      <SectionTitle help="ChurnGuard matched your column names and values against the fields its model needs automatically — there is no mapping screen to fill in. Most matches come from names and values alone; when that wasn't confident enough, an AI made the call instead.">
        What ChurnGuard is using
      </SectionTitle>
      <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
        Your columns on the right, the ChurnGuard field each one filled on the left.
        {anyAiMatched && ' Fields marked "AI-matched" needed a second opinion beyond names and values alone.'}
        {anyDerived && ' The field marked "Derived" was calculated, not read directly from your data — see below.'}
      </p>

      {churnDerivation?.sourceColumn && (
        <div className="mt-3 rounded-lg border border-accent/25 bg-accent/[0.04] p-3 flex items-start gap-2">
          <Clock size={13} className="text-accent mt-0.5 shrink-0" />
          <p className="text-xs text-text-secondary leading-relaxed">
            Your data had no churn/cancellation column, so churn was estimated from{' '}
            <span className="font-mono text-text-primary">{churnDerivation.sourceColumn}</span>
            {churnDerivation.note ? `: ${churnDerivation.note}` : ''}. This is an estimate, not a
            recorded outcome — treat predictions built on it accordingly.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 mt-3">
        <ul>
          {required.map((c) => (
            <Row key={c.key} column={c} />
          ))}
        </ul>
        <ul>
          {optional.map((c) => (
            <Row key={c.key} column={c} />
          ))}
        </ul>
      </div>

      <div className="mt-3 space-y-1">
        {typeof optionalDetected === 'number' && optionalTotal ? (
          <p className="text-[11px] text-text-tertiary leading-relaxed">
            {optionalDetected} of {optionalTotal} optional fields were found in this file. Missing
            optional fields don&apos;t stop anything — they just add detail when present.
          </p>
        ) : null}
        {/* Which of the "additional" columns genuinely made it into the model,
            versus which ChurnGuard looked at and set aside, and why — the
            fields the /predict response actually returns. Falls back to the
            older, more general line for a dataset connected before this
            distinction existed (its stored summary won't have these two
            fields at all). */}
        {extraColumnsUsed || extraColumnsSkipped ? (
          <>
            {extraColumnsUsed?.length > 0 && (
              <p className="text-[11px] text-text-tertiary leading-relaxed">
                ChurnGuard also found real signal in {formatNumber(extraColumnsUsed.length)}{' '}
                other {extraColumnsUsed.length === 1 ? 'column' : 'columns'} and used{' '}
                {extraColumnsUsed.length === 1 ? 'it' : 'them'} too: {extraColumnsUsed.join(', ')}.
              </p>
            )}
            {extraColumnsSkipped?.length > 0 && (
              <p className="text-[11px] text-text-tertiary leading-relaxed">
                {formatNumber(extraColumnsSkipped.length)}{' '}
                {extraColumnsSkipped.length === 1 ? 'column wasn\'t' : 'columns weren\'t'} a good
                fit for training and {extraColumnsSkipped.length === 1 ? 'was' : 'were'} left out:{' '}
                {extraColumnsSkipped
                  .slice(0, 6)
                  .map((c) => `${c.column} (${c.reason})`)
                  .join('; ')}
                {extraColumnsSkipped.length > 6 && '; and more'}.
              </p>
            )}
          </>
        ) : (
          additionalColumns > 0 && (
            <p className="text-[11px] text-text-tertiary leading-relaxed">
              {formatNumber(additionalColumns)}{' '}
              {additionalColumns === 1 ? 'column was' : 'columns were'} left alone — kept in your
              file, not used for scoring
              {additionalColumnNames?.length
                ? `: ${additionalColumnNames.slice(0, 8).join(', ')}${
                    additionalColumns > additionalColumnNames.slice(0, 8).length ? ' and more' : ''
                  }`
                : ''}
              .
            </p>
          )
        )}
      </div>
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

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* ---------- The dataset itself ---------- */}
        <Card className="lg:col-span-2">
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
                  This data had no churn column, so ChurnGuard reused a model it already trained on
                  data shaped the same way{reusedModel.trainedAt ? ` (${formatDate(reusedModel.trainedAt)})` : ''}.
                  {reusedModel.driftState === 'moderate' &&
                    ' This data looks somewhat different from what that model was trained on — treat these scores with a bit more caution.'}
                  {reusedModel.driftState === 'high' &&
                    ' This data looks quite different from what that model was trained on, so these scores may not be reliable. Connecting a churn column would let ChurnGuard train fresh on this data instead.'}
                </p>
              </div>
            </div>
          )}

          {/* ---------- Measured facts ---------- */}
          <div className="mt-5 pt-5 border-t border-border">
            <SectionTitle help="Counted from the file itself when it was read — not estimates, and not model output.">
              Measured in your data
            </SectionTitle>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3">
              {typeof rowsInFile === 'number' && (
                <Stat
                  label="Rows"
                  value={formatNumber(rowsInFile)}
                  help="Customer records read from your file, before duplicates were excluded."
                />
              )}
              {typeof columns === 'number' && (
                <Stat label="Columns" value={formatNumber(columns)} />
              )}
              {typeof fieldsMapped === 'number' && (
                <Stat
                  label="Required fields"
                  value={
                    requiredTotal
                      ? `${Math.min(fieldsMapped, requiredTotal)} of ${requiredTotal}`
                      : formatNumber(fieldsMapped)
                  }
                  help="The fields the churn model needs. ChurnGuard matched these to your columns automatically."
                />
              )}
              {typeof optionalDetected === 'number' && (
                <Stat
                  label="Optional fields"
                  value={
                    optionalTotal
                      ? `${optionalDetected} of ${optionalTotal}`
                      : formatNumber(optionalDetected)
                  }
                  help="Extra fields that were present in your data and add detail to the customer view."
                />
              )}
              {typeof missingCells === 'number' && (
                <Stat
                  label="Empty values"
                  value={formatNumber(missingCells)}
                  help="Blank cells across the whole file. Numeric gaps are filled with the column's median; missing categories become their own group."
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
                      : "Customers in your data with a recorded churn outcome. These are what the model learned the pattern from."
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

          <ColumnUsage
            mappedColumns={mappedColumns}
            additionalColumns={additionalColumns}
            additionalColumnNames={additionalColumnNames}
            optionalDetected={optionalDetected}
            optionalTotal={optionalTotal}
            extraColumnsUsed={extraColumnsUsed}
            extraColumnsSkipped={extraColumnsSkipped}
            churnDerivation={churnDerivation}
          />

          <CleaningSummary cleaning={cleaning} />
        </Card>

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
              Risk level configuration
            </SectionTitle>
            <div className="mt-3">
              <RiskConfiguration />
            </div>
          </div>

          <div className="mt-5 pt-5 border-t border-border">
            <SectionTitle>Where to go next</SectionTitle>
            <p className="text-xs text-text-secondary mt-1.5 mb-3 leading-relaxed">
              Start with the portfolio picture, or go straight to the accounts that need
              attention.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={onViewOverview}>
                View Overview
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
            scores and drafts are discarded — a model is never left running on data it
            wasn&apos;t built from. This dataset stays in your History, so you can bring it back
            without finding the file again.
          </p>
        </div>
      </div>
    </div>
  );
}