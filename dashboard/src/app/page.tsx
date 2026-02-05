'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

interface DashboardStats {
  pending_review: number;
  pending_approval: number;
  approved_prospects: number;
  total_prospects: number;
  emails_sent: number;
  responses: number;
  conversions: number;
  response_rate: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      // Fetch from real APIs
      const [metricsRes, prospectsRes, emailsRes] = await Promise.all([
        fetch(`${API_BASE}/metrics/summary`),
        fetch(`${API_BASE}/prospects/stats`),
        fetch(`${API_BASE}/emails?status=pending_review&limit=1`),
      ]);

      let pendingReview = 0;
      let pendingApproval = 0;
      let approvedProspects = 0;
      let totalProspects = 0;
      let emailsSent = 0;
      let responses = 0;
      let conversions = 0;
      let responseRate = 0;

      if (metricsRes.ok) {
        const metrics = await metricsRes.json();
        totalProspects = metrics.total_prospects || 0;
        emailsSent = metrics.total_emails_sent || 0;
        responses = metrics.total_responses || 0;
        conversions = metrics.total_conversions || 0;
        responseRate = metrics.response_rate || 0;
      }

      if (prospectsRes.ok) {
        const prospectStats = await prospectsRes.json();
        pendingApproval = prospectStats.pending || 0;
        approvedProspects = prospectStats.approved || 0;
      }

      if (emailsRes.ok) {
        const emailData = await emailsRes.json();
        pendingReview = emailData.total || 0;
      }

      setStats({
        pending_review: pendingReview,
        pending_approval: pendingApproval,
        approved_prospects: approvedProspects,
        total_prospects: totalProspects,
        emails_sent: emailsSent,
        responses: responses,
        conversions: conversions,
        response_rate: responseRate,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
      // Set default values on error
      setStats({
        pending_review: 0,
        pending_approval: 0,
        approved_prospects: 0,
        total_prospects: 0,
        emails_sent: 0,
        responses: 0,
        conversions: 0,
        response_rate: 0,
      });
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">Loading...</p>
        </div>
        <div className="text-center py-12 text-gray-500">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Overview of your backlink outreach campaign</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <StatCard
          label="Total Prospects"
          value={stats?.total_prospects || 0}
          color="primary"
        />
        <StatCard
          label="Pending Approval"
          value={stats?.pending_approval || 0}
          color="warning"
          href="/research"
        />
        <StatCard
          label="Approved"
          value={stats?.approved_prospects || 0}
          color="success"
        />
        <StatCard
          label="Emails Sent"
          value={stats?.emails_sent || 0}
          color="primary"
        />
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <StatCard
          label="Pending Review"
          value={stats?.pending_review || 0}
          color="warning"
          href="/review"
        />
        <StatCard
          label="Responses"
          value={stats?.responses || 0}
          color="primary"
          href="/responses"
        />
        <StatCard
          label="Response Rate"
          value={`${(stats?.response_rate || 0).toFixed(1)}%`}
          color="success"
        />
        <StatCard
          label="Links Acquired"
          value={stats?.conversions || 0}
          color="success"
        />
      </div>

      {/* Getting Started - Show only if no prospects */}
      {stats && stats.total_prospects === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h3 className="font-medium text-blue-900">Get Started</h3>
              <p className="text-blue-700 mt-1">
                Run the seed script to populate prospects from SEO Command Center data.
              </p>
              <code className="block bg-blue-100 text-blue-800 px-3 py-2 rounded mt-2 text-sm">
                cd app && npx tsx src/scripts/seed-from-seo-center.ts
              </code>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="card mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-4">
          <Link href="/research" className="btn btn-primary">
            Review Research Citations
          </Link>
          <Link href="/broken-links" className="btn btn-primary">
            Review Broken Links
          </Link>
          {stats && stats.pending_review > 0 && (
            <Link href="/review" className="btn btn-secondary">
              Review Emails ({stats.pending_review})
            </Link>
          )}
          <Link href="/metrics" className="btn btn-secondary">
            View Metrics
          </Link>
        </div>
      </div>

      {/* Workflow Summary */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Outreach Workflow</h2>
        <div className="grid grid-cols-5 gap-4">
          <WorkflowStep
            number={1}
            title="Find Prospects"
            description="SEO Command Center or DataForSEO"
            status={stats && stats.total_prospects > 0 ? 'complete' : 'pending'}
          />
          <WorkflowStep
            number={2}
            title="Review & Approve"
            description="Filter quality prospects"
            status={stats && stats.approved_prospects > 0 ? 'complete' : stats && stats.pending_approval > 0 ? 'active' : 'pending'}
          />
          <WorkflowStep
            number={3}
            title="Compose Emails"
            description="Claude-generated outreach"
            status={stats && stats.pending_review > 0 ? 'active' : stats && stats.emails_sent > 0 ? 'complete' : 'pending'}
          />
          <WorkflowStep
            number={4}
            title="Send & Track"
            description="Automated delivery"
            status={stats && stats.emails_sent > 0 ? 'complete' : 'pending'}
          />
          <WorkflowStep
            number={5}
            title="Handle Responses"
            description="AI-classified replies"
            status={stats && stats.responses > 0 ? 'complete' : 'pending'}
          />
        </div>
      </div>

      {/* Safety Mode Banner */}
      <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">&#128737;</span>
          <div>
            <h3 className="font-semibold text-yellow-800">Safety Mode Active</h3>
            <p className="text-yellow-700 text-sm">
              All emails are redirected to vicky@shieldyourbody.com for testing.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  subtext,
  href,
}: {
  label: string;
  value: string | number;
  color: 'primary' | 'success' | 'warning' | 'danger';
  subtext?: string;
  href?: string;
}) {
  const colors = {
    primary: 'text-primary-600',
    success: 'text-success-500',
    warning: 'text-warning-500',
    danger: 'text-danger-500',
  };

  const content = (
    <div className="stat-card hover:shadow-md transition-shadow cursor-pointer">
      <div className={`stat-value ${colors[color]}`}>{value}</div>
      <div className="stat-label">{label}</div>
      {subtext && <div className="text-xs text-gray-400 mt-1">{subtext}</div>}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}

function WorkflowStep({
  number,
  title,
  description,
  status,
}: {
  number: number;
  title: string;
  description: string;
  status: 'pending' | 'active' | 'complete';
}) {
  const statusStyles = {
    pending: 'bg-gray-100 text-gray-400',
    active: 'bg-blue-100 text-blue-600 ring-2 ring-blue-500',
    complete: 'bg-green-100 text-green-600',
  };

  return (
    <div className="text-center">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2 ${statusStyles[status]}`}>
        {status === 'complete' ? (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        ) : (
          <span className="font-semibold">{number}</span>
        )}
      </div>
      <div className="text-sm font-medium text-gray-900">{title}</div>
      <div className="text-xs text-gray-500">{description}</div>
    </div>
  );
}
