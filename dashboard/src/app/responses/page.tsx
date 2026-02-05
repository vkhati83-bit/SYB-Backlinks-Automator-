'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

interface Response {
  id: string;
  subject: string;
  body: string;
  from_email: string;
  from_name: string | null;
  classification: string | null;
  sentiment: string | null;
  confidence: number | null;
  suggested_action: string | null;
  summary: string | null;
  original_email: {
    subject: string;
    prospect_domain: string;
  };
  received_at: string;
  handled: boolean;
}

const classificationColors: Record<string, string> = {
  positive: 'badge-success',
  negotiating: 'badge-warning',
  question: 'badge-primary',
  declined: 'badge-secondary',
  negative: 'badge-danger',
  auto_reply: 'badge-secondary',
  bounce: 'badge-danger',
  unrelated: 'badge-secondary',
};

const classificationLabels: Record<string, string> = {
  positive: 'Positive',
  negotiating: 'Negotiating',
  question: 'Has Question',
  declined: 'Declined',
  negative: 'Negative',
  auto_reply: 'Auto-Reply',
  bounce: 'Bounce',
  unrelated: 'Unrelated',
};

export default function ResponsesPage() {
  const [responses, setResponses] = useState<Response[]>([]);
  const [selectedResponse, setSelectedResponse] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [unhandledCount, setUnhandledCount] = useState(0);
  const [filter, setFilter] = useState({
    classification: 'all',
    handled: 'all',
  });

  useEffect(() => {
    fetchResponses();
  }, [filter]);

  const fetchResponses = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.classification !== 'all') {
        params.set('classification', filter.classification);
      }
      if (filter.handled !== 'all') {
        params.set('handled', filter.handled);
      }

      const res = await fetch(`${API_BASE}/responses?${params}`);
      if (res.ok) {
        const data = await res.json();
        setResponses(data.responses || []);
        setUnhandledCount(data.unhandled || 0);
      }
    } catch (error) {
      console.error('Error fetching responses:', error);
    }
    setLoading(false);
  };

  const handleMarkHandled = async (responseId: string) => {
    try {
      const res = await fetch(`${API_BASE}/responses/${responseId}/mark-handled`, {
        method: 'POST',
      });

      if (res.ok) {
        setResponses(responses.map(r =>
          r.id === responseId ? { ...r, handled: true } : r
        ));
        if (selectedResponse?.id === responseId) {
          setSelectedResponse({ ...selectedResponse, handled: true });
        }
        setUnhandledCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Error marking as handled:', error);
    }
  };

  if (loading) {
    return (
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Responses</h1>
          <p className="text-gray-500">Loading...</p>
        </div>
        <div className="text-center py-12 text-gray-500">Loading responses...</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Responses</h1>
        <p className="text-gray-500">
          {unhandledCount > 0
            ? `${unhandledCount} responses need attention`
            : 'All responses handled'}
        </p>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex gap-4">
          <div>
            <label className="label">Classification</label>
            <select
              value={filter.classification}
              onChange={(e) => setFilter({ ...filter, classification: e.target.value })}
              className="input w-40"
            >
              <option value="all">All</option>
              <option value="positive">Positive</option>
              <option value="negotiating">Negotiating</option>
              <option value="question">Has Question</option>
              <option value="declined">Declined</option>
              <option value="negative">Negative</option>
              <option value="auto_reply">Auto-Reply</option>
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select
              value={filter.handled}
              onChange={(e) => setFilter({ ...filter, handled: e.target.value })}
              className="input w-40"
            >
              <option value="all">All</option>
              <option value="false">Needs Attention</option>
              <option value="true">Handled</option>
            </select>
          </div>
        </div>
      </div>

      {/* No Responses State */}
      {responses.length === 0 && !loading && (
        <div className="card text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Responses Yet</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            Responses to your outreach emails will appear here. Start sending emails to prospects to receive responses.
          </p>
        </div>
      )}

      {responses.length > 0 && (
        <div className="grid grid-cols-12 gap-6">
          {/* Response List */}
          <div className="col-span-4">
            <div className="card p-0 divide-y divide-gray-100">
              {responses.map((response) => (
                <button
                  key={response.id}
                  onClick={() => setSelectedResponse(response)}
                  className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${
                    selectedResponse?.id === response.id ? 'bg-primary-50 border-l-4 border-primary-500' : ''
                  } ${!response.handled ? 'bg-yellow-50' : ''}`}
                >
                  <div className="flex justify-between items-start">
                    <div className="font-medium text-gray-900 truncate">
                      {response.from_name || response.from_email}
                    </div>
                    {response.classification && (
                      <span className={`badge text-xs ${classificationColors[response.classification]}`}>
                        {classificationLabels[response.classification]}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 truncate mt-1">
                    {response.original_email?.prospect_domain || 'Unknown domain'}
                  </div>
                  <div className="text-sm text-gray-400 truncate mt-1">
                    {response.subject}
                  </div>
                  {!response.handled && (
                    <div className="mt-2">
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">
                        Needs Attention
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Response Detail */}
          <div className="col-span-8">
            {selectedResponse ? (
              <div className="card">
                {/* Header */}
                <div className="mb-6 pb-6 border-b border-gray-200">
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-lg font-medium text-gray-900">
                        {selectedResponse.from_name || selectedResponse.from_email}
                      </h2>
                      <div className="text-sm text-gray-500">{selectedResponse.from_email}</div>
                    </div>
                    {selectedResponse.classification && (
                      <span className={`badge ${classificationColors[selectedResponse.classification]}`}>
                        {classificationLabels[selectedResponse.classification]}
                      </span>
                    )}
                  </div>

                  {/* AI Analysis */}
                  {selectedResponse.summary && (
                    <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                      <div className="text-xs text-blue-600 font-medium mb-1">AI Analysis</div>
                      <div className="text-sm text-blue-900">{selectedResponse.summary}</div>
                      {selectedResponse.suggested_action && (
                        <div className="text-sm text-blue-700 mt-2">
                          <span className="font-medium">Suggested:</span> {selectedResponse.suggested_action}
                        </div>
                      )}
                      {selectedResponse.confidence && (
                        <div className="text-xs text-blue-500 mt-1">
                          Confidence: {(selectedResponse.confidence * 100).toFixed(0)}%
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Original Email Context */}
                {selectedResponse.original_email && (
                  <div className="mb-4">
                    <div className="text-xs text-gray-500 mb-1">In Reply To:</div>
                    <div className="text-sm text-gray-600">
                      {selectedResponse.original_email.subject}
                    </div>
                  </div>
                )}

                {/* Response Subject */}
                <div className="mb-4">
                  <div className="text-xs text-gray-500 mb-1">Subject</div>
                  <div className="font-medium text-gray-900">{selectedResponse.subject}</div>
                </div>

                {/* Response Body */}
                <div className="mb-6">
                  <div className="text-xs text-gray-500 mb-1">Message</div>
                  <div className="bg-gray-50 rounded-lg p-4 whitespace-pre-wrap font-mono text-sm">
                    {selectedResponse.body}
                  </div>
                </div>

                {/* Timestamp */}
                <div className="text-sm text-gray-400 mb-6">
                  Received: {format(new Date(selectedResponse.received_at), 'MMM d, yyyy h:mm a')}
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  {!selectedResponse.handled && (
                    <button
                      onClick={() => handleMarkHandled(selectedResponse.id)}
                      className="btn btn-success flex-1"
                    >
                      Mark as Handled
                    </button>
                  )}
                  <button className="btn btn-primary">
                    Reply
                  </button>
                  <button className="btn btn-secondary">
                    View Thread
                  </button>
                </div>
              </div>
            ) : (
              <div className="card text-center py-12 text-gray-500">
                Select a response to view details
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
