import { cn } from '../../utils/helpers';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Pagination({ page, totalPages, onPageChange, className }) {
  if (totalPages <= 1) return null;

  const getPages = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);

    if (start > 1) { pages.push(1); if (start > 2) pages.push('...'); }
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages) { if (end < totalPages - 1) pages.push('...'); pages.push(totalPages); }
    return pages;
  };

  return (
    // Icon-only arrows and bare page numbers say nothing on their own to a
    // screen reader, so each control states what it does and which page is
    // current. `aria-current` is what makes the highlighted page more than
    // just a colour.
    <nav className={cn('flex items-center gap-1', className)} aria-label="Pagination">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        aria-label="Previous page"
        className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </button>
      {getPages().map((p, i) => (
        <button
          key={i}
          onClick={() => typeof p === 'number' && onPageChange(p)}
          disabled={p === '...'}
          aria-label={typeof p === 'number' ? `Page ${p}` : undefined}
          aria-current={p === page ? 'page' : undefined}
          className={cn(
            'min-w-[32px] h-8 rounded-lg text-xs font-medium transition-colors cursor-pointer',
            p === page
              ? 'bg-accent text-bg-primary'
              : p === '...'
              ? 'text-text-tertiary cursor-default'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
          )}
        >
          {p}
        </button>
      ))}
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        aria-label="Next page"
        className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
      >
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </nav>
  );
}
