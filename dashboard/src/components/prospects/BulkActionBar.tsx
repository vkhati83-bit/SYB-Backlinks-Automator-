'use client';

interface BulkActionBarProps {
  selectedCount: number;
  onApprove: () => void;
  onReject: () => void;
  onClear: () => void;
  isLoading?: boolean;
  activeTab: 'new' | 'pending' | 'approved' | 'completed';
}

export default function BulkActionBar({
  selectedCount,
  onApprove,
  onReject,
  onClear,
  isLoading = false,
  activeTab,
}: BulkActionBarProps) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
      <div className="bg-gray-900 text-white rounded-lg shadow-lg px-6 py-3 flex items-center gap-4">
        <span className="text-sm">
          <span className="font-bold">{selectedCount}</span> selected
        </span>
        <div className="h-4 w-px bg-gray-600" />

        {activeTab === 'pending' && (
          <>
            <button
              onClick={onApprove}
              disabled={isLoading}
              className="px-4 py-1.5 bg-green-600 hover:bg-green-700 rounded text-sm font-medium disabled:opacity-50"
            >
              Approve
            </button>
            <button
              onClick={onReject}
              disabled={isLoading}
              className="px-4 py-1.5 bg-red-600 hover:bg-red-700 rounded text-sm font-medium disabled:opacity-50"
            >
              Reject
            </button>
          </>
        )}

        {activeTab === 'approved' && (
          <span className="text-sm text-gray-300">
            Select prospects to manage
          </span>
        )}

        {activeTab === 'completed' && (
          <span className="text-sm text-gray-300">
            View completed prospects
          </span>
        )}

        <button
          onClick={onClear}
          className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
