import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../utils/helpers';
import { useWorkflowNav } from '../../utils/navigation';

const LINK_FOCUS = 'rounded-sm focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2';

/**
 * A link back up the workflow. When `to` is the entry the user drilled down
 * from, a plain click steps back through history -- the same as the browser's
 * Back, so the list returns with its filters and Forward still works.
 * Otherwise it is an ordinary link. Either way it is a real `<a href>`, so it
 * is keyboard-reachable and still opens in a new tab.
 */
function ReturnLink({ to, className, children }) {
  const { goBackTo } = useWorkflowNav();
  return (
    <Link
      to={to}
      className={className}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        goBackTo(to);
      }}
    >
      {children}
    </Link>
  );
}

/**
 * The row above a page title that answers "where am I, and how did I get
 * here". `crumbs` is the position in the workflow -- the last one is the
 * current page and is not a link. `back` is the page the user actually came
 * from, always named ("Back to Customers", never a bare "Back").
 */
export default function PageTrail({ crumbs = [], back = null, className }) {
  if (crumbs.length === 0 && !back) return null;

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5', className)}>
      {crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-text-tertiary">
            {crumbs.map((crumb, i) => {
              const current = i === crumbs.length - 1;
              return (
                // Keyed by position: a trail is a fixed, ordered list, and a
                // label can be momentarily undefined while a route exits.
                <li key={i} className="flex items-center gap-1 min-w-0">
                  {current ? (
                    <span aria-current="page" className="text-text-secondary font-medium truncate">
                      {crumb.label}
                    </span>
                  ) : (
                    <>
                      <ReturnLink
                        to={crumb.to}
                        className={cn('hover:text-text-primary hover:underline underline-offset-2 transition-colors', LINK_FOCUS)}
                      >
                        {crumb.label}
                      </ReturnLink>
                      <ChevronRight size={12} className="shrink-0 text-text-tertiary/60" aria-hidden="true" />
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}
      {back && (
        <ReturnLink
          to={back.to}
          className={cn(
            'group inline-flex items-center gap-1.5 text-xs font-medium text-text-tertiary hover:text-text-primary transition-colors',
            LINK_FOCUS
          )}
        >
          <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
          Back to {back.label}
        </ReturnLink>
      )}
    </div>
  );
}
