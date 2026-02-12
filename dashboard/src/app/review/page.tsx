'use client';

import { useState, useEffect } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

interface Email {
  id: string;
  subject: string;
  body: string;
  edited_subject: string | null;
  edited_body: string | null;
  status: string;
  prospect: {
    url: string;
    domain: string;
    domain_authority: number | null;
    quality_score: number | null;
    opportunity_type: string;
  };
  contact: {
    email: string;
    name: string | null;
    confidence_tier: string;
  };
  created_at: string;
}

export default function ReviewQueue() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedSubject, setEditedSubject] = useState('');
  const [editedBody, setEditedBody] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchEmails();
  }, []);

  const fetchEmails = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/emails?status=pending_review`);
      if (res.ok) {
        const data = await res.json();
        setEmails(data.emails || []);
      }
    } catch (error) {
      console.error('Error fetching emails:', error);
    }
    setLoading(false);
  };

  const handleApprove = async (emailId: string) => {
    setActionLoading(true);
    try {
      const body: Record<string, string> = {};
      if (editMode && editedSubject !== selectedEmail?.subject) {
        body.edited_subject = editedSubject;
      }
      if (editMode && editedBody !== selectedEmail?.body) {
        body.edited_body = editedBody;
      }

      const res = await fetch(`${API_BASE}/emails/${emailId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setEmails(emails.filter(e => e.id !== emailId));
        setSelectedEmail(null);
        setEditMode(false);
      }
    } catch (error) {
      console.error('Error approving email:', error);
    }
    setActionLoading(false);
  };

  const handleReject = async (emailId: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/emails/${emailId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason }),
      });

      if (res.ok) {
        setEmails(emails.filter(e => e.id !== emailId));
        setSelectedEmail(null);
        setShowRejectModal(false);
        setRejectReason('');
      }
    } catch (error) {
      console.error('Error rejecting email:', error);
    }
    setActionLoading(false);
  };

  const selectEmail = (email: Email) => {
    setSelectedEmail(email);
    setEditedSubject(email.edited_subject || email.subject);
    setEditedBody(email.edited_body || email.body);
    setEditMode(false);
  };

  if (loading) {
    return (
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Review Queue</h1>
          <p className="text-gray-500">Loading...</p>
        </div>
        <div className="text-center py-12 text-gray-500">Loading emails...</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Review Queue</h1>
        <p className="text-gray-500">
          {emails.length > 0
            ? `${emails.length} email${emails.length !== 1 ? 's' : ''} pending review`
            : 'All emails reviewed'}
        </p>
      </div>

      {/* Empty State */}
      {emails.length === 0 && (
        <div className="card text-center py-12">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Queue Empty</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            No emails pending review. Compose emails from the Research Citations or Broken Links pages to populate this queue.
          </p>
        </div>
      )}

      {emails.length > 0 && (
        <div className="grid grid-cols-12 gap-6">
          {/* Email List */}
          <div className="col-span-4">
            <div className="card p-0 divide-y divide-gray-100">
              {emails.map((email) => (
                <button
                  key={email.id}
                  onClick={() => selectEmail(email)}
                  className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${
                    selectedEmail?.id === email.id ? 'bg-primary-50 border-l-4 border-primary-500' : ''
                  }`}
                >
                  <div className="font-medium text-gray-900 truncate">
                    {email.prospect.domain}
                  </div>
                  <div className="text-sm text-gray-500 truncate mt-1">
                    {email.subject}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`badge ${
                      email.prospect.opportunity_type === 'broken_link'
                        ? 'badge-warning'
                        : 'badge-primary'
                    }`}>
                      {email.prospect.opportunity_type === 'broken_link' ? 'Broken Link' : 'Research'}
                    </span>
                    {email.prospect.domain_authority && (
                      <span className="text-xs text-gray-400">
                        DA: {email.prospect.domain_authority}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Email Preview */}
          <div className="col-span-8">
            {selectedEmail ? (
              <div className="card">
                {/* Prospect Info */}
                <div className="mb-6 pb-6 border-b border-gray-200">
                  <div className="flex justify-between items-start">
                    <div>
                      <a
                        href={selectedEmail.prospect.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-lg font-medium text-primary-600 hover:underline"
                      >
                        {selectedEmail.prospect.domain}
                      </a>
                      <div className="text-sm text-gray-500 mt-1">
                        {selectedEmail.prospect.url}
                      </div>
                    </div>
                    <div className="text-right">
                      {selectedEmail.prospect.quality_score && (
                        <div className="text-2xl font-bold text-primary-600">
                          {selectedEmail.prospect.quality_score.toFixed(0)}
                        </div>
                      )}
                      <div className="text-xs text-gray-500">Quality Score</div>
                    </div>
                  </div>
                  <div className="flex gap-4 mt-4">
                    <div>
                      <span className="text-xs text-gray-500">Domain Authority</span>
                      <div className="font-medium">{selectedEmail.prospect.domain_authority || 'N/A'}</div>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Contact</span>
                      <div className="font-medium">
                        {selectedEmail.contact.name || selectedEmail.contact.email}
                      </div>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Confidence</span>
                      <div className="font-medium">Tier {selectedEmail.contact.confidence_tier}</div>
                    </div>
                  </div>
                </div>

                {/* Email Content */}
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-2">
                    <label className="label">Subject</label>
                    {!editMode && (
                      <button
                        onClick={() => setEditMode(true)}
                        className="text-sm text-primary-600 hover:underline"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  {editMode ? (
                    <input
                      type="text"
                      value={editedSubject}
                      onChange={(e) => setEditedSubject(e.target.value)}
                      className="input w-full"
                    />
                  ) : (
                    <div className="font-medium text-gray-900">{selectedEmail.subject}</div>
                  )}
                </div>

                <div className="mb-6">
                  <label className="label">Body</label>
                  {editMode ? (
                    <textarea
                      value={editedBody}
                      onChange={(e) => setEditedBody(e.target.value)}
                      className="input w-full h-64 font-mono text-sm"
                    />
                  ) : (
                    <div className="bg-gray-50 rounded-lg p-4 whitespace-pre-wrap font-mono text-sm">
                      {selectedEmail.body}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={() => handleApprove(selectedEmail.id)}
                    disabled={actionLoading}
                    className="btn btn-success flex-1"
                  >
                    {actionLoading ? 'Processing...' : `Approve & Send${editMode ? ' (with edits)' : ''}`}
                  </button>
                  <button
                    onClick={() => setShowRejectModal(true)}
                    disabled={actionLoading}
                    className="btn btn-danger"
                  >
                    Reject
                  </button>
                  {editMode && (
                    <button
                      onClick={() => {
                        setEditMode(false);
                        setEditedSubject(selectedEmail.subject);
                        setEditedBody(selectedEmail.body);
                      }}
                      className="btn btn-secondary"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="card text-center py-12 text-gray-500">
                Select an email to preview
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedEmail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Reject Email</h3>
            <p className="text-gray-600 mb-4">
              Please provide a reason for rejection. This helps improve AI generation.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g., Tone too salesy, factual error, wrong contact..."
              className="input w-full h-24 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => handleReject(selectedEmail.id)}
                className="btn btn-danger flex-1"
                disabled={!rejectReason.trim() || actionLoading}
              >
                {actionLoading ? 'Rejecting...' : 'Reject'}
              </button>
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectReason('');
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
