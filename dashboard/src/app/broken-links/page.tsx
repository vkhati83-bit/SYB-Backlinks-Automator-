'use client';

import { useState, useEffect, useCallback } from 'react';
import { ProspectDetail, BulkActionBar } from '../../components/prospects';
import FetchDataModal, { FetchParams } from '../../components/FetchDataModal';
import ProspectFilterBar, { ProspectFilters, defaultFilters, filtersToQueryString } from '../../components/ProspectFilterBar';
import type { Prospect } from '../../lib/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

export default function BrokenLinksPage() {
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'completed'>('pending');
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, completed: 0 });
  const [fetching, setFetching] = useState(false);
  const [fetchResult, setFetchResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showFetchModal, setShowFetchModal] = useState(false);
  const [filters, setFilters] = useState<ProspectFilters>(defaultFilters);

  const fetchProspects = useCallback(async () => {
    setLoading(true);
    try {
      let url: string;
      if (activeTab === 'completed') {
        url = `${API_BASE}/prospects?opportunity_type=broken_link&approval_status=approved${filtersToQueryString(filters)}`;
      } else {
        url = `${API_BASE}/prospects?opportunity_type=broken_link&approval_status=${activeTab}${filtersToQueryString(filters)}`;
      }

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        let filtered = data.prospects || [];

        if (activeTab === 'completed') {
          filtered = filtered.filter((p: Prospect) => p.status === 'email_sent' || p.outcome_tag !== null);
        } else if (activeTab === 'approved') {
          filtered = filtered.filter((p: Prospect) => p.status !== 'email_sent' && p.outcome_tag === null);
        }

        // Contact filter
        if (filters.has_contact === 'true') {
          filtered = filtered.filter((p: Prospect) => Number(p.contact_count) > 0);
        } else if (filters.has_contact === 'false') {
          filtered = filtered.filter((p: Prospect) => Number(p.contact_count) === 0);
        }

        setProspects(filtered);
      }
    } catch (error) {
      console.error('Error fetching prospects:', error);
    }
    setLoading(false);
  }, [activeTab, filters]);

  const fetchCounts = useCallback(async () => {
    try {
      const [pendingRes, approvedRes] = await Promise.all([
        fetch(`${API_BASE}/prospects?opportunity_type=broken_link&approval_status=pending`),
        fetch(`${API_BASE}/prospects?opportunity_type=broken_link&approval_status=approved`),
      ]);

      const pendingData = pendingRes.ok ? await pendingRes.json() : { prospects: [] };
      const approvedData = approvedRes.ok ? await approvedRes.json() : { prospects: [] };

      const approvedProspects = approvedData.prospects || [];
      const completed = approvedProspects.filter((p: Prospect) => p.status === 'email_sent' || p.outcome_tag !== null).length;
      const approved = approvedProspects.filter((p: Prospect) => p.status !== 'email_sent' && p.outcome_tag === null).length;

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
      const isSpecificUrls = params.mode === 'specific_urls';
      const endpoint = isSpecificUrls
        ? `${API_BASE}/data-fetch/backlinks-to-url`
        : `${API_BASE}/data-fetch/broken-links`;

      const body = isSpecificUrls
        ? {
            brokenUrls: params.brokenUrls,
            limit: params.limit,
            minDA: params.minDA,
            maxDA: params.maxDA,
            dofollow: params.dofollow,
          }
        : {
            limit: params.limit,
            minDA: params.minDA,
            maxDA: params.maxDA,
            competitors: params.competitors,
            dofollow: params.dofollow,
          };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (res.ok) {
        let message: string;
        if (isSpecificUrls) {
          const urlStatuses = data.url_statuses || [];
          const brokenCount = urlStatuses.filter((u: any) => u.isBroken).length;
          message = `Checked ${urlStatuses.length} URLs (${brokenCount} confirmed broken), found ${data.total_found || 0} pages linking to them, ${data.inserted || 0} new prospects added`;
        } else {
          message = `Found ${data.total_found || 0} broken links from ${data.competitors_checked || 0} competitors, ${data.inserted || 0} new ones added`;
        }
        setFetchResult({ success: true, message });
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
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Broken Links</h1>
              <p className="text-gray-500">Sites with broken outbound links - offer SYB research as replacement</p>
            </div>
          </div>
          <button
            onClick={() => setShowFetchModal(true)}
            disabled={fetching}
            className="btn btn-primary flex items-center gap-2"
            title="Configure and fetch from DataForSEO API"
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

      {/* Info Banner */}
      {counts.pending === 0 && counts.approved === 0 && counts.completed === 0 && !fetchResult && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-orange-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="font-medium text-orange-800">No Broken Link Prospects Yet</h3>
              <p className="text-sm text-orange-700 mt-1">
                Click &quot;Fetch Fresh Data&quot; above to find sites linking to EMF competitors with broken links via the DataForSEO API.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-4">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setSelectedProspect(null);
                setCheckedIds(new Set());
                setFilters(defaultFilters);
              }}
              className={`
                whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm
                ${activeTab === tab.id
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              {tab.label}
              <span className={`ml-2 py-0.5 px-2 rounded-full text-xs ${
                activeTab === tab.id ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-600'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* Filter Bar */}
      <ProspectFilterBar
        filters={filters}
        onChange={setFilters}
        accentColor="orange"
        resultCount={prospects.length}
      />

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
                  No {activeTab} broken link prospects
                </div>
              ) : (
                prospects.map((prospect) => (
                  <div
                    key={prospect.id}
                    onClick={() => setSelectedProspect(prospect)}
                    className={`
                      p-3 rounded-lg border cursor-pointer transition-colors
                      ${selectedProspect?.id === prospect.id
                        ? 'bg-orange-50 border-orange-200'
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
                        {/* Row 1: Domain + DA/PA badges */}
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-gray-900 truncate">{prospect.domain}</span>
                          <div className="flex gap-1.5 flex-shrink-0 ml-2">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 font-medium">
                              DA {prospect.domain_authority ?? '-'}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-medium">
                              PA {prospect.page_authority ?? '-'}
                            </span>
                          </div>
                        </div>

                        {/* Row 2: Page title (the referring article) */}
                        {prospect.title && (
                          <div className="text-sm text-gray-700 mt-1 truncate" title={prospect.title}>
                            {prospect.title}
                          </div>
                        )}

                        {/* Row 3: Anchor text from outbound_link_context */}
                        {prospect.outbound_link_context && (
                          <div className="text-sm text-gray-500 mt-1 truncate">
                            Anchor: &quot;{prospect.outbound_link_context}&quot;
                          </div>
                        )}

                        {/* Row 4: Broken URL + status code */}
                        {prospect.broken_url && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-xs text-red-600 truncate" title={prospect.broken_url}>
                              {prospect.broken_url}
                            </span>
                            {prospect.broken_url_status_code != null && prospect.broken_url_status_code > 0 && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-mono flex-shrink-0">
                                {prospect.broken_url_status_code}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Row 5: Contact count + suggested replacement + score */}
                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-2">
                          <span>{prospect.contact_count} contact{prospect.contact_count !== 1 ? 's' : ''}</span>
                          {prospect.suggested_article_title && (
                            <span className="text-green-600 truncate" title={prospect.suggested_article_title}>
                              {prospect.suggested_article_title}
                            </span>
                          )}
                          {prospect.quality_score != null && (
                            <span className="ml-auto flex-shrink-0">Score: {prospect.quality_score}</span>
                          )}
                          {prospect.outcome_tag && (
                            <span className={`px-2 py-0.5 rounded-full flex-shrink-0 ${
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Prospect</h3>
              <p className="text-gray-500">
                Click on a broken link prospect to view details and compose outreach
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
        type="broken_link"
        onFetch={handleFetchFreshData}
      />
    </div>
  );
}
