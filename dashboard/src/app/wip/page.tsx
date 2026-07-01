'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

interface WipData {
  today: { daily_cap: number; used_today: number; remaining_today: number; delivered_today: number };
  queue: { pending_review: number; approved: number; ready_prospects: number };
  autopilot: { enabled: boolean; run_hour_utc: number; next_run_utc: string };
  pipeline: Record<string, number>;
  totals: { sent_all_time: number; last_sent_at: string | null };
  safety_mode: string;
  generated_at: string;
}

// Human labels for the raw prospect status values.
const STATUS_LABELS: Record<string, string> = {
  new: 'New (no contact yet)',
  contact_found: 'Contact found',
  email_sent: 'Email sent',
  responded: 'Responded',
  bounced: 'Bounced',
  rejected: 'Rejected',
};

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function WipPage() {
  const [data, setData] = useState<WipData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchWip = async () => {
    try {
      const res = await fetch(`${API_BASE}/emails/wip`);
      if (res.ok) {
        setData(await res.json());
        setError(false);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchWip();
    const interval = setInterval(fetchWip, 5000); // live refresh every 5s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="animate-fade-in">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Today / Work in Progress</h1>
        <p className="text-gray-500">Loading live status…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="animate-fade-in">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Today / Work in Progress</h1>
        <p className="text-red-600">Could not load status. The API may be restarting — this refreshes automatically.</p>
      </div>
    );
  }

  const { today, queue, autopilot, pipeline, totals } = data;
  const pct = today.daily_cap > 0 ? Math.round((today.used_today / today.daily_cap) * 100) : 0;
  const nextRunLocal = new Date(autopilot.next_run_utc).toLocaleString(undefined, {
    weekday: 'short', hour: 'numeric', minute: '2-digit',
  });

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Today / Work in Progress</h1>
          <p className="text-gray-500">Live view of today&apos;s sending. Auto-refreshes every 5 seconds.</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
          autopilot.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
        }`}>
          Autopilot {autopilot.enabled ? 'ON' : 'OFF'}
        </span>
      </div>

      {/* Today's send budget */}
      <div className="card mb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Today&apos;s send budget</h2>
          <span className="text-sm text-gray-400">resets midnight UTC (5:30 AM IST)</span>
        </div>
        <div className="flex items-end gap-2 mb-3">
          <span className="text-4xl font-bold text-primary-600">{today.used_today}</span>
          <span className="text-xl text-gray-400 mb-1">/ {today.daily_cap} used</span>
          <span className="ml-auto text-lg font-medium text-success-500">{today.remaining_today} left today</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all duration-700 ${pct >= 100 ? 'bg-success-500' : 'bg-primary-500'}`}
            style={{ width: `${Math.min(Math.max(pct, 2), 100)}%` }}
          />
        </div>
        <p className="text-sm text-gray-500 mt-3">
          {today.remaining_today > 0
            ? `Room for ${today.remaining_today} more email${today.remaining_today === 1 ? '' : 's'} today.`
            : 'Daily cap reached — nothing more will send until the reset.'}
          {' '}Next autopilot run: <span className="font-medium text-gray-700">{nextRunLocal}</span> (runs at {autopilot.run_hour_utc}:00 UTC).
        </p>
      </div>

      {/* The queue right now */}
      <h2 className="text-lg font-semibold text-gray-900 mb-3">In the pipe right now</h2>
      <div className="grid grid-cols-4 gap-6 mb-6">
        <Link href="/review">
          <div className="stat-card hover:shadow-md transition-shadow cursor-pointer">
            <div className="stat-value text-warning-500">{queue.pending_review}</div>
            <div className="stat-label">Waiting for your approval</div>
          </div>
        </Link>
        <div className="stat-card">
          <div className="stat-value text-primary-600">{queue.approved}</div>
          <div className="stat-label">Approved, queued to send</div>
        </div>
        <div className="stat-card">
          <div className="stat-value text-primary-600">{queue.ready_prospects}</div>
          <div className="stat-label">Ready (contact found, no email yet)</div>
        </div>
        <div className="stat-card">
          <div className="stat-value text-success-500">{today.delivered_today}</div>
          <div className="stat-label">Actually delivered today</div>
        </div>
      </div>

      {/* Prospect pipeline funnel */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Prospect pipeline</h2>
        <div className="grid grid-cols-3 gap-4">
          {Object.entries(pipeline).length === 0 && (
            <p className="text-gray-400 text-sm">No prospects yet.</p>
          )}
          {Object.entries(pipeline)
            .sort((a, b) => b[1] - a[1])
            .map(([status, count]) => (
              <div key={status} className="flex items-center justify-between border border-gray-100 rounded-lg px-4 py-3">
                <span className="text-sm text-gray-600">{STATUS_LABELS[status] || status}</span>
                <span className="text-lg font-semibold text-gray-900">{count}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Footer facts */}
      <div className="grid grid-cols-3 gap-6">
        <div className="stat-card">
          <div className="stat-value text-gray-900">{totals.sent_all_time}</div>
          <div className="stat-label">Emails sent all time</div>
        </div>
        <div className="stat-card">
          <div className="stat-value text-gray-900">{timeAgo(totals.last_sent_at)}</div>
          <div className="stat-label">Last email sent</div>
        </div>
        <div className="stat-card">
          <div className={`stat-value ${data.safety_mode === 'live' ? 'text-danger-500' : 'text-success-500'}`}>
            {data.safety_mode === 'live' ? 'LIVE' : 'TEST'}
          </div>
          <div className="stat-label">
            {data.safety_mode === 'live' ? 'Sending to real recipients' : 'Redirected to your inbox'}
          </div>
        </div>
      </div>
    </div>
  );
}
