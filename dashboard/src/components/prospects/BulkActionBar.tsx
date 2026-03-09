'use client';

interface BulkActionBarProps {
  selectedCount: number;
  onApprove: () => void;
  onReject: () => void;
  onClear: () => void;
  onGenerateEmails?: () => void;
  isLoading?: boolean;
  activeTab: 'new' | 'pending' | 'approved' | 'completed';
}

export default function BulkActionBar({
  selectedCount,
  onApprove,
  onReject,
  onClear,
  onGenerateEmails,
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

        {activeTab === 'approved' && onGenerateEmails && (
          <button
            onClick={onGenerateEmails}
            disabled={isLoading}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium disabled:opacity-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Generate Emails
          </button>
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
