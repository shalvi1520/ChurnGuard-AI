import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Zap, Plus, Play, Pause, ArrowRight, GitBranch, CheckCircle2 } from 'lucide-react';
import Card, { CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { SkeletonCard } from '../components/ui/Skeleton';
import { playbookService } from '../services/api';
import { formatRelativeDate } from '../utils/helpers';

export default function PlaybooksPage() {
  const navigate = useNavigate();
  const [playbooks, setPlaybooks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await playbookService.getPlaybooks();
      setPlaybooks(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleToggle = async (id) => {
    const updated = await playbookService.togglePlaybook(id);
    setPlaybooks(prev => prev.map(p => (p.id === id ? updated : p)));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">Playbooks</h1>
          <p className="text-sm text-text-tertiary mt-0.5">Automation rules that trigger retention actions when risk conditions are met.</p>
        </div>
        <Button icon={Plus} onClick={() => navigate('/playbooks/new')}>Create Playbook</Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : playbooks.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="No playbooks yet"
          description="Create an automation rule to act on at-risk customers automatically."
          action={() => navigate('/playbooks/new')}
          actionLabel="Create Playbook"
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {playbooks.map((pb, i) => (
            <motion.div key={pb.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="h-full flex flex-col">
                <CardHeader
                  action={
                    <Badge variant={pb.status === 'active' ? 'active' : 'dormant'} size="sm">
                      {pb.status === 'active' ? 'Active' : 'Paused'}
                    </Badge>
                  }
                >
                  <CardTitle>{pb.name}</CardTitle>
                  <CardDescription>{pb.description}</CardDescription>
                </CardHeader>

                <div className="flex-1 space-y-2.5 text-xs">
                  <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-bg-tertiary/30">
                    <GitBranch size={14} className="text-accent mt-0.5 shrink-0" />
                    <div>
                      <span className="text-text-tertiary uppercase tracking-wider font-medium text-[10px]">Trigger</span>
                      <p className="text-text-secondary mt-0.5">{pb.trigger}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-bg-tertiary/30">
                    <Zap size={14} className="text-risk-medium mt-0.5 shrink-0" />
                    <div>
                      <span className="text-text-tertiary uppercase tracking-wider font-medium text-[10px]">Action</span>
                      <p className="text-text-secondary mt-0.5">{pb.action}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-bg-tertiary/30">
                    <CheckCircle2 size={14} className="text-risk-low mt-0.5 shrink-0" />
                    <div>
                      <span className="text-text-tertiary uppercase tracking-wider font-medium text-[10px]">Outcome</span>
                      <p className="text-text-secondary mt-0.5">{pb.outcome}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                  <div className="text-[11px] text-text-tertiary">
                    {pb.runsCount} runs{pb.lastRun ? ` · last ${formatRelativeDate(pb.lastRun)}` : ''}
                  </div>
                  <Button
                    variant={pb.status === 'active' ? 'outline' : 'primary'}
                    size="sm"
                    icon={pb.status === 'active' ? Pause : Play}
                    onClick={() => handleToggle(pb.id)}
                  >
                    {pb.status === 'active' ? 'Pause' : 'Activate'}
                  </Button>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
