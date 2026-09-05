import { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Building2, Bell, Shield, Palette, Database, Key, Save, LogOut } from 'lucide-react';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Tabs from '../components/ui/Tabs';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';

const tabs = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'organization', label: 'Organization', icon: Building2 },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'api', label: 'API Config', icon: Key },
  { id: 'data', label: 'Data', icon: Database },
];

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { addToast } = useApp();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('profile');
  const [profile, setProfile] = useState({
    name: user?.name || '',
    email: user?.email || '',
    title: user?.title || '',
    company: user?.company || '',
  });
  const [notifPrefs, setNotifPrefs] = useState({
    riskAlerts: true,
    outreachUpdates: true,
    dataProcessing: true,
    weeklyDigest: false,
    emailNotifs: true,
  });

  const handleSave = () => {
    addToast({ type: 'success', message: 'Settings saved successfully' });
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary tracking-tight">Settings</h1>
        <p className="text-sm text-text-tertiary mt-0.5">Manage your account, preferences, and integrations.</p>
      </div>

      <Tabs tabs={tabs} defaultTab="profile" onChange={setActiveTab} />

      <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        {activeTab === 'profile' && (
          <Card>
            <CardHeader><CardTitle>Profile Information</CardTitle></CardHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
              <Input label="Full Name" value={profile.name} onChange={(e) => setProfile(p => ({ ...p, name: e.target.value }))} />
              <Input label="Email" type="email" value={profile.email} onChange={(e) => setProfile(p => ({ ...p, email: e.target.value }))} />
              <Input label="Job Title" value={profile.title} onChange={(e) => setProfile(p => ({ ...p, title: e.target.value }))} />
              <Input label="Company" value={profile.company} onChange={(e) => setProfile(p => ({ ...p, company: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2 mt-6">
              <Button icon={Save} onClick={handleSave}>Save Changes</Button>
            </div>
          </Card>
        )}

        {activeTab === 'organization' && (
          <Card>
            <CardHeader><CardTitle>Organization</CardTitle></CardHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
              <Input label="Organization Name" value="ChurnGuard" />
              <Input label="Industry" value="SaaS / Technology" />
              <Select label="Plan" options={[{ value: 'enterprise', label: 'Enterprise' }, { value: 'professional', label: 'Professional' }]} value="enterprise" />
              <Input label="Team Size" value="12" />
            </div>
            <Button icon={Save} onClick={handleSave} className="mt-6">Save Changes</Button>
          </Card>
        )}

        {activeTab === 'notifications' && (
          <Card>
            <CardHeader><CardTitle>Notification Preferences</CardTitle></CardHeader>
            <div className="space-y-4 max-w-lg">
              {Object.entries(notifPrefs).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-text-primary">{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</p>
                    <p className="text-xs text-text-tertiary">Receive notifications for {key.replace(/([A-Z])/g, ' $1').toLowerCase()}</p>
                  </div>
                  <button
                    onClick={() => setNotifPrefs(p => ({ ...p, [key]: !value }))}
                    className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${value ? 'bg-accent' : 'bg-bg-tertiary'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform mx-0.5 ${value ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
              ))}
            </div>
            <Button icon={Save} onClick={handleSave} className="mt-6">Save Preferences</Button>
          </Card>
        )}

        {activeTab === 'security' && (
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Change Password</CardTitle></CardHeader>
              <div className="space-y-4 max-w-md">
                <Input label="Current Password" type="password" />
                <Input label="New Password" type="password" />
                <Input label="Confirm New Password" type="password" />
              </div>
              <Button icon={Save} onClick={handleSave} className="mt-6">Update Password</Button>
            </Card>
            <Card>
              <CardHeader><CardTitle>Sessions</CardTitle></CardHeader>
              <p className="text-sm text-text-secondary mb-4">Manage your active sessions.</p>
              <div className="flex items-center justify-between p-3 rounded-lg bg-bg-tertiary/30 border border-border">
                <div>
                  <p className="text-sm text-text-primary font-medium">Current Session</p>
                  <p className="text-xs text-text-tertiary">Windows · Chrome · Last active: now</p>
                </div>
                <span className="text-xs text-risk-low font-medium">Active</span>
              </div>
              <Button variant="danger" size="sm" icon={LogOut} onClick={handleLogout} className="mt-4">Sign Out</Button>
            </Card>
          </div>
        )}

        {activeTab === 'appearance' && (
          <Card>
            <CardHeader><CardTitle>Appearance</CardTitle></CardHeader>
            <div className="max-w-md space-y-4">
              <Select label="Theme" options={[{ value: 'dark', label: 'Dark (Default)' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }]} value="dark" />
              <Select label="Density" options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} value="comfortable" />
            </div>
            <Button icon={Save} onClick={handleSave} className="mt-6">Save Preferences</Button>
          </Card>
        )}

        {activeTab === 'api' && (
          <Card>
            <CardHeader><CardTitle>API Configuration</CardTitle></CardHeader>
            <div className="max-w-lg space-y-4">
              <Input label="API Base URL" value={import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'} hint="FastAPI backend endpoint" />
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-text-primary">Mock API Mode</p>
                  <p className="text-xs text-text-tertiary">Use simulated data instead of real backend</p>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-accent/10 text-accent border border-accent/20">
                  {import.meta.env.VITE_USE_MOCK_API === 'true' ? 'ENABLED' : 'DISABLED'}
                </span>
              </div>
            </div>
          </Card>
        )}

        {activeTab === 'data' && (
          <Card>
            <CardHeader><CardTitle>Data Preferences</CardTitle></CardHeader>
            <div className="max-w-lg space-y-4">
              <Select label="Default Date Range" options={[{ value: '30d', label: 'Last 30 days' }, { value: '90d', label: 'Last 90 days' }, { value: '1y', label: 'Last year' }]} value="30d" />
              <Select label="Default Risk Filter" options={[{ value: 'all', label: 'All Risk Levels' }, { value: 'high', label: 'High & Critical Only' }]} value="all" />
              <Select label="Table Page Size" options={[{ value: '10', label: '10 rows' }, { value: '25', label: '25 rows' }, { value: '50', label: '50 rows' }]} value="10" />
            </div>
            <Button icon={Save} onClick={handleSave} className="mt-6">Save Preferences</Button>
          </Card>
        )}
      </motion.div>
    </div>
  );
}
