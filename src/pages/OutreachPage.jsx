import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Mail, Send, Check, Edit, RefreshCw, Copy, Sparkles, ShieldCheck, Clock, CheckCircle, Bot, ArrowRight, ArrowLeft } from 'lucide-react';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import PageTrail from '../components/ui/PageTrail';
import RetentionFlow from '../components/ui/RetentionFlow';
import { SkeletonCard } from '../components/ui/Skeleton';
import { outreachService, customerService, explainabilityService, recommendationService } from '../services/api';
import { useApp } from '../context/AppContext';
import { formatRelativeDate } from '../utils/helpers';
import { customersHref, useWorkflowNav, withCustomer } from '../utils/navigation';

const statusFlow = { draft: 'Draft', reviewed: 'Edited', approved: 'Approved', sent: 'Sent' };
const statusColors = { draft: 'draft', reviewed: 'reviewed', approved: 'approved', sent: 'sent' };

// The review path a draft travels. Shown once, at the top, so the human-approval
// rule is structural rather than a warning people learn to skim past.
const REVIEW_STEPS = [
  { key: 'draft', label: 'AI drafts it' },
  { key: 'reviewed', label: 'You review and edit' },
  { key: 'approved', label: 'You approve' },
  { key: 'sent', label: 'You send' },
];
const STEP_ORDER = REVIEW_STEPS.map((s) => s.key);

