'use client';

import { useState, useEffect } from 'react';

interface DeletedProspect {
  id: string;
  url: string;
  domain: string;
  title: string;
  opportunity_type: string;
  deleted_at: string;
  deleted_reason: string | null;
  quality_score: number;
  filter_status: string;
}

export default function TrashPage() {
  const [prospects, setProspects] = useState<DeletedProspect[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchTrash();
  }, []);

  const fetchTrash = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/prospects/trash?limit=100');
      const data = await response.json();
      setProspects(data.prospects || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('Failed to fetch trash:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (id: string) => {
    if (!confirm('Restore this prospect from trash?')) return;

    try {
      const response = await fetch(`/api/v1/prospects/${id}/restore`, {
        method: 'POST',
      });

      if (response.ok) {
        alert('✅ Prospect restored successfully!');
        fetchTrash();
        setSelected(new Set());
      } else {
        alert('❌ Failed to restore prospect');
      }
    } catch (error) {
      alert('❌ Error: ' + error);
    }
  };

  const handleBulkRestore = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Restore ${selected.size} prospects from trash?`)) return;

    try {
      const response = await fetch('/api/v1/prospects/bulk-restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });

      if (response.ok) {
        alert(`✅ ${selected.size} prospects restored!`);
        fetchTrash();
        setSelected(new Set());
      } else {
        alert('❌ Failed to restore prospects');
      }
    } catch (error) {
      alert('❌ Error: ' + error);
    }
  };

  const handlePermanentDelete = async (id: string) => {
    if (!confirm('⚠️ PERMANENT DELETE: This will permanently delete this prospect. This action CANNOT be undone. Are you sure?')) {
      return;
    }

    if (!confirm('⚠️ FINAL WARNING: This prospect will be PERMANENTLY deleted from the database. Continue?')) {
      return;
    }

    try {
      const response = await fetch(`/api/v1/prospects/${id}/permanent`, {
        method: 'DELETE',
      });

      if (response.ok) {
        alert('✅ Prospect permanently deleted');
        fetchTrash();
        setSelected(new Set());
      } else {
        alert('❌ Failed to permanently delete');
      }
    } catch (error) {
      alert('❌ Error: ' + error);
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelected(newSelected);
  };

  const toggleSelectAll = () => {
    if (selected.size === prospects.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(prospects.map(p => p.id)));
    }
  };

  const getDaysInTrash = (deletedAt: string) => {
    const days = Math.floor((new Date().getTime() - new Date(deletedAt).getTime()) / (1000 * 60 * 60 * 24));
    const remaining = 90 - days;
    return { days, remaining };
  };

  if (loading) {
    return <div className="text-center py-12">Loading trash...</div>;
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Trash</h1>
            <p className="text-gray-500">Deleted prospects (recoverable for 90 days)</p>
          </div>
          {selected.size > 0 && (
            <button
              onClick={handleBulkRestore}
              className="btn btn-primary"
            >
              Restore {selected.size} Selected
            </button>
          )}
        </div>

        {/* Info Banner */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🗑️</span>
            <div>
              <div className="font-medium text-yellow-900">
                {total} prospects in trash
              </div>
              <div className="text-sm text-yellow-700 mt-1">
                Deleted prospects are kept for 90 days before permanent deletion.
                You can restore them at any time during this period.
              </div>
            </div>
          </div>
        </div>
      </div>

      {prospects.length === 0 ? (
        <div className="card text-center py-12">
          <span className="text-6xl mb-4 block">🎉</span>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Trash is empty</h3>
          <p className="text-gray-500">No deleted prospects</p>
        </div>
      ) : (
        <div className="card">
          {/* Bulk Actions */}
          <div className="mb-4 flex items-center gap-4 pb-4 border-b border-gray-200">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selected.size === prospects.length && prospects.length > 0}
                onChange={toggleSelectAll}
                className="rounded"
              />
              <span className="text-sm text-gray-600">Select All</span>
            </label>
            {selected.size > 0 && (
              <span className="text-sm text-gray-500">
                {selected.size} selected
              </span>
            )}
          </div>

          {/* Deleted Prospects List */}
          <div className="space-y-3">
            {prospects.map((prospect) => {
              const { days, remaining } = getDaysInTrash(prospect.deleted_at);

              return (
                <div
                  key={prospect.id}
                  className="flex items-start gap-4 p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(prospect.id)}
                    onChange={() => toggleSelect(prospect.id)}
                    className="mt-1 rounded"
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 truncate">
                          {prospect.title || prospect.domain}
                        </h3>
                        <p className="text-sm text-gray-500 truncate">{prospect.url}</p>
                      </div>
                      <div className="flex gap-2">
                        <span className="badge badge-secondary text-xs">
                          {prospect.opportunity_type}
                        </span>
                        <span className="badge badge-secondary text-xs">
                          Score: {prospect.quality_score}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>🗑️ Deleted {days} days ago</span>
                      {remaining > 0 ? (
                        <span className="text-yellow-600 font-medium">
                          ⏳ {remaining} days until permanent deletion
                        </span>
                      ) : (
                        <span className="text-red-600 font-medium">
                          ⚠️ Ready for permanent deletion
                        </span>
                      )}
                      {prospect.deleted_reason && (
                        <span>Reason: {prospect.deleted_reason}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRestore(prospect.id)}
                      className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => handlePermanentDelete(prospect.id)}
                      className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                      title="Permanent delete (cannot be undone)"
                    >
                      Delete Forever
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Auto-cleanup Notice */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="text-xs text-gray-500 flex items-center gap-2">
              <span>ℹ️</span>
              <span>
                Prospects in trash for 90+ days are automatically deleted at 2:00 AM daily
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
