import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import { cn, formatNumber, formatCurrency, formatPercent } from '../../utils/helpers';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { InfoTip } from './Tooltip';

/**
 * `description` is visible supporting text — it says what the number means
 * without needing a mouse. `help` is the extra detail behind the info icon.
 * Both usually come from utils/glossary.js so the wording matches everywhere.
 *
 * `action` ({ to, label, state }) is for the rare metric that IS a set of
 * accounts you can open ("Customers at Risk" → those customers). It renders a
 * visible, named link whose hit area covers the card; leave it off for figures
 * that don't lead anywhere, so not every card turns into a button.
 */
export default function MetricCard({ title, value, change, trend, format = 'number', sparklineData, icon: Icon, description, help, action, className, delay = 0 }) {
  const formattedValue = format === 'currency'
    ? formatCurrency(value)
    : format === 'percent'
    ? formatPercent(value)
    : formatNumber(value);

  const isPositiveChange = change > 0;
  const TrendIcon = trend === 'up' ? TrendingUp : TrendingDown;

  // For risk metrics, "up" is bad; for retention, "down" is bad
  const isGoodTrend = (title?.includes('Retention') || title?.includes('Health'))
    ? trend === 'up'
    : trend === 'down';

  const changeColor = isGoodTrend ? 'text-risk-low' : 'text-risk-high';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className={cn(
        'relative rounded-xl border border-border bg-bg-card p-5 transition-all duration-200 group',
        action ? 'hover:border-accent/40 cursor-pointer' : 'hover:border-border-light',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">{title}</span>
            {/* Above the action link's card-wide hit area, so the info icon still opens its tooltip. */}
            {help && (
              <span className="relative z-10 inline-flex">
                <InfoTip content={help} label={`What ${title} means`} size={12} />
              </span>
            )}
          </div>
          {description && (
            <p className="text-[11px] text-text-tertiary/90 mt-1 leading-snug">{description}</p>
          )}
        </div>
        {Icon && (
          <div className="p-1.5 rounded-lg bg-bg-tertiary text-text-tertiary group-hover:text-accent transition-colors shrink-0">
            <Icon size={14} aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="text-2xl font-bold text-text-primary tracking-tight tabular-nums">
            {formattedValue}
          </div>
          {change !== undefined && (
            <div className={cn('flex items-center gap-1 mt-1.5 whitespace-nowrap', changeColor)}>
              <TrendIcon size={12} aria-hidden="true" />
              <span className="text-xs font-medium tabular-nums">
                {isPositiveChange ? '+' : ''}{change}%
              </span>
              <span className="text-xs text-text-tertiary ml-0.5">vs last mo.</span>
              {/* Colour alone shouldn't carry the good/bad signal. */}
              <span className="sr-only">{isGoodTrend ? '(improving)' : '(worsening)'}</span>
            </div>
          )}
        </div>
        {sparklineData && (
          <div className="w-14 h-9 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklineData.map((v, i) => ({ v, i }))}>
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={isGoodTrend ? '#4ADE80' : '#F97316'}
                  strokeWidth={1.5}
                  dot={false}
                  // These sparklines mount 6-at-a-time in the KPI row; letting
                  // them all run Recharts' entrance animation caused a visible
                  // jank burst on slower machines. They're decorative — the
                  // card itself already animates in.
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      {action && (
        <Link
          to={action.to}
          state={action.state}
          className={cn(
            'mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline underline-offset-2',
            'rounded-sm focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
            // Stretched over the whole card: one focusable link, card-sized target.
            'after:absolute after:inset-0 after:rounded-xl'
          )}
        >
          {action.label}
          <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      )}
    </motion.div>
  );
}