export default function OutreachPage() {
  const [searchParams] = useSearchParams();
  const { addToast } = useApp();
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editBody, setEditBody] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [draftCustomer, setDraftCustomer] = useState(null);
  const [draftDriver, setDraftDriver] = useState(null);
  const [draftAction, setDraftAction] = useState(null);
  const [autoStatus, setAutoStatus] = useState(null);
  const pollTimer = useRef(null);
  const customerId = searchParams.get('customer');
  const { from, customersPath, stateFrom, drill, goBackTo } = useWorkflowNav();
  const openState = stateFrom('Outreach');
  // Which account this page is about: the one it was opened for, or — when it
  // was opened as the whole review queue — whichever draft is being reviewed.
  const contextCustomerId = customerId || selectedEmail?.customerId || '';
  // Opened for one account: say whose, and how to get back to it. Opened from
  // the sidebar it is the whole review queue, with no single account to name.
  const trail = (
    <PageTrail
      crumbs={contextCustomerId ? [
        { label: 'Customers', to: customersPath ?? '/customers' },
        { label: contextCustomerId, to: `/customers/${contextCustomerId}` },
        { label: 'Outreach' },
      ] : []}
      back={from && { label: from.label, to: from.path }}
    />
  );
  const goToRecommendations = () => {
    const to = withCustomer('/recommendations', contextCustomerId);
    if (from?.path === to) goBackTo(to);
    else drill(to, 'Outreach');
  };

  useEffect(() => { loadEmails(); }, []);

  // The automatic post-training pipeline (backend/agents/outreach_workflow.py)
  // drafts high/critical-risk accounts in the background right after
  // training. Poll while it's running so the queue fills in live instead of
  // the page looking empty until someone happens to refresh it; stop as soon
  // as it reports 'done' or isn't running at all.
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const status = await outreachService.getAutoStatus();
        if (cancelled) return;
        setAutoStatus(status);
        if (status.state === 'running') {
          pollTimer.current = setTimeout(poll, 3000);
        } else if (status.state === 'done' && status.queued > 0) {
          loadEmails();
        }
      } catch {
        // No dataset connected yet, or the backend is unreachable -- the
        // rest of the page already has its own error handling for that.
      }
    }
    poll();

    return () => {
      cancelled = true;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  useEffect(() => {
    const targetId = selectedEmail?.customerId;
    if (!targetId) {
      setDraftCustomer(null);
      setDraftDriver(null);
      setDraftAction(null);
      return;
    }
    let cancelled = false;
    async function loadContext() {
      // Settled, not all-or-nothing: this is the summary of what stages 1 and
      // 2 found, and losing one of the three must not blank the other two or
      // stop the draft itself being reviewed.
      const [customerRes, explanationRes, recsRes] = await Promise.allSettled([
        customerService.getCustomer(targetId),
        explainabilityService.getSHAPExplanation(targetId),
        recommendationService.getRecommendations(targetId),
      ]);
      if (cancelled) return;
      setDraftCustomer(customerRes.status === 'fulfilled' ? customerRes.value : null);
      setDraftDriver(explanationRes.status === 'fulfilled' ? explanationRes.value?.features?.[0] ?? null : null);
      const recs = recsRes.status === 'fulfilled' ? recsRes.value : [];
      // The action the user accepted, if they got that far; otherwise the
      // highest-ranked suggestion this message is answering.
      setDraftAction(recs?.find((r) => r.status === 'approved') ?? recs?.[0] ?? null);
    }
    loadContext();
    return () => { cancelled = true; };
  }, [selectedEmail?.customerId]);

  const loadEmails = async () => {
    try {
      const data = await outreachService.getEmails();
      setEmails(data);
      if (data.length > 0) {
        const target = customerId ? data.find(e => e.customerId === customerId) || data[0] : data[0];
        selectEmail(target);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const selectEmail = (email) => {
    setSelectedEmail(email);
    setEditBody(email.body);
    setEditSubject(email.subject);
    setEditMode(false);
  };

  const handleGenerate = async (targetId = customerId) => {
    if (!targetId) return;
    setGenerating(true);
    try {
      const email = await outreachService.generateEmail(targetId);
      setEmails(prev => [email, ...prev]);
      selectEmail(email);
      addToast({ type: 'success', message: 'Email draft generated' });
    } catch (e) { console.error(e); }
    setGenerating(false);
  };

  const handleApprove = async () => {
    if (!selectedEmail) return;
    try {
      await outreachService.approveEmail(selectedEmail.id);
      const updated = { ...selectedEmail, status: 'approved' };
      setSelectedEmail(updated);
      setEmails(prev => prev.map(e => e.id === selectedEmail.id ? updated : e));
      addToast({ type: 'success', message: 'Approved — you can send it when ready' });
    } catch (e) { console.error(e); }
  };

  const handleSend = async () => {
    if (!selectedEmail) return;
    try {
      await outreachService.sendEmail(selectedEmail.id);
      const updated = { ...selectedEmail, status: 'sent' };
      setSelectedEmail(updated);
      setEmails(prev => prev.map(e => e.id === selectedEmail.id ? updated : e));
      addToast({ type: 'success', message: 'Marked as sent — ChurnGuard has no email delivery, so send this from your own tools' });
    } catch (e) { console.error(e); }
  };

  const handleSave = () => {
    if (!selectedEmail) return;
    const updated = { ...selectedEmail, body: editBody, subject: editSubject, status: 'reviewed' };
    setSelectedEmail(updated);
    setEmails(prev => prev.map(e => e.id === selectedEmail.id ? updated : e));
    setEditMode(false);
    addToast({ type: 'info', message: 'Changes saved' });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {trail}
        <div className="h-7 w-64 bg-bg-tertiary rounded animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <SkeletonCard />
          <div className="lg:col-span-2"><SkeletonCard /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        {trail}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <header className="max-w-2xl">
            <h1 className="text-xl font-bold text-text-primary tracking-tight">Retention outreach</h1>
            <p className="text-sm text-text-secondary mt-1 leading-relaxed">
              ChurnGuard drafts a starting point from the account's risk factors. You edit it, you approve it, and
              nothing is sent until you say so.
            </p>
          </header>
          {customerId && (
            <Button size="sm" icon={Sparkles} loading={generating} onClick={() => handleGenerate()}>Draft a new email</Button>
          )}
        </div>
      </div>

      <RetentionFlow customerId={contextCustomerId} stage="outreach" />

      {/* The automatic pipeline's progress — real numbers from the backend,
          not a spinner with no information. Disappears once it's done. */}
      {autoStatus?.state === 'running' && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/5 border border-accent/20">
          <div className="w-4 h-4 rounded-full border-2 border-accent/30 border-t-accent animate-spin shrink-0" aria-hidden="true" />
          <p className="text-xs text-text-secondary">
            <span className="text-text-primary font-medium">ChurnGuard is drafting outreach</span> for your
            highest-risk accounts — {autoStatus.done} of {autoStatus.total} done
            {autoStatus.queued > 0 && `, ${autoStatus.queued} ready to review`}.
          </p>
        </div>
      )}

      {/* How a draft travels — the human-approval rule, shown as the actual flow */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 p-3 rounded-lg bg-bg-tertiary/30 border border-border">
        <ShieldCheck size={15} className="text-accent shrink-0" aria-hidden="true" />
        {REVIEW_STEPS.map((step, i) => {
          const reached = selectedEmail ? STEP_ORDER.indexOf(selectedEmail.status) >= i : i === 0;
          return (
            <span key={step.key} className="flex items-center gap-2">
              <span className={`text-[11px] font-medium ${reached ? 'text-text-primary' : 'text-text-tertiary'}`}>
                {step.label}
              </span>
              {i < REVIEW_STEPS.length - 1 && <span className="text-text-tertiary text-[11px]" aria-hidden="true">→</span>}
            </span>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Email List */}
        <Card padding={false} className="lg:col-span-1">
          <div className="p-3 border-b border-border">
            <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Drafts</p>
            <p className="text-[11px] text-text-tertiary mt-0.5">Select one to review it.</p>
          </div>
          <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
            {emails.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-xs text-text-secondary">No drafts yet.</p>
                <p className="text-[11px] text-text-tertiary mt-1">
                  Open a customer and choose &ldquo;Draft an outreach email&rdquo; to create one.
                </p>
                <Link
                  to={customersHref({ status: 'at-risk' })}
                  state={openState}
                  className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline underline-offset-2 rounded-sm focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
                >
                  View at-risk customers
                  <ArrowRight size={12} aria-hidden="true" />
                </Link>
              </div>
            ) : (
              emails.map(email => (
                <button
                  key={email.id}
                  onClick={() => selectEmail(email)}
                  className={`w-full p-3 text-left hover:bg-bg-tertiary/30 transition-colors cursor-pointer ${selectedEmail?.id === email.id ? 'bg-bg-tertiary/50 border-l-2 border-l-accent' : ''}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-text-primary truncate flex items-center gap-1.5">
                      {email.customerName}
                      {email.auto && <Bot size={12} className="text-accent shrink-0" aria-label="Drafted automatically" />}
                    </span>
                    <Badge variant={statusColors[email.status]} size="xs">{statusFlow[email.status]}</Badge>
                  </div>
                  <p className="text-xs text-text-tertiary truncate">{email.subject}</p>
                  <p className="text-[10px] text-text-tertiary mt-1">{formatRelativeDate(email.createdAt)}</p>
                </button>
              ))
            )}
          </div>
        </Card>

        {/* Email Composer */}
        <div className="lg:col-span-2 space-y-4">
          {selectedEmail ? (
            <>
              <Card>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={statusColors[selectedEmail.status]} size="md">{statusFlow[selectedEmail.status]}</Badge>
                      {selectedEmail.auto && (
                        <Badge variant="accent" size="xs" className="inline-flex items-center gap-1">
                          <Bot size={10} aria-hidden="true" />
                          Drafted automatically
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" icon={Copy} onClick={() => { navigator.clipboard.writeText(selectedEmail.body); addToast({ type: 'info', message: 'Copied to clipboard' }); }}>Copy</Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={RefreshCw}
                        loading={generating}
                        onClick={() => handleGenerate(selectedEmail.customerId)}
                      >
                        Redraft
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-xs text-text-tertiary">To</span>
                      <p className="text-text-primary font-medium break-words">
                        Customer {selectedEmail.customerId}
                      </p>
                      <p className="text-[11px] text-text-tertiary mt-0.5">
                        No contact name or email was in your dataset — copy this draft to send from your own tools.
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-text-tertiary">Account</span>
                      <p>
                        <Link
                          to={`/customers/${selectedEmail.customerId}`}
                          state={openState}
                          className="text-text-primary font-medium hover:text-accent hover:underline underline-offset-2 rounded-sm focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
                        >
                          {selectedEmail.customerId}
                        </Link>
                      </p>
                    </div>
                  </div>

                  {/* The chain this message came from: the risk (stage 1) and
                      the action answering it (stage 2), one line each. Those
                      pages own the detail; this is only enough to review the
                      draft against. */}
                  <div className="p-3 rounded-lg bg-bg-tertiary/30 border border-border">
                    <p className="text-xs text-text-tertiary font-medium mb-2">What this draft is based on</p>
                    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
                      <li className="text-text-secondary">
                        {draftCustomer ? (
                          <>
                            <span className="text-text-primary font-medium">{draftCustomer.churnProbability}% churn risk</span>
                            {draftDriver && <> · {draftDriver.feature.toLowerCase()} at {draftDriver.value}</>}
                          </>
                        ) : (
                          'This account’s risk factors'
                        )}
                      </li>
                      <li aria-hidden="true" className="text-text-tertiary">→</li>
                      <li className="text-text-secondary">{draftAction ? draftAction.title : 'Recommended action'}</li>
                      <li aria-hidden="true" className="text-text-tertiary">→</li>
                      <li className="text-text-primary font-medium">This message</li>
                    </ol>
                    <p className="text-[11px] text-text-tertiary mt-2 leading-relaxed">
                      An LLM drafted this from the account&apos;s real risk factors — check it against what you know
                      about the account before sending.
                    </p>
                  </div>

                  <div>
                    <label className="text-xs text-text-tertiary">Subject</label>
                    {editMode ? (
                      <input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} className="w-full mt-1 px-3 py-2 bg-bg-tertiary/50 border border-border rounded-lg text-sm text-text-primary outline-none focus:border-accent" />
                    ) : (
                      <p className="text-sm text-text-primary font-medium mt-1">{selectedEmail.subject}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-xs text-text-tertiary">Email Body</label>
                    {editMode ? (
                      <textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        rows={14}
                        className="w-full mt-1 px-3 py-2 bg-bg-tertiary/50 border border-border rounded-lg text-sm text-text-primary outline-none focus:border-accent resize-none font-mono leading-relaxed"
                      />
                    ) : (
                      <div className="mt-1 p-4 rounded-lg bg-bg-tertiary/20 border border-border">
                        <pre className="text-sm text-text-secondary whitespace-pre-wrap font-sans leading-relaxed">{selectedEmail.body}</pre>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t border-border flex-wrap">
                    {editMode ? (
                      <>
                        <Button size="sm" icon={Check} onClick={handleSave}>Save my edits</Button>
                        <Button variant="ghost" size="sm" onClick={() => { setEditBody(selectedEmail.body); setEditSubject(selectedEmail.subject); setEditMode(false); }}>Cancel</Button>
                      </>
                    ) : (
                      <>
                        <Button variant="secondary" size="sm" icon={Edit} onClick={() => setEditMode(true)}>Edit</Button>
                        {selectedEmail.status !== 'approved' && selectedEmail.status !== 'sent' && (
                          <Button size="sm" icon={Check} onClick={handleApprove}>Approve for sending</Button>
                        )}
                        {selectedEmail.status === 'approved' && (
                          <Button size="sm" icon={Send} onClick={handleSend}>Mark as sent</Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </Card>

              {/* Audit Trail */}
              <Card>
                <CardHeader>
                  <CardTitle>What has happened to this draft</CardTitle>
                  <p className="text-xs text-text-tertiary mt-1">A record of who did what, and when.</p>
                </CardHeader>
                <div className="space-y-2">
                  {(selectedEmail.auditTrail || []).map((entry, i) => (
                    <div key={i} className="flex items-center gap-3 py-1.5">
                      <div className="w-6 h-6 rounded-full bg-bg-tertiary flex items-center justify-center shrink-0">
                        {entry.action.includes('generated') ? <Sparkles size={11} className="text-accent" /> :
                         entry.action.includes('Approved') ? <CheckCircle size={11} className="text-risk-low" /> :
                         <Clock size={11} className="text-text-tertiary" />}
                      </div>
                      <div>
                        <span className="text-xs text-text-primary font-medium">{entry.action}</span>
                        <span className="text-xs text-text-tertiary ml-2">by {entry.user}</span>
                      </div>
                      <span className="text-[10px] text-text-tertiary ml-auto">{formatRelativeDate(entry.timestamp)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          ) : (
            <EmptyState icon={Mail} title="No email selected" description="Select an outreach draft from the list or generate a new one." />
          )}
        </div>
      </div>

      {/* The end of the workflow — and the way back up it. The primary action
          for a draft (approve, then mark as sent) stays with the draft itself. */}
      {contextCustomerId && (
        <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary">Nothing here sends itself.</p>
            <p className="text-xs text-text-tertiary mt-1">
              Approve a draft, send it from your own email tools, then mark it as sent — ChurnGuard has no delivery
              integration and never contacts a customer on its own.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={goToRecommendations}>
              Back to recommendations
            </Button>
            <Button variant="secondary" size="sm" onClick={() => goBackTo(`/customers/${contextCustomerId}`)}>
              Back to the account
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
