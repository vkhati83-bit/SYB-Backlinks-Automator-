'use client';

import { useState, useEffect } from 'react';

interface Settings {
  // Email Settings
  daily_send_limit: number;
  send_window_start: string;
  send_window_end: string;
  from_email: string;
  from_name: string;
  reply_to: string;

  // Follow-up Settings
  followup_enabled: boolean;
  followup_max_count: number;
  followup_day_1: number;
  followup_day_2: number;

  // Prospecting Settings
  min_domain_authority: number;
  min_quality_score: number;
  prospect_batch_size: number;

  // Safety Settings
  safety_mode: 'test' | 'live';
  test_email_recipient: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    // Mock data - replace with API call
    setSettings({
      daily_send_limit: 50,
      send_window_start: '09:00',
      send_window_end: '17:00',
      from_email: 'research@shieldyourbody.com',
      from_name: 'SYB Research Team',
      reply_to: 'research@shieldyourbody.com',

      followup_enabled: true,
      followup_max_count: 2,
      followup_day_1: 4,
      followup_day_2: 8,

      min_domain_authority: 20,
      min_quality_score: 40,
      prospect_batch_size: 50,

      safety_mode: 'test',
      test_email_recipient: 'vicky@shieldyourbody.com',
    });
    setLoading(false);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    // API call to save settings
    console.log('Saving settings:', settings);
    await new Promise(resolve => setTimeout(resolve, 500));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleFactoryReset = async () => {
    if (!resetPassword) {
      alert('Please enter admin password');
      return;
    }

    if (!confirm('⚠️ FINAL WARNING: This will permanently delete ALL data including prospects, contacts, emails, campaigns, and metrics. This action CANNOT be undone. Are you absolutely sure?')) {
      return;
    }

    setResetting(true);
    try {
      const response = await fetch('/api/v1/settings/factory-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmation: 'RESET_EVERYTHING',
          admin_password: resetPassword,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alert(`✅ Factory reset complete!\n\nDeleted:\n- ${data.deleted.prospects} prospects\n- ${data.deleted.contacts} contacts\n- ${data.deleted.emails} emails\n- ${data.deleted.campaigns} campaigns\n- ${data.deleted.responses} responses\n\nSystem restored to factory defaults.`);
        setShowResetConfirm(false);
        setResetPassword('');
        window.location.href = '/'; // Redirect to dashboard
      } else {
        alert(`❌ Reset failed: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      alert('❌ Reset failed: ' + error);
    } finally {
      setResetting(false);
    }
  };

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    if (settings) {
      setSettings({ ...settings, [key]: value });
    }
  };

  if (loading || !settings) {
    return <div className="text-center py-12">Loading...</div>;
  }

  return (
    <div className="animate-fade-in max-w-4xl">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-500">Configure your backlink automation system</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-green-600 text-sm">Settings saved!</span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Safety Mode Banner */}
      <div className={`mb-6 p-4 rounded-lg ${
        settings.safety_mode === 'test'
          ? 'bg-yellow-50 border border-yellow-200'
          : 'bg-red-50 border border-red-200'
      }`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{settings.safety_mode === 'test' ? '🛡️' : '⚠️'}</span>
          <div>
            <div className={`font-medium ${
              settings.safety_mode === 'test' ? 'text-yellow-800' : 'text-red-800'
            }`}>
              {settings.safety_mode === 'test'
                ? 'Safety Mode ACTIVE - All emails redirected to test recipient'
                : 'LIVE MODE - Emails will be sent to real recipients'}
            </div>
            <div className={`text-sm ${
              settings.safety_mode === 'test' ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {settings.safety_mode === 'test'
                ? `All outbound emails are sent to: ${settings.test_email_recipient}`
                : 'Make sure you have verified all settings before enabling live mode'}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Email Settings */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Email Settings</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">From Email</label>
              <input
                type="email"
                value={settings.from_email}
                onChange={(e) => updateSetting('from_email', e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">From Name</label>
              <input
                type="text"
                value={settings.from_name}
                onChange={(e) => updateSetting('from_name', e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">Reply-To Email</label>
              <input
                type="email"
                value={settings.reply_to}
                onChange={(e) => updateSetting('reply_to', e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">Daily Send Limit</label>
              <input
                type="number"
                value={settings.daily_send_limit}
                onChange={(e) => updateSetting('daily_send_limit', parseInt(e.target.value) || 0)}
                className="input"
                min="1"
                max="500"
              />
            </div>
            <div>
              <label className="label">Send Window Start</label>
              <input
                type="time"
                value={settings.send_window_start}
                onChange={(e) => updateSetting('send_window_start', e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">Send Window End</label>
              <input
                type="time"
                value={settings.send_window_end}
                onChange={(e) => updateSetting('send_window_end', e.target.value)}
                className="input"
              />
            </div>
          </div>
        </div>

        {/* Follow-up Settings */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Follow-up Settings</h2>
          <div className="mb-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.followup_enabled}
                onChange={(e) => updateSetting('followup_enabled', e.target.checked)}
                className="rounded"
              />
              <span className="text-gray-700">Enable automatic follow-ups</span>
            </label>
          </div>
          {settings.followup_enabled && (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="label">Max Follow-ups</label>
                <input
                  type="number"
                  value={settings.followup_max_count}
                  onChange={(e) => updateSetting('followup_max_count', parseInt(e.target.value) || 0)}
                  className="input"
                  min="1"
                  max="5"
                />
              </div>
              <div>
                <label className="label">First Follow-up (days)</label>
                <input
                  type="number"
                  value={settings.followup_day_1}
                  onChange={(e) => updateSetting('followup_day_1', parseInt(e.target.value) || 0)}
                  className="input"
                  min="1"
                  max="30"
                />
              </div>
              <div>
                <label className="label">Second Follow-up (days)</label>
                <input
                  type="number"
                  value={settings.followup_day_2}
                  onChange={(e) => updateSetting('followup_day_2', parseInt(e.target.value) || 0)}
                  className="input"
                  min="1"
                  max="30"
                />
              </div>
            </div>
          )}
        </div>

        {/* Prospecting Settings */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Prospecting Settings</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Min Domain Authority</label>
              <input
                type="number"
                value={settings.min_domain_authority}
                onChange={(e) => updateSetting('min_domain_authority', parseInt(e.target.value) || 0)}
                className="input"
                min="0"
                max="100"
              />
              <p className="text-xs text-gray-500 mt-1">Minimum DA score to consider</p>
            </div>
            <div>
              <label className="label">Min Quality Score</label>
              <input
                type="number"
                value={settings.min_quality_score}
                onChange={(e) => updateSetting('min_quality_score', parseInt(e.target.value) || 0)}
                className="input"
                min="0"
                max="100"
              />
              <p className="text-xs text-gray-500 mt-1">Minimum overall quality score</p>
            </div>
            <div>
              <label className="label">Batch Size</label>
              <input
                type="number"
                value={settings.prospect_batch_size}
                onChange={(e) => updateSetting('prospect_batch_size', parseInt(e.target.value) || 0)}
                className="input"
                min="10"
                max="200"
              />
              <p className="text-xs text-gray-500 mt-1">Prospects per batch run</p>
            </div>
          </div>
        </div>

        {/* Safety Settings */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Safety Settings</h2>
          <div className="space-y-4">
            <div>
              <label className="label">Operation Mode</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="safety_mode"
                    checked={settings.safety_mode === 'test'}
                    onChange={() => updateSetting('safety_mode', 'test')}
                  />
                  <span className="text-gray-700">Test Mode (Safe)</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="safety_mode"
                    checked={settings.safety_mode === 'live'}
                    onChange={() => updateSetting('safety_mode', 'live')}
                  />
                  <span className="text-gray-700">Live Mode</span>
                </label>
              </div>
            </div>
            {settings.safety_mode === 'test' && (
              <div>
                <label className="label">Test Email Recipient</label>
                <input
                  type="email"
                  value={settings.test_email_recipient}
                  onChange={(e) => updateSetting('test_email_recipient', e.target.value)}
                  className="input max-w-md"
                />
                <p className="text-xs text-gray-500 mt-1">
                  All outbound emails will be redirected to this address
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Blocklist Management */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Blocklist Management</h2>
          <div className="flex gap-4">
            <button className="btn btn-secondary">
              View Blocked Domains (23)
            </button>
            <button className="btn btn-secondary">
              View Blocked Emails (8)
            </button>
            <button className="btn btn-secondary">
              Import Blocklist
            </button>
          </div>
        </div>

        {/* API Keys */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">API Connections</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Anthropic (Claude)</span>
              <span className="badge badge-success">Connected</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Resend (Email)</span>
              <span className="badge badge-success">Connected</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">SEO Command Center</span>
              <span className="badge badge-success">Connected</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-gray-600">Redis (Job Queue)</span>
              <span className="badge badge-success">Connected</span>
            </div>
          </div>
        </div>

        {/* DANGER ZONE */}
        <div className="card border-2 border-red-300 bg-red-50">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">⚠️</span>
            <h2 className="text-lg font-semibold text-red-900">Danger Zone (Admin Only)</h2>
          </div>

          <div className="bg-white rounded-lg p-4 border border-red-200">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-semibold text-red-900">Factory Reset</h3>
                <p className="text-sm text-red-700 mt-1">
                  Permanently delete ALL data and restore system to factory defaults.
                  Use this when the app is buggy or you want a fresh start.
                </p>
                <p className="text-xs text-red-600 mt-2 font-medium">
                  ⚠️ This will delete: All prospects, contacts, emails, campaigns, responses, and metrics.
                  This action CANNOT be undone!
                </p>
              </div>
            </div>

            {!showResetConfirm ? (
              <button
                onClick={() => setShowResetConfirm(true)}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-medium text-sm"
              >
                Reset Everything
              </button>
            ) : (
              <div className="space-y-3 bg-red-100 p-4 rounded border border-red-300">
                <div className="text-sm font-medium text-red-900">
                  🚨 FINAL CONFIRMATION - Enter admin password:
                </div>
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="Admin password"
                  className="input max-w-xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleFactoryReset();
                  }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleFactoryReset}
                    disabled={resetting || !resetPassword}
                    className="px-4 py-2 bg-red-700 text-white rounded hover:bg-red-800 font-medium text-sm disabled:opacity-50"
                  >
                    {resetting ? 'Resetting...' : '🚨 CONFIRM FACTORY RESET'}
                  </button>
                  <button
                    onClick={() => {
                      setShowResetConfirm(false);
                      setResetPassword('');
                    }}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
                  >
                    Cancel
                  </button>
                </div>
                <p className="text-xs text-red-700">
                  Password hint: Check ADMIN_RESET_PASSWORD in .env (default: syb-admin-reset-2026)
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
