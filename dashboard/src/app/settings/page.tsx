'use client';

import { useState, useEffect } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTemplate, setActiveTemplate] = useState('research');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  // Load settings from API
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch(`${API_BASE}/settings`);
        if (response.ok) {
          const data = await response.json();
          setSettings(data.settings || {});
        } else {
          setError('Failed to load settings');
        }
      } catch (err) {
        setError('Could not connect to API');
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  const updateSetting = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });

      if (response.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to save settings');
      }
    } catch (err) {
      setError('Could not connect to API');
    } finally {
      setSaving(false);
    }
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
      const response = await fetch(`${API_BASE}/settings/factory-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmation: 'RESET_EVERYTHING',
          admin_password: resetPassword,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alert(`Factory reset complete!\n\nDeleted:\n- ${data.deleted.prospects} prospects\n- ${data.deleted.contacts} contacts\n- ${data.deleted.emails} emails\n- ${data.deleted.campaigns} campaigns\n- ${data.deleted.responses} responses\n\nSystem restored to factory defaults.`);
        setShowResetConfirm(false);
        setResetPassword('');
        window.location.href = '/';
      } else {
        alert(`Reset failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      alert('Reset failed: ' + err);
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading settings...</div>;
  }

  return (
    <div className="animate-fade-in max-w-4xl">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-500">Configure your outreach settings</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-green-600 text-sm font-medium">Settings saved!</span>
          )}
          {error && (
            <span className="text-red-600 text-sm">{error}</span>
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
        settings.safety_mode !== 'live'
          ? 'bg-yellow-50 border border-yellow-200'
          : 'bg-red-50 border border-red-200'
      }`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{settings.safety_mode !== 'live' ? '🛡️' : '⚠️'}</span>
          <div>
            <div className={`font-medium ${
              settings.safety_mode !== 'live' ? 'text-yellow-800' : 'text-red-800'
            }`}>
              {settings.safety_mode !== 'live'
                ? 'Safety Mode ACTIVE - All emails redirected to test recipient'
                : 'LIVE MODE - Emails will be sent to real recipients'}
            </div>
            <div className={`text-sm ${
              settings.safety_mode !== 'live' ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {settings.safety_mode !== 'live'
                ? `All outbound emails are sent to the test recipient`
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
              <label className="label">Sender Email</label>
              <input
                type="email"
                value={settings.sender_email || ''}
                onChange={(e) => updateSetting('sender_email', e.target.value)}
                className="input"
                placeholder="outreach@yourdomain.com"
              />
              <p className="text-xs text-gray-500 mt-1">Must be verified in Resend</p>
            </div>
            <div>
              <label className="label">Sender Name</label>
              <input
                type="text"
                value={settings.sender_name || ''}
                onChange={(e) => updateSetting('sender_name', e.target.value)}
                className="input"
                placeholder="Your Name or Team"
              />
            </div>
            <div>
              <label className="label">Claude Model</label>
              <select
                value={settings.claude_model || 'claude-sonnet-4-20250514'}
                onChange={(e) => updateSetting('claude_model', e.target.value)}
                className="input"
              >
                <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (faster/cheaper)</option>
                <option value="claude-opus-4-6">Claude Opus 4.6 (best quality)</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">AI model for email generation</p>
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
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="safety_mode"
                    checked={settings.safety_mode !== 'live'}
                    onChange={() => updateSetting('safety_mode', 'test')}
                  />
                  <span className="text-gray-700">Test Mode (Safe)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="safety_mode"
                    checked={settings.safety_mode === 'live'}
                    onChange={() => updateSetting('safety_mode', 'live')}
                  />
                  <span className="text-gray-700">Live Mode</span>
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                In test mode, all emails are redirected to the test recipient instead of the actual prospect
              </p>
            </div>
          </div>
        </div>

        {/* API Connections - read-only status */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">API Connections</h2>
          <p className="text-sm text-gray-500 mb-4">Managed via environment variables on Railway</p>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Anthropic (Claude AI)</span>
              <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">Connected</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Resend (Email Delivery)</span>
              <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">Domain Not Verified</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">SEO Command Center (Data Source)</span>
              <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">Connected</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">DataForSEO (Broken Links)</span>
              <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">Connected</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-gray-600">Redis (Job Queue)</span>
              <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">Connected</span>
            </div>
          </div>
        </div>

        {/* Email Templates Section */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Email Templates</h2>
          <p className="text-sm text-gray-500 mb-4">
            Optional — leave blank to let Claude write freely. When filled, Claude will follow your structure and fill in the placeholders.
          </p>

          <div className="flex gap-2 mb-4 flex-wrap">
            {[
              { key: 'research', label: 'Research Citation' },
              { key: 'broken_link', label: 'Broken Link' },
              { key: 'followup_1', label: 'Follow-up #1' },
              { key: 'followup_2', label: 'Follow-up #2' },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTemplate(key)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  activeTemplate === key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <textarea
            rows={10}
            className="w-full font-mono text-sm border border-gray-300 rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={`Leave blank for Claude default.\n\nExample:\nHi {{contact_name}},\n\nI noticed your article on {{their_topic}}...\n\n{{our_pitch}}\n\n{{email_signature}}`}
            value={settings[`email_template_${activeTemplate}`] || ''}
            onChange={e => updateSetting(`email_template_${activeTemplate}`, e.target.value)}
          />

          <details className="mt-3">
            <summary className="text-sm text-blue-600 cursor-pointer hover:underline select-none">
              Available placeholders
            </summary>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-6 text-xs font-mono bg-gray-50 p-3 rounded-md border border-gray-200">
              <div>
                <p className="font-bold text-gray-500 mb-2 uppercase tracking-wide not-italic" style={{fontFamily: 'inherit'}}>System fills automatically</p>
                {[
                  ['{{contact_name}}', 'Recipient name'],
                  ['{{their_article_title}}', 'Their page title'],
                  ['{{their_article_url}}', 'Their page URL'],
                  ['{{broken_url}}', 'Broken link URL (broken-link only)'],
                  ['{{anchor_text}}', 'Anchor text of broken link'],
                  ['{{our_article_title}}', 'Suggested SYB article title'],
                  ['{{our_article_url}}', 'Suggested SYB article URL'],
                  ['{{study_count}}', 'Studies in matched category'],
                  ['{{research_category}}', 'Research category name'],
                  ['{{sender_name}}', 'Your name (from Sender settings)'],
                  ['{{email_signature}}', 'Your signature'],
                ].map(([ph, desc]) => (
                  <div key={ph} className="flex gap-2 py-0.5">
                    <code className="text-blue-700 shrink-0 w-52">{ph}</code>
                    <span className="text-gray-500">{desc}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 md:mt-0">
                <p className="font-bold text-gray-500 mb-2 uppercase tracking-wide not-italic" style={{fontFamily: 'inherit'}}>Claude fills contextually</p>
                {[
                  ['{{their_article_summary}}', 'Summary of their article'],
                  ['{{their_topic}}', 'Topic of their content'],
                  ['{{our_pitch}}', 'How SYB research helps their readers'],
                  ['{{how_it_helps_their_readers}}', 'Reader value proposition'],
                  ['{{connection_to_content}}', 'Relevance to their content'],
                ].map(([ph, desc]) => (
                  <div key={ph} className="flex gap-2 py-0.5">
                    <code className="text-purple-700 shrink-0 w-52">{ph}</code>
                    <span className="text-gray-500">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </details>
        </div>

        {/* DANGER ZONE */}
        <div className="card border-2 border-red-300 bg-red-50">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">⚠️</span>
            <h2 className="text-lg font-semibold text-red-900">Danger Zone</h2>
          </div>

          <div className="bg-white rounded-lg p-4 border border-red-200">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-semibold text-red-900">Factory Reset</h3>
                <p className="text-sm text-red-700 mt-1">
                  Permanently delete ALL data and restore system to factory defaults.
                </p>
                <p className="text-xs text-red-600 mt-2 font-medium">
                  This will delete: All prospects, contacts, emails, campaigns, responses, and metrics.
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
                  Enter admin password to confirm:
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
                    {resetting ? 'Resetting...' : 'Confirm Factory Reset'}
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
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
