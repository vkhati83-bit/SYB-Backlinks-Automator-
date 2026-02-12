'use client';

import { useState, useEffect } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: string;
  opportunity_type: string | null;
  stats: {
    prospects: number;
    emails_sent: number;
    responses: number;
    conversions: number;
  };
  created_at: string;
}

const statusColors: Record<string, string> = {
  draft: 'badge-secondary',
  active: 'badge-success',
  paused: 'badge-warning',
  completed: 'badge-primary',
};

const opportunityTypeLabels: Record<string, string> = {
  research_citation: 'Research Citation',
  broken_link: 'Broken Link',
  guest_post: 'Guest Post',
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    description: '',
    opportunity_type: 'research_citation',
  });

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/campaigns`);
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (error) {
      console.error('Error fetching campaigns:', error);
    }
    setLoading(false);
  };

  const handleCreateCampaign = async () => {
    try {
      const res = await fetch(`${API_BASE}/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCampaign.name,
          description: newCampaign.description || null,
          opportunity_type: newCampaign.opportunity_type,
        }),
      });

      if (res.ok) {
        setShowCreateModal(false);
        setNewCampaign({ name: '', description: '', opportunity_type: 'research_citation' });
        fetchCampaigns();
      }
    } catch (error) {
      console.error('Error creating campaign:', error);
    }
  };

  const toggleCampaignStatus = async (campaignId: string, currentStatus: string) => {
    setActionLoading(campaignId);
    try {
      const endpoint = currentStatus === 'active' ? 'pause' : 'activate';
      const res = await fetch(`${API_BASE}/campaigns/${campaignId}/${endpoint}`, {
        method: 'POST',
      });

      if (res.ok) {
        setCampaigns(campaigns.map(c =>
          c.id === campaignId
            ? { ...c, status: currentStatus === 'active' ? 'paused' : 'active' }
            : c
        ));
      }
    } catch (error) {
      console.error('Error toggling campaign status:', error);
    }
    setActionLoading(null);
  };

  if (loading) {
    return (
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
          <p className="text-gray-500">Loading...</p>
        </div>
        <div className="text-center py-12 text-gray-500">Loading campaigns...</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
          <p className="text-gray-500">
            {campaigns.filter(c => c.status === 'active').length} active campaigns
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-primary"
        >
          + New Campaign
        </button>
      </div>

      {/* Empty State */}
      {campaigns.length === 0 && (
        <div className="card text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Campaigns Yet</h3>
          <p className="text-gray-500 mb-4 max-w-md mx-auto">
            Campaigns are created automatically when you run prospect seeding scripts. You can also create one manually.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
          >
            Create Campaign
          </button>
        </div>
      )}

      {/* Campaign Cards */}
      {campaigns.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {campaigns.map((campaign) => (
            <div key={campaign.id} className="card">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{campaign.name}</h3>
                  {campaign.description && (
                    <p className="text-sm text-gray-500 mt-1">{campaign.description}</p>
                  )}
                </div>
                <span className={`badge ${statusColors[campaign.status] || 'badge-secondary'}`}>
                  {campaign.status}
                </span>
              </div>

              {/* Opportunity Type */}
              {campaign.opportunity_type && (
                <div className="mb-4">
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                    {opportunityTypeLabels[campaign.opportunity_type] || campaign.opportunity_type}
                  </span>
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-4 gap-4 py-4 border-t border-b border-gray-100">
                <div className="text-center">
                  <div className="text-xl font-bold text-gray-900">{campaign.stats?.prospects || 0}</div>
                  <div className="text-xs text-gray-500">Prospects</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-gray-900">{campaign.stats?.emails_sent || 0}</div>
                  <div className="text-xs text-gray-500">Sent</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-gray-900">{campaign.stats?.responses || 0}</div>
                  <div className="text-xs text-gray-500">Responses</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-primary-600">{campaign.stats?.conversions || 0}</div>
                  <div className="text-xs text-gray-500">Conversions</div>
                </div>
              </div>

              {/* Conversion Rate */}
              <div className="mt-4 mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-500">Conversion Rate</span>
                  <span className="font-medium">
                    {(campaign.stats?.emails_sent || 0) > 0
                      ? (((campaign.stats?.conversions || 0) / campaign.stats.emails_sent) * 100).toFixed(1)
                      : 0}%
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 rounded-full"
                    style={{
                      width: `${(campaign.stats?.emails_sent || 0) > 0
                        ? ((campaign.stats?.conversions || 0) / campaign.stats.emails_sent) * 100
                        : 0}%`
                    }}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => toggleCampaignStatus(campaign.id, campaign.status)}
                  disabled={actionLoading === campaign.id}
                  className={`btn flex-1 ${campaign.status === 'active' ? 'btn-warning' : 'btn-success'}`}
                >
                  {actionLoading === campaign.id
                    ? 'Processing...'
                    : campaign.status === 'active' ? 'Pause' : 'Activate'}
                </button>
                <button className="btn btn-secondary">
                  View Details
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Campaign Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <h3 className="text-lg font-semibold mb-4">Create New Campaign</h3>

            <div className="space-y-4">
              <div>
                <label className="label">Campaign Name</label>
                <input
                  type="text"
                  value={newCampaign.name}
                  onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                  className="input w-full"
                  placeholder="e.g., EMF Research Outreach Q1"
                />
              </div>

              <div>
                <label className="label">Description (optional)</label>
                <textarea
                  value={newCampaign.description}
                  onChange={(e) => setNewCampaign({ ...newCampaign, description: e.target.value })}
                  className="input w-full h-20"
                  placeholder="Brief description of the campaign goals..."
                />
              </div>

              <div>
                <label className="label">Opportunity Type</label>
                <select
                  value={newCampaign.opportunity_type}
                  onChange={(e) => setNewCampaign({ ...newCampaign, opportunity_type: e.target.value })}
                  className="input w-full"
                >
                  <option value="research_citation">Research Citation</option>
                  <option value="broken_link">Broken Link</option>
                  <option value="guest_post">Guest Post</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCreateCampaign}
                className="btn btn-primary flex-1"
                disabled={!newCampaign.name.trim()}
              >
                Create Campaign
              </button>
              <button
                onClick={() => setShowCreateModal(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
