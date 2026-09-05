import { cn } from '../../utils/helpers';
import { FileQuestion } from 'lucide-react';
import Button from './Button';

export default function EmptyState({ icon: Icon = FileQuestion, title, description, action, actionLabel, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-4 text-center', className)}>
      <div className="w-16 h-16 rounded-2xl bg-bg-tertiary flex items-center justify-center mb-4">
        <Icon size={28} className="text-text-tertiary" />
      </div>
      <h3 className="text-base font-semibold text-text-primary mb-1.5">{title}</h3>
      {description && <p className="text-sm text-text-tertiary max-w-sm mb-6">{description}</p>}
      {action && actionLabel && (
        <Button onClick={action} variant="secondary" size="md">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
