'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ProspectTabs,
  ProspectSection,
  ProspectDetail,
  BulkActionBar,
  KeywordConfig,
} from '../../components/prospects';
import ProspectFilterBar, { ProspectFilters, defaultFilters, filtersToQueryString } from '../../components/ProspectFilterBar';
import type { Prospect } from '../../lib/types';

interface GroupedProspects {
  broken_link: Prospect[];
  research_citation: Prospect[];
  guest_post: Prospect[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

export default function ProspectsPage() {
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'completed'>('pending');
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [newContact, setNewContact] = useState({ email: '', name: '', role: '' });
  const [filters, setFilters] = useState<ProspectFilters>(defaultFilters);

  const [counts, setCounts] = useState({
    pending: 0,
    approved: 0,
    completed: 0,
  });

  const fetchProspects = useCallback(async () => {
    setLoading(true);
    try {
      let url: string;
      if (activeTab === 'pending') {
        url = `${API_BASE}/prospects?approval_status=pending${filtersToQueryString(filters)}`;
      } else if (activeTab === 'completed') {
        url = `${API_BASE}/prospects?approval_status=approved${filtersToQueryString(filters)}`;
      } else {
        url = `${API_BASE}/prospects?approval_status=${activeTab}${filtersToQueryString(filters)}`;
      }

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        let list = data.prospects || [];

        if (activeTab === 'completed') {
          list = list.filter((p: Prospect) => p.outcome_tag !== null);
        } else if (activeTab === 'approved') {
          list = list.filter((p: Prospect) => p.outcome_tag === null);
        }

        setProspects(list);
      }
    } catch (error) {
      console.error('Error fetching prospects:', error);
    }
    setLoading(false);
  }, [activeTab, filters]);

  // Group prospects by opportunity_type for the pending tab display
  const groupedProspects: GroupedProspects = {
    broken_link: prospects.filter(p => p.opportunity_type === 'broken_link'),
    research_citation: prospects.filter(p => p.opportunity_type === 'research_citation'),
    guest_post: prospects.filter(p => p.opportunity_type === 'guest_post'),
  };

  // Fetch counts for all tabs
  const fetchCounts = useCallback(async () => {
    try {
      const [pendingRes, approvedRes] = await Promise.all([
        fetch(`${API_BASE}/prospects?approval_status=pending&limit=1`),
        fetch(`${API_BASE}/prospects?approval_status=approved&limit=1`),
      ]);

      const pendingData = pendingRes.ok ? await pendingRes.json() : { total: 0, prospects: [] };
      const approvedData = approvedRes.ok ? await approvedRes.json() : { total: 0, prospects: [] };

      // We need full approved list to split approved/completed counts
      const approvedFullRes = await fetch(`${API_BASE}/prospects?approval_status=approved`);
      const approvedFullData = approvedFullRes.ok ? await approvedFullRes.json() : { prospects: [] };
      const approvedAll = approvedFullData.prospects || [];
      const completedCount = approvedAll.filter((p: Prospect) => p.outcome_tag !== null).length;
      const approvedCount = approvedAll.filter((p: Prospect) => p.outcome_tag === null).length;

      setCounts({
        pending: pendingData.total || 0,
        approved: approvedCount,
        completed: completedCount,
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

  const handleTabChange = (tab: 'pending' | 'approved' | 'completed') => {
    setActiveTab(tab);
    setSelectedProspect(null);
    setCheckedIds(new Set());
    setFilters(defaultFilters);
  };

  const handleSelectProspect = (prospect: Prospect) => {
    setSelectedProspect(prospect);
  };

  const handleToggleCheck = (id: string) => {
    const newChecked = new Set(checkedIds);
    if (newChecked.has(id)) {
      newChecked.delete(id);
    } else {
      newChecked.add(id);
    }
    setCheckedIds(newChecked);
  };

  const handleSelectAll = (ids: string[]) => {
    const newChecked = new Set(checkedIds);
    ids.forEach(id => newChecked.add(id));
    setCheckedIds(newChecked);
  };

  const handleClearSelection = () => {
    setCheckedIds(new Set());
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

  const handleAddContact = async () => {
    if (!selectedProspect || !newContact.email) return;

    try {
      const res = await fetch(`${API_BASE}/contacts/${selectedProspect.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newContact.email,
          name: newContact.name || null,
          role: newContact.role || null,
          source: 'manual',
        }),
      });

      if (res.ok) {
        setShowAddContactModal(false);
        setNewContact({ email: '', name: '', role: '' });
        setSelectedProspect({ ...selectedProspect, contact_count: selectedProspect.contact_count + 1 });
      }
    } catch (error) {
      console.error('Error adding contact:', error);
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Prospects CRM</h1>
        <p className="text-gray-500">
          Manage and approve prospects for outreach campaigns
        </p>
      </div>

      {/* Keyword Config (collapsible) */}
      <KeywordConfig />

      {/* Tabs */}
      <div className="mb-4">
        <ProspectTabs
          activeTab={activeTab}
          onTabChange={handleTabChange}
          counts={counts}
        />
      </div>

      {/* Filter Bar */}
      <ProspectFilterBar
        filters={filters}
        onChange={setFilters}
        accentColor="blue"
        resultCount={prospects.length}
      />

      {/* Main Content */}
      <div className="grid grid-cols-12 gap-6">
        {/* Prospect List */}
        <div className="col-span-5">
          <div className="card p-4 max-h-[calc(100vh-320px)] overflow-y-auto">
            {loading ? (
              <div className="text-center py-12 text-gray-500">Loading prospects...</div>
            ) : activeTab === 'pending' ? (
              // Grouped sections for pending
              <>
                <ProspectSection
                  title="Broken Links"
                  prospects={groupedProspects.broken_link}
                  selectedId={selectedProspect?.id || null}
                  checkedIds={checkedIds}
                  onSelect={handleSelectProspect}
                  onToggleCheck={handleToggleCheck}
                  onSelectAll={handleSelectAll}
                />
                <ProspectSection
                  title="Research Citations"
                  prospects={groupedProspects.research_citation}
                  selectedId={selectedProspect?.id || null}
                  checkedIds={checkedIds}
                  onSelect={handleSelectProspect}
                  onToggleCheck={handleToggleCheck}
                  onSelectAll={handleSelectAll}
                />
                <ProspectSection
                  title="Guest Posts"
                  prospects={groupedProspects.guest_post}
                  selectedId={selectedProspect?.id || null}
                  checkedIds={checkedIds}
                  onSelect={handleSelectProspect}
                  onToggleCheck={handleToggleCheck}
                  onSelectAll={handleSelectAll}
                />
                {prospects.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    No pending prospects
                  </div>
                )}
              </>
            ) : (
              // Flat list for approved/completed
              <div className="space-y-2">
                {prospects.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    No {activeTab} prospects
                  </div>
                ) : (
                  prospects.map((prospect) => (
                    <div
                      key={prospect.id}
                      onClick={() => handleSelectProspect(prospect)}
                      className={`
                        p-3 rounded-lg border cursor-pointer transition-colors
                        ${selectedProspect?.id === prospect.id
                          ? 'bg-primary-50 border-primary-200'
                          : 'bg-white border-gray-200 hover:bg-gray-50'
                        }
                      `}
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-medium text-gray-900">{prospect.domain}</span>
                        {prospect.outcome_tag && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            prospect.outcome_tag === 'partner'
                              ? 'bg-green-100 text-green-800'
                              : prospect.outcome_tag === 'not_interested'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {prospect.outcome_tag.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                      {prospect.title && (
                        <div className="text-sm text-gray-600 truncate">{prospect.title}</div>
                      )}
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                        <span>DA: {prospect.domain_authority || '-'}</span>
                        <span>Score: {prospect.quality_score || '-'}</span>
                        <span>{prospect.contact_count} contacts</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Detail Panel */}
        <div className="col-span-7">
          {selectedProspect ? (
            <ProspectDetail
              prospect={selectedProspect}
              onUpdate={handleUpdateProspect}
              onShowAddContact={() => setShowAddContactModal(true)}
            />
          ) : (
            <div className="card text-center py-12 text-gray-500">
              Select a prospect to view details
            </div>
          )}
        </div>
      </div>

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedCount={checkedIds.size}
        onApprove={() => handleBulkAction('approve')}
        onReject={() => handleBulkAction('reject')}
        onClear={handleClearSelection}
        isLoading={bulkLoading}
        activeTab={activeTab}
      />

      {/* Add Contact Modal */}
      {showAddContactModal && selectedProspect && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              Add Contact for {selectedProspect.domain}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="label">Email Address *</label>
                <input
                  type="email"
                  value={newContact.email}
                  onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                  className="input w-full"
                  placeholder="contact@example.com"
                />
              </div>
              <div>
                <label className="label">Name</label>
                <input
                  type="text"
                  value={newContact.name}
                  onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                  className="input w-full"
                  placeholder="John Smith"
                />
              </div>
              <div>
                <label className="label">Role/Title</label>
                <input
                  type="text"
                  value={newContact.role}
                  onChange={(e) => setNewContact({ ...newContact, role: e.target.value })}
                  className="input w-full"
                  placeholder="Editor, Content Manager, etc."
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleAddContact}
                className="btn btn-primary flex-1"
                disabled={!newContact.email}
              >
                Add Contact
              </button>
              <button
                onClick={() => {
                  setShowAddContactModal(false);
                  setNewContact({ email: '', name: '', role: '' });
                }}
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
