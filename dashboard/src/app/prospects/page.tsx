'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ProspectTabs,
  ProspectSection,
  ProspectDetail,
  BulkActionBar,
  KeywordConfig,
} from '../../components/prospects';
import type { Prospect } from '../../lib/types';

interface GroupedProspects {
  broken_link: Prospect[];
  research_citation: Prospect[];
  guest_post: Prospect[];
}

interface Contact {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  confidence_tier: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

export default function ProspectsPage() {
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'completed'>('pending');
  const [groupedProspects, setGroupedProspects] = useState<GroupedProspects>({
    broken_link: [],
    research_citation: [],
    guest_post: [],
  });
  const [approvedProspects, setApprovedProspects] = useState<Prospect[]>([]);
  const [completedProspects, setCompletedProspects] = useState<Prospect[]>([]);
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [newContact, setNewContact] = useState({ email: '', name: '', role: '' });
  const [displayLimit, setDisplayLimit] = useState(1000); // Show all by default

  const [counts, setCounts] = useState({
    pending: 0,
    approved: 0,
    completed: 0,
  });

  const fetchProspects = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'pending') {
        const res = await fetch(`${API_BASE}/prospects/grouped?approval_status=pending`);
        if (res.ok) {
          const data = await res.json();
          console.log('[DEBUG] API Response:', {
            total: data.total,
            broken_link_count: data.broken_link?.length || 0,
            research_citation_count: data.research_citation?.length || 0,
            guest_post_count: data.guest_post?.length || 0,
          });
          setGroupedProspects({
            broken_link: data.broken_link || [],
            research_citation: data.research_citation || [],
            guest_post: data.guest_post || [],
          });
          setCounts(prev => ({
            ...prev,
            pending: data.total || 0,
          }));
        }
      } else if (activeTab === 'approved') {
        const res = await fetch(`${API_BASE}/prospects/approved`);
        if (res.ok) {
          const data = await res.json();
          setApprovedProspects(data.prospects || []);
          setCounts(prev => ({
            ...prev,
            approved: data.total || 0,
          }));
        }
      } else if (activeTab === 'completed') {
        const res = await fetch(`${API_BASE}/prospects/completed`);
        if (res.ok) {
          const data = await res.json();
          setCompletedProspects(data.prospects || []);
          setCounts(prev => ({
            ...prev,
            completed: data.total || 0,
          }));
        }
      }
    } catch (error) {
      console.error('Error fetching prospects:', error);
    }
    setLoading(false);
  }, [activeTab]);

  // Fetch counts for all tabs
  const fetchCounts = useCallback(async () => {
    try {
      const [pendingRes, approvedRes, completedRes] = await Promise.all([
        fetch(`${API_BASE}/prospects/grouped?approval_status=pending`),
        fetch(`${API_BASE}/prospects/approved`),
        fetch(`${API_BASE}/prospects/completed`),
      ]);

      const pending = pendingRes.ok ? (await pendingRes.json()).total || 0 : 0;
      const approved = approvedRes.ok ? (await approvedRes.json()).total || 0 : 0;
      const completed = completedRes.ok ? (await completedRes.json()).total || 0 : 0;

      setCounts({ pending, approved, completed });
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
        // Refresh data
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

    // Update in the appropriate list
    if (activeTab === 'pending') {
      setGroupedProspects(prev => ({
        broken_link: prev.broken_link.map(p => p.id === updated.id ? updated : p),
        research_citation: prev.research_citation.map(p => p.id === updated.id ? updated : p),
        guest_post: prev.guest_post.map(p => p.id === updated.id ? updated : p),
      }));
    } else if (activeTab === 'approved') {
      setApprovedProspects(prev => prev.map(p => p.id === updated.id ? updated : p));
    } else if (activeTab === 'completed') {
      setCompletedProspects(prev => prev.map(p => p.id === updated.id ? updated : p));
    }
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
        // Trigger a refresh of the detail panel
        setSelectedProspect({ ...selectedProspect, contact_count: selectedProspect.contact_count + 1 });
      }
    } catch (error) {
      console.error('Error adding contact:', error);
    }
  };

  // Get current prospects based on active tab
  const getCurrentProspects = (): Prospect[] => {
    if (activeTab === 'pending') {
      return [
        ...groupedProspects.broken_link,
        ...groupedProspects.research_citation,
        ...groupedProspects.guest_post,
      ];
    } else if (activeTab === 'approved') {
      return approvedProspects;
    } else {
      return completedProspects;
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
      <div className="mb-6">
        <ProspectTabs
          activeTab={activeTab}
          onTabChange={handleTabChange}
          counts={counts}
        />
      </div>

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
                  prospects={groupedProspects.research_citation.slice(0, displayLimit)}
                  selectedId={selectedProspect?.id || null}
                  checkedIds={checkedIds}
                  onSelect={handleSelectProspect}
                  onToggleCheck={handleToggleCheck}
                  onSelectAll={handleSelectAll}
                />
                {groupedProspects.research_citation.length > displayLimit && (
                  <div className="text-center py-4">
                    <button
                      onClick={() => setDisplayLimit(prev => prev + 100)}
                      className="btn btn-secondary"
                    >
                      Load More ({groupedProspects.research_citation.length - displayLimit} remaining)
                    </button>
                  </div>
                )}
                <ProspectSection
                  title="Guest Posts"
                  prospects={groupedProspects.guest_post}
                  selectedId={selectedProspect?.id || null}
                  checkedIds={checkedIds}
                  onSelect={handleSelectProspect}
                  onToggleCheck={handleToggleCheck}
                  onSelectAll={handleSelectAll}
                />
                {getCurrentProspects().length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    No pending prospects
                  </div>
                )}
              </>
            ) : (
              // Flat list for approved/completed
              <div className="space-y-2">
                {getCurrentProspects().length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    No {activeTab} prospects
                  </div>
                ) : (
                  getCurrentProspects().map((prospect) => (
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
