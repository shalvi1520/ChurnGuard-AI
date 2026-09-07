import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Mail, Send, Check, Edit, RefreshCw, Copy, Sparkles, ShieldCheck, Clock, CheckCircle } from 'lucide-react';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { SkeletonCard } from '../components/ui/Skeleton';
import { outreachService, customerService, explainabilityService } from '../services/api';
import { useApp } from '../context/AppContext';
import { formatRelativeDate } from '../utils/helpers';

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
  const customerId = searchParams.get('customer');

  useEffect(() => { loadEmails(); }, []);

  useEffect(() => {
    const targetId = selectedEmail?.customerId;
    if (!targetId) {
      setDraftCustomer(null);
      setDraftDriver(null);
      return;
    }
    let cancelled = false;
    async function loadContext() {
      try {
        const [customerData, explanation] = await Promise.all([
          customerService.getCustomer(targetId),
          explainabilityService.getSHAPExplanation(targetId),
        ]);
        if (cancelled) return;
        setDraftCustomer(customerData);
        setDraftDriver(explanation?.features?.[0] || null);
      } catch {
        if (!cancelled) { setDraftCustomer(null); setDraftDriver(null); }
      }
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
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <header className="max-w-2xl">
          <h1 className="text-xl font-bold text-text-primary tracking-tight">Retention outreach</h1>
          <p className="text-sm text-text-secondary mt-1 leading-relaxed">
            ChurnGuard drafts a starting point from the account's risk factors. You edit it, you approve it, and
            nothing is sent until you say so.
          </p>
        </header>
        {customerId && (
          <Button size="sm" icon={Sparkles} loading={generating} onClick={handleGenerate}>Draft a new email</Button>
        )}
      </div>

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
              </div>
            ) : (
              emails.map(email => (
                <button
                  key={email.id}
                  onClick={() => selectEmail(email)}
                  className={`w-full p-3 text-left hover:bg-bg-tertiary/30 transition-colors cursor-pointer ${selectedEmail?.id === email.id ? 'bg-bg-tertiary/50 border-l-2 border-l-accent' : ''}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-text-primary truncate">{email.customerName}</span>
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
                    <Badge variant={statusColors[selectedEmail.status]} size="md">{statusFlow[selectedEmail.status]}</Badge>
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
                      <p className="text-text-primary font-medium">{selectedEmail.customerId}</p>
                    </div>
                  </div>

                  {/* What this draft was written from */}
                  <div className="p-3 rounded-lg bg-bg-tertiary/30 border border-border">
                    <p className="text-xs text-text-tertiary font-medium mb-1">What this draft is based on</p>
                    <p className="text-xs text-text-secondary leading-relaxed">
                      {draftCustomer ? (
                        <>
                          {draftCustomer.id} is at{' '}
                          <span className="text-text-primary font-medium">{draftCustomer.churnProbability}% churn risk</span>
                          {draftDriver && <> with {draftDriver.feature.toLowerCase()} at {draftDriver.value}</>}.
                          {' '}An LLM drafted this from the account's real risk factors — check it against what you know
                          about the account before sending.
                        </>
                      ) : (
                        <>Check this draft against what you know about the account before sending.</>
                      )}
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
    </div>
  );
}
