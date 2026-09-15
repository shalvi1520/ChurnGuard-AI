import { useEffect, useState } from 'react';
import { AlertTriangle, Brain, CheckCircle2, Clock, Edit3, Mail, Send, XCircle } from 'lucide-react';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import { activityService } from '../services/api';
import { formatRelativeDate } from '../utils/helpers';

/**
 * Who trained a model, and who drafted/edited/approved/sent an outreach
 * email, and when -- read from Neon (GET /activity), one row per
 * ActivityEvent (backend/db/models.py). Every action is attributed to the
 * account that actually performed it, the same real name shown throughout
 * the app -- not the generic "You"/"System" placeholders the per-draft
 * audit trail (see OutreachPage's "What has happened to this draft") used
 * before this existed.
 */

const ACTION_META = {
  model_trained: { icon: Brain, label: 'Model trained' },
  outreach_drafted: { icon: Mail, label: 'Outreach drafted' },
  outreach_edited: { icon: Edit3, label: 'Outreach edited' },
  outreach_approved: { icon: CheckCircle2, label: 'Outreach approved' },
  outreach_sent: { icon: Send, label: 'Outreach sent' },
  outreach_send_failed: { icon: XCircle, label: 'Outreach send failed' },
};

function ActivityRow({ event }) {
  const meta = ACTION_META[event.actionType] || { icon: Clock, label: event.label };
  const Icon = meta.icon;

  return (
    <Card className="hover:border-border-light transition-colors">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-bg-tertiary/60 flex items-center justify-center shrink-0">
          <Icon size={16} className="text-text-secondary" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-sm font-semibold text-text-primary">{meta.label}</h3>
            <span className="text-xs text-text-tertiary shrink-0">{formatRelativeDate(event.createdAt)}</span>
          </div>
          {event.detail && <p className="text-xs text-text-tertiary mt-0.5 leading-relaxed">{event.detail}</p>}
        </div>
      </div>
    </Card>
  );
}

export default function ActivityPage() {
  const [events, setEvents] = useState(null); // null = still loading
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    activityService
      .getActivity()
      .then((data) => {
        if (!cancelled) setEvents(data.events || []);
      })
      .catch((err) => {
        if (cancelled) return;
        setEvents([]);
        setLoadError(
          err?.response?.status === 503
            ? "Activity history needs sign-in and a configured database — this server doesn't have one."
            : 'Could not load activity history from the server.'
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <header className="max-w-2xl">
        <h1 className="text-xl font-bold text-text-primary tracking-tight">Activity</h1>
        <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">
          Who trained a model, and who drafted, edited, approved or sent outreach, and when — across
          everything this account has done.
        </p>
      </header>

      {loadError && (
        <Card role="alert" className="border-risk-medium/30 bg-risk-medium/[0.05]">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-risk-medium mt-0.5 shrink-0" />
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Couldn&apos;t load activity</h2>
              <p className="text-xs text-text-secondary mt-1 leading-relaxed">{loadError}</p>
            </div>
          </div>
        </Card>
      )}

      {events === null ? (
        <div className="space-y-3" aria-busy="true">
          <span className="sr-only">Loading activity</span>
          {[0, 1, 2].map((i) => (
            <Card key={i} className="space-y-3">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-3 w-40" />
            </Card>
          ))}
        </div>
      ) : events.length === 0 ? (
        <Card padding={false}>
          <EmptyState
            icon={Clock}
            title="No activity yet"
            description="Training a model, or drafting and sending outreach, will show up here."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <ActivityRow key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
