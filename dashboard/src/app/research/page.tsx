'use client';

import { useState, useEffect, useCallback } from 'react';
import { ProspectDetail, BulkActionBar } from '../../components/prospects';
import FetchDataModal, { FetchParams } from '../../components/FetchDataModal';

interface Prospect {
  id: string;
  url: string;
  domain: string;
  title: string | null;
  description: string | null;
  domain_authority: number | null;
  quality_score: number | null;
  opportunity_type: string;
  status: string;
  niche: string | null;
  approval_status: string;
  outcome_tag: string | null;
  contact_count: number;
  suggested_article_url?: string | null;
  suggested_article_title?: string | null;
  match_reason?: string | null;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

export default function ResearchCitationsPage() {
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'completed'>('pending');
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, completed: 0 });
  const [fetching, setFetching] = useState(false);
  const [fetchResult, setFetchResult] = useState<{ success: boolean; message: string } | null>(null);
  const [findingContacts, setFindingContacts] = useState(false);
  const [showFetchModal, setShowFetchModal] = useState(false);

  const fetchProspects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/prospects?opportunity_type=research_citation&approval_status=${activeTab === 'completed' ? 'approved' : activeTab}&limit=1000`
      );
      if (res.ok) {
        const data = await res.json();
        let filtered = data.prospects || [];

        // For completed tab, filter to those with outcome_tag set
        if (activeTab === 'completed') {
          filtered = filtered.filter((p: Prospect) => p.outcome_tag !== null);
        } else if (activeTab === 'approved') {
          filtered = filtered.filter((p: Prospect) => p.outcome_tag === null);
        }

        setProspects(filtered);
      }
    } catch (error) {
      console.error('Error fetching prospects:', error);
    }
    setLoading(false);
  }, [activeTab]);

  const fetchCounts = useCallback(async () => {
    try {
      const [pendingRes, approvedRes] = await Promise.all([
        fetch(`${API_BASE}/prospects?opportunity_type=research_citation&approval_status=pending&limit=1000`),
        fetch(`${API_BASE}/prospects?opportunity_type=research_citation&approval_status=approved&limit=1000`),
      ]);

      const pendingData = pendingRes.ok ? await pendingRes.json() : { prospects: [] };
      const approvedData = approvedRes.ok ? await approvedRes.json() : { prospects: [] };

      const approvedProspects = approvedData.prospects || [];
      const completed = approvedProspects.filter((p: Prospect) => p.outcome_tag !== null).length;
      const approved = approvedProspects.filter((p: Prospect) => p.outcome_tag === null).length;

      setCounts({
        pending: pendingData.prospects?.length || 0,
        approved,
        completed,
      });
    } catch (error) {
      console.error('Error fetching counts:', error);
    }
  }, []);

  useEffect(() => {
    fetchProspects();
  }, [fetchProspects]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  const handleToggleCheck = (id: string) => {
    const newChecked = new Set(checkedIds);
    if (newChecked.has(id)) {
      newChecked.delete(id);
    } else {
      newChecked.add(id);
    }
    setCheckedIds(newChecked);
  };

  const handleSelectAll = () => {
    if (checkedIds.size === prospects.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(prospects.map(p => p.id)));
    }
  };

  const handleBulkAction = async (action: 'approve' | 'reject') => {
    if (checkedIds.size === 0) return;

    setBulkLoading(true);
    try {
      const res = await fetch(`${API_BASE}/prospects/bulk-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(checkedIds),
          action,
        }),
      });

      if (res.ok) {
        await fetchProspects();
        await fetchCounts();
        setCheckedIds(new Set());
        setSelectedProspect(null);
      }
    } catch (error) {
      console.error('Error performing bulk action:', error);
    }
    setBulkLoading(false);
  };

  const handleUpdateProspect = (updated: Prospect) => {
    setSelectedProspect(updated);
    setProspects(prev => prev.map(p => p.id === updated.id ? updated : p));
  };

  const handleFetchFreshData = async (params: FetchParams) => {
    setFetching(true);
    setFetchResult(null);
    try {
      const res = await fetch(`${API_BASE}/data-fetch/research-citations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: params.limit,
          minPosition: params.minPosition,
          maxPosition: params.maxPosition,
          minDA: params.minDA,
          maxDA: params.maxDA,
          keywords: params.keywords,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        setFetchResult({
          success: true,
          message: `Found ${data.total_found || 0} prospects, ${data.inserted || 0} new ones added`,
        });
        await fetchProspects();
        await fetchCounts();
      } else {
        setFetchResult({
          success: false,
          message: data.error || 'Failed to fetch data',
        });
      }
    } catch (error: any) {
      console.error('Fetch error:', error);
      setFetchResult({
        success: false,
        message: `Failed to connect to server: ${error?.message || 'Unknown error'}`,
      });
    }
    setFetching(false);
  };

  const handleFindContacts = async () => {
    setFindingContacts(true);
    setFetchResult(null);
    try {
      const res = await fetch(`${API_BASE}/data-fetch/find-contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunity_type: 'research_citation', limit: 50 }),
      });
      const data = await res.json();

      if (res.ok) {
        setFetchResult({
          success: true,
          message: data.message + (data.note ? ` (${data.note})` : ''),
        });
      } else {
        setFetchResult({
          success: false,
          message: data.error || 'Failed to queue contact finding',
        });
      }
    } catch (error: any) {
      console.error('Find contacts error:', error);
      setFetchResult({
        success: false,
        message: `Failed to connect to server: ${error?.message || 'Unknown error'}`,
      });
    }
    setFindingContacts(false);
  };

  const tabs = [
    { id: 'pending' as const, label: 'Pending Review', count: counts.pending },
    { id: 'approved' as const, label: 'Ready to Send', count: counts.approved },
    { id: 'completed' as const, label: 'Completed', count: counts.completed },
  ];

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Research Citations</h1>
              <p className="text-gray-500">Sites ranking for EMF keywords - pitch our research database</p>
            </div>
          </div>
          <button
            onClick={() => setShowFetchModal(true)}
            disabled={fetching}
            className="btn btn-primary flex items-center gap-2"
            title="Configure and fetch from SEO Command Center database"
          >
            {fetching ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Fetching...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Fetch Fresh Data
              </>
            )}
          </button>
          <button
            onClick={handleFindContacts}
            disabled={findingContacts || counts.pending + counts.approved === 0}
            className="btn btn-secondary flex items-center gap-2"
            title="Scrape real contact emails from prospect websites"
          >
            {findingContacts ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Queuing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Find Real Contacts
              </>
            )}
          </button>
        </div>

        {/* Fetch Result Message */}
        {fetchResult && (
          <div className={`mt-4 p-3 rounded-lg ${
            fetchResult.success ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {fetchResult.message}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setSelectedProspect(null);
                setCheckedIds(new Set());
              }}
              className={`
                whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm
                ${activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              {tab.label}
              <span className={`ml-2 py-0.5 px-2 rounded-full text-xs ${
                activeTab === tab.id ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-12 gap-6">
        {/* Prospect List */}
        <div className="col-span-5">
          <div className="card p-4">
            {/* Select All */}
            {activeTab === 'pending' && prospects.length > 0 && (
              <div className="flex items-center justify-between mb-4 pb-3 border-b">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checkedIds.size === prospects.length && prospects.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-600">
                    Select All ({prospects.length})
                  </span>
                </label>
              </div>
            )}

            <div className="space-y-2 max-h-[calc(100vh-380px)] overflow-y-auto">
              {loading ? (
                <div className="text-center py-12 text-gray-500">Loading...</div>
              ) : prospects.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  No {activeTab} research citation prospects
                </div>
              ) : (
                prospects.map((prospect) => (
                  <div
                    key={prospect.id}
                    onClick={() => setSelectedProspect(prospect)}
                    className={`
                      p-3 rounded-lg border cursor-pointer transition-colors
                      ${selectedProspect?.id === prospect.id
                        ? 'bg-blue-50 border-blue-200'
                        : 'bg-white border-gray-200 hover:bg-gray-50'
                      }
                    `}
                  >
                    <div className="flex items-start gap-3">
                      {activeTab === 'pending' && (
                        <input
                          type="checkbox"
                          checked={checkedIds.has(prospect.id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleToggleCheck(prospect.id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 rounded border-gray-300"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <span className="font-medium text-gray-900">{prospect.domain}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                            Score: {prospect.quality_score || '-'}
                          </span>
                        </div>
                        {prospect.title && (
                          <div className="text-sm text-gray-600 truncate mt-1">{prospect.title}</div>
                        )}
                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-2">
                          <span>DA: {prospect.domain_authority || '-'}</span>
                          <span>{prospect.contact_count} contacts</span>
                          {prospect.outcome_tag && (
                            <span className={`px-2 py-0.5 rounded-full ${
                              prospect.outcome_tag === 'partner' ? 'bg-green-100 text-green-800' :
                              prospect.outcome_tag === 'not_interested' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {prospect.outcome_tag.replace('_', ' ')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Detail Panel */}
        <div className="col-span-7">
          {selectedProspect ? (
            <ProspectDetail
              prospect={selectedProspect}
              onUpdate={handleUpdateProspect}
              onShowAddContact={() => {}}
            />
          ) : (
            <div className="card p-8 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Prospect</h3>
              <p className="text-gray-500">
                Click on a research citation prospect to view details and compose outreach
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedCount={checkedIds.size}
        onApprove={() => handleBulkAction('approve')}
        onReject={() => handleBulkAction('reject')}
        onClear={() => setCheckedIds(new Set())}
        isLoading={bulkLoading}
        activeTab={activeTab}
      />

      {/* Fetch Data Modal */}
      <FetchDataModal
        isOpen={showFetchModal}
        onClose={() => setShowFetchModal(false)}
        type="research_citation"
        onFetch={handleFetchFreshData}
      />
    </div>
  );
}
