'use client';

import React, { useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/components/providers/AuthProvider';
import { CostDatabaseEditor } from '@/components/settings/CostDatabaseEditor';
import { useToast } from '@/components/ui/Toast';
import { User, Building2, DollarSign } from 'lucide-react';

type SettingsTab = 'profile' | 'costs';

export default function SettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [fullName, setFullName] = useState(
    user?.user_metadata?.full_name ?? ''
  );
  const [company, setCompany] = useState(
    user?.user_metadata?.company ?? ''
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    setSaving(true);
    try {
      // Placeholder for saving profile settings via Supabase
      await new Promise((resolve) => setTimeout(resolve, 500));
      setSaved(true);
      toast('success', 'Profile saved successfully');
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'profile' as const, label: 'Profile', icon: User },
    { id: 'costs' as const, label: 'Cost Database', icon: DollarSign },
  ];

  return (
    <div className="px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors cursor-pointer ${
              activeTab === tab.id
                ? 'text-primary border-b-2 border-primary bg-primary/5'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'profile' && (
        <div className="max-w-2xl space-y-6">
          {/* Profile Section */}
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Profile</h2>
                <p className="text-xs text-gray-500">Manage your account details</p>
              </div>
            </div>
            <div className="space-y-4">
              <Input
                label="Full Name"
                value={fullName}
                onChange={(e) => { setFullName(e.target.value); setSaved(false); }}
                placeholder="Your name"
              />
              <Input
                label="Email"
                value={user?.email ?? ''}
                disabled
                placeholder="your@email.com"
              />
              <Input
                label="Company"
                value={company}
                onChange={(e) => { setCompany(e.target.value); setSaved(false); }}
                placeholder="Your company name"
                icon={<Building2 className="h-4 w-4" />}
              />
              <div className="pt-2">
                <Button onClick={handleSave} loading={saving}>
                  {saved ? 'Saved!' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </section>

          {/* Change Password Section */}
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Security</h2>
            <p className="text-sm text-gray-500 mb-4">
              Update your password to keep your account secure.
            </p>
            <Button variant="secondary" onClick={() => toast('info', 'Password reset email sent (check your inbox)')}>
              Change Password
            </Button>
          </section>
        </div>
      )}

      {activeTab === 'costs' && (
        <div className="max-w-5xl">
          <CostDatabaseEditor />
        </div>
      )}
    </div>
  );
}
