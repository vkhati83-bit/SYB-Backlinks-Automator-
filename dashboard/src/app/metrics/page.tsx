'use client';

import { useState, useEffect } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

interface MetricsSummary {
  total_prospects: number;
  total_emails_sent: number;
  total_responses: number;
  total_conversions: number;
  response_rate: number;
  conversion_rate: number;
  avg_quality_score: number;
}

interface SourceMetric {
  source: string;
  prospects: number;
  emails_sent: number;
  responses: number;
  conversions: number;
  conversion_rate: number;
}

interface TypeMetric {
  opportunity_type: string;
  prospects: number;
  emails_sent: number;
  responses: number;
  conversions: number;
  conversion_rate: number;
}

interface ResponseBreakdown {
  classification: string;
  count: number;
}

export default function MetricsPage() {
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [sources, setSources] = useState<SourceMetric[]>([]);
  const [types, setTypes] = useState<TypeMetric[]>([]);
  const [responseBreakdown, setResponseBreakdown] = useState<ResponseBreakdown[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const [summaryRes, sourcesRes, typesRes, breakdownRes] = await Promise.all([
        fetch(`${API_BASE}/metrics/summary`),
        fetch(`${API_BASE}/metrics/by-source`),
        fetch(`${API_BASE}/metrics/by-type`),
        fetch(`${API_BASE}/metrics/response-breakdown`),
      ]);

      if (summaryRes.ok) {
        setSummary(await summaryRes.json());
      }
      if (sourcesRes.ok) {
        const data = await sourcesRes.json();
        setSources(data.sources || []);
      }
      if (typesRes.ok) {
        const data = await typesRes.json();
        setTypes(data.types || []);
      }
      if (breakdownRes.ok) {
        const data = await breakdownRes.json();
        setResponseBreakdown(data.breakdown || []);
      }
    } catch (error) {
      console.error('Error fetching metrics:', error);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Metrics & Analytics</h1>
          <p className="text-gray-500">Track your outreach performance</p>
        </div>
        <div className="text-center py-12 text-gray-500">Loading metrics...</div>
      </div>
    );
  }

  const typeLabels: Record<string, string> = {
    research_citation: 'Research Citations',
    broken_link: 'Broken Links',
    guest_post: 'Guest Posts',
  };

  const sourceLabels: Record<string, string> = {
    seo_command_center: 'SEO Command Center',
    dataforseo_serp: 'DataForSEO SERP',
    dataforseo_broken: 'DataForSEO Broken Links',
    manual: 'Manual Entry',
  };

  const classificationColors: Record<string, string> = {
    positive: 'bg-green-500',
    negotiating: 'bg-yellow-500',
    question: 'bg-blue-500',
    declined: 'bg-gray-500',
    negative: 'bg-red-500',
    auto_reply: 'bg-purple-500',
    bounce: 'bg-red-300',
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Metrics & Analytics</h1>
        <p className="text-gray-500">Track your outreach performance</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <div className="card">
          <div className="text-sm text-gray-500">Total Prospects</div>
          <div className="text-3xl font-bold text-gray-900 mt-1">
            {summary?.total_prospects || 0}
          </div>
          <div className="text-sm text-gray-400 mt-1">All time</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500">Emails Sent</div>
          <div className="text-3xl font-bold text-gray-900 mt-1">
            {summary?.total_emails_sent || 0}
          </div>
          <div className="text-sm text-gray-400 mt-1">Total outreach</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500">Response Rate</div>
          <div className="text-3xl font-bold text-primary-600 mt-1">
            {(summary?.response_rate || 0).toFixed(1)}%
          </div>
          <div className="text-sm text-gray-400 mt-1">{summary?.total_responses || 0} responses</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500">Conversion Rate</div>
          <div className="text-3xl font-bold text-green-600 mt-1">
            {(summary?.conversion_rate || 0).toFixed(1)}%
          </div>
          <div className="text-sm text-gray-400 mt-1">{summary?.total_conversions || 0} links acquired</div>
        </div>
      </div>

      {/* No Data State */}
      {summary && summary.total_emails_sent === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-medium text-blue-900">No Outreach Data Yet</h3>
              <p className="text-blue-700 mt-1">
                Start by approving prospects and sending emails. Metrics will populate as you send outreach campaigns.
              </p>
              <div className="mt-3 text-sm text-blue-600">
                <strong>Quick Start:</strong> Go to Research Citations or Broken Links, approve prospects, and compose emails.
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6 mb-8">
        {/* Conversion Funnel */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Conversion Funnel</h3>
          <div className="space-y-4">
            {[
              { label: 'Prospects Found', value: summary?.total_prospects || 0, color: 'bg-gray-500' },
              { label: 'Emails Sent', value: summary?.total_emails_sent || 0, color: 'bg-blue-500' },
              { label: 'Responses Received', value: summary?.total_responses || 0, color: 'bg-yellow-500' },
              { label: 'Links Acquired', value: summary?.total_conversions || 0, color: 'bg-green-500' },
            ].map((stage, i) => (
              <div key={i}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{stage.label}</span>
                  <span className="font-medium">{stage.value}</span>
                </div>
                <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${stage.color} rounded-full transition-all`}
                    style={{
                      width: `${summary?.total_prospects ? (stage.value / summary.total_prospects) * 100 : 0}%`,
                      minWidth: stage.value > 0 ? '2%' : '0',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* By Opportunity Type */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">By Opportunity Type</h3>
          {types.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No data yet</div>
          ) : (
            <div className="space-y-3">
              {types.map((type, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <div className="font-medium text-gray-900">
                      {typeLabels[type.opportunity_type] || type.opportunity_type}
                    </div>
                    <div className="text-xs text-gray-500">
                      {type.prospects} prospects / {type.emails_sent} sent
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-green-600">
                      {type.conversions} links
                    </div>
                    <div className="text-xs text-gray-400">
                      {type.conversion_rate.toFixed(1)}% rate
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* By Source */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">By Source</h3>
          {sources.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No data yet</div>
          ) : (
            <div className="space-y-3">
              {sources.map((source, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <div className="font-medium text-gray-900">
                      {sourceLabels[source.source] || source.source}
                    </div>
                    <div className="text-xs text-gray-500">
                      {source.prospects} prospects
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{source.emails_sent} sent</div>
                    <div className="text-xs text-gray-400">
                      {source.responses} responses
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Response Types */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Response Types</h3>
          {responseBreakdown.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No responses yet</div>
          ) : (
            <div className="space-y-3">
              {responseBreakdown.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${classificationColors[item.classification] || 'bg-gray-400'}`}></div>
                  <span className="flex-1 text-sm text-gray-600 capitalize">
                    {item.classification.replace('_', ' ')}
                  </span>
                  <span className="font-medium">{item.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
