import { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Building2, Shield, Palette, Save, LogOut } from 'lucide-react';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Tabs from '../components/ui/Tabs';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { THEME_OPTIONS } from '../utils/theme';
import { useNavigate } from 'react-router-dom';

// Data lives in Data Management and History, not here. The old "Data source"
// and "Data preferences" tabs were removed: the first restated an environment
// variable, the second collected values nothing read.
//
// Notifications is gone for the same reason, one step further on: the product
// has no notification delivery, so a page of toggles was a promise nothing
// kept. The backend/demo notification code is untouched -- this is a UI
// visibility decision, not a teardown. Re-adding the tab means shipping the
// delivery behind it first.
const tabs = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'organization', label: 'Organization', icon: Building2 },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'appearance', label: 'Appearance', icon: Palette },
];

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { addToast, theme, resolvedTheme, setTheme } = useApp();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('profile');
  const [profile, setProfile] = useState({
    name: user?.name || '',
    email: user?.email || '',
    title: user?.title || '',
    company: user?.company || '',
  });

  const handleSave = () => {
    addToast({ type: 'success', message: 'Settings saved successfully' });
  };

  const handleLogout = async () => {
    // Same ordering fix as AppLayout.jsx's sign-out -- see its comment for
    // why navigate() must happen before logout(), not after.
    navigate('/');
    await logout();
  };

  return (
    // Capped to the width its content actually needs: every panel here is a
    // short form, and a tab rule stretched across a wide monitor above a
    // half-empty card reads as an unfinished page.
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-text-primary tracking-tight">Settings</h1>
        <p className="text-sm text-text-secondary mt-1">Your account, your organization, and how ChurnGuard looks on this device.</p>
      </div>

      <Tabs tabs={tabs} defaultTab="profile" onChange={setActiveTab} />

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {activeTab === 'profile' && (
          <Card>
            <CardHeader><CardTitle>Profile Information</CardTitle></CardHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Full Name" value={profile.name} onChange={(e) => setProfile(p => ({ ...p, name: e.target.value }))} />
              <Input label="Email" type="email" value={profile.email} onChange={(e) => setProfile(p => ({ ...p, email: e.target.value }))} />
              <Input label="Job Title" value={profile.title} onChange={(e) => setProfile(p => ({ ...p, title: e.target.value }))} />
              <Input label="Company" value={profile.company} onChange={(e) => setProfile(p => ({ ...p, company: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2 mt-6">
              <Button icon={Save} onClick={handleSave}>Save Changes</Button>
            </div>

            {/* Signing out lives here as well as under Security — this is where
                people look for it. Same handler, same auth logic; there is only
                one logout path in the app (AuthContext.logout → authService). */}
            <div className="mt-6 pt-6 border-t border-border flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary">Sign out</p>
                <p className="text-xs text-text-tertiary mt-0.5 max-w-md leading-relaxed">
                  Ends this session on this device and returns you to the sign-in page. Your
                  connected dataset stays on the backend but is hidden until you sign in again.
                </p>
              </div>
              <Button variant="danger" size="sm" icon={LogOut} onClick={handleLogout}>
                Sign Out
              </Button>
            </div>
          </Card>
        )}

        {activeTab === 'organization' && (
          <Card>
            <CardHeader><CardTitle>Organization</CardTitle></CardHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Uncontrolled (defaultValue, not value): with `value` and no
                  onChange these render as permanently read-only fields and
                  React warns about it on every mount. */}
              <Input label="Organization Name" defaultValue="ChurnGuard" />
              <Input label="Industry" defaultValue="SaaS / Technology" />
              <Select label="Plan" options={[{ value: 'enterprise', label: 'Enterprise' }, { value: 'professional', label: 'Professional' }]} defaultValue="enterprise" placeholder="" />
              <Input label="Team Size" defaultValue="12" />
            </div>
            <Button icon={Save} onClick={handleSave} className="mt-6">Save Changes</Button>
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

        {/* One appearance setting for the whole app: this select and the header
            control both read and write AppContext.theme. Applied on change --
            a "Save" button would be theatre when the effect is instant. */}
        {activeTab === 'appearance' && (
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <p className="text-xs text-text-tertiary mt-1">
                Applies immediately and is remembered on this device.
              </p>
            </CardHeader>
            <div className="max-w-md space-y-3">
              <Select
                label="Theme"
                options={THEME_OPTIONS}
                value={theme}
                placeholder=""
                onChange={(e) => setTheme(e.target.value)}
              />
              <p className="text-xs text-text-secondary leading-relaxed">
                {theme === 'system'
                  ? `Following your operating system, which is currently set to ${resolvedTheme}.`
                  : `ChurnGuard is using the ${theme} theme on this device.`}{' '}
                The same control sits in the header on every page.
              </p>
            </div>
          </Card>
        )}

      </motion.div>
    </div>
  );
}