import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn, formatNumber, formatCurrency, formatPercent } from '../../utils/helpers';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

export default function MetricCard({ title, value, change, trend, format = 'number', sparklineData, icon: Icon, className, delay = 0 }) {
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
        'rounded-xl border border-border bg-bg-card p-5 hover:border-border-light transition-all duration-200 group',
        className
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">{title}</span>
        {Icon && (
          <div className="p-1.5 rounded-lg bg-bg-tertiary text-text-tertiary group-hover:text-accent transition-colors">
            <Icon size={14} />
          </div>
        )}
      </div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-2xl font-bold text-text-primary tracking-tight tabular-nums">
            {formattedValue}
          </div>
          {change !== undefined && (
            <div className={cn('flex items-center gap-1 mt-1.5', changeColor)}>
              <TrendIcon size={12} />
              <span className="text-xs font-medium tabular-nums">
                {isPositiveChange ? '+' : ''}{change}%
              </span>
              <span className="text-xs text-text-tertiary ml-0.5">this month</span>
            </div>
          )}
        </div>
        {sparklineData && (
          <div className="w-20 h-10 opacity-60 group-hover:opacity-100 transition-opacity">
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
    </motion.div>
  );
}
