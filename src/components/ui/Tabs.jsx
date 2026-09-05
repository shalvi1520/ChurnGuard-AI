import { useState } from 'react';
import { cn } from '../../utils/helpers';

export default function Tabs({ tabs, defaultTab, onChange, className }) {
  const [active, setActive] = useState(defaultTab || tabs[0]?.id);

  const handleChange = (id) => {
    setActive(id);
    onChange?.(id);
  };

  return (
    <div className={cn('border-b border-border', className)}>
      <nav className="flex gap-0 -mb-px">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleChange(tab.id)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-200 cursor-pointer whitespace-nowrap',
              active === tab.id
                ? 'border-accent text-accent'
                : 'border-transparent text-text-tertiary hover:text-text-secondary hover:border-border-light'
            )}
          >
            {tab.icon && <tab.icon size={14} className="inline mr-2 -mt-0.5" />}
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn(
                'ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium',
                active === tab.id ? 'bg-accent/10 text-accent' : 'bg-bg-tertiary text-text-tertiary'
              )}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
