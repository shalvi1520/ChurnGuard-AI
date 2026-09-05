import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Send, Check, Edit, RefreshCw, Copy, Sparkles, AlertTriangle, Clock, CheckCircle } from 'lucide-react';
import Card, { CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Select from '../components/ui/Select';
import EmptyState from '../components/ui/EmptyState';
import { outreachService } from '../services/api';
import { mockCustomers } from '../mock/customers';
import { useApp } from '../context/AppContext';
import { formatRelativeDate } from '../utils/helpers';

const statusFlow = { draft: 'Draft', reviewed: 'Reviewed', approved: 'Approved', sent: 'Sent' };
const statusColors = { draft: 'draft', reviewed: 'reviewed', approved: 'approved', sent: 'sent' };

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
  const customerId = searchParams.get('customer');

  useEffect(() => { loadEmails(); }, []);

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

  const handleGenerate = async () => {
    if (!customerId) return;
    setGenerating(true);
    try {
      const email = await outreachService.generateEmail(customerId);
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
      addToast({ type: 'success', message: 'Email approved for sending' });
    } catch (e) { console.error(e); }
  };

  const handleSend = async () => {
    if (!selectedEmail) return;
    try {
      await outreachService.sendEmail(selectedEmail.id);
      const updated = { ...selectedEmail, status: 'sent' };
      setSelectedEmail(updated);
      setEmails(prev => prev.map(e => e.id === selectedEmail.id ? updated : e));
      addToast({ type: 'success', message: 'Email sent successfully' });
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">AI-Generated Retention Outreach</h1>
          <p className="text-sm text-text-tertiary mt-0.5">Review, edit, and approve AI-generated retention emails before sending.</p>
        </div>
        <div className="flex items-center gap-2">
          {customerId && (
            <Button size="sm" icon={Sparkles} loading={generating} onClick={handleGenerate}>Generate New</Button>
          )}
        </div>
      </div>

      {/* Human review banner */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-risk-medium/5 border border-risk-medium/20">
        <AlertTriangle size={16} className="text-risk-medium shrink-0" />
        <p className="text-xs text-risk-medium font-medium">AI Generated — Requires Human Review. All emails must be reviewed and approved before sending.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Email List */}
        <Card padding={false} className="lg:col-span-1">
          <div className="p-3 border-b border-border">
            <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Outreach Drafts</p>
          </div>
          <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
            {emails.length === 0 ? (
              <div className="p-6 text-center text-xs text-text-tertiary">No outreach drafts</div>
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
                      <Button variant="ghost" size="sm" icon={RefreshCw}>Regenerate</Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-xs text-text-tertiary">To</span>
                      <p className="text-text-primary font-medium">{selectedEmail.contactName} ({selectedEmail.contactEmail})</p>
                    </div>
                    <div>
                      <span className="text-xs text-text-tertiary">Customer</span>
                      <p className="text-text-primary font-medium">{selectedEmail.customerName}</p>
                    </div>
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
                        <Button size="sm" icon={Check} onClick={handleSave}>Save Changes</Button>
                        <Button variant="ghost" size="sm" onClick={() => { setEditBody(selectedEmail.body); setEditSubject(selectedEmail.subject); setEditMode(false); }}>Cancel</Button>
                      </>
                    ) : (
                      <>
                        <Button variant="secondary" size="sm" icon={Edit} onClick={() => setEditMode(true)}>Edit</Button>
                        {selectedEmail.status !== 'approved' && selectedEmail.status !== 'sent' && (
                          <Button size="sm" icon={Check} onClick={handleApprove}>Approve</Button>
                        )}
                        {selectedEmail.status === 'approved' && (
                          <Button size="sm" icon={Send} onClick={handleSend}>Send Email</Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </Card>

              {/* Audit Trail */}
              <Card>
                <CardHeader><CardTitle>Audit Trail</CardTitle></CardHeader>
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
