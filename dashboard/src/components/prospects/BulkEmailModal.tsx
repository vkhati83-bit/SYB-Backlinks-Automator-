'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

interface BulkEmail {
  id: string;
  prospect_id: string;
  contact_id: string;
  subject: string;
  body: string;
  edited_subject: string | null;
  edited_body: string | null;
  status: string;
  domain: string;
  prospect_url: string;
  domain_authority: number | null;
  opportunity_type: string;
  contact_email: string;
  contact_name: string | null;
}

interface SkippedProspect {
  id: string;
  domain: string;
  reason: string;
}

interface BulkEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  prospectIds: string[];
  onComplete: () => void;
}

type ModalPhase = 'generating' | 'reviewing' | 'sending' | 'done';

export default function BulkEmailModal({
  isOpen,
  onClose,
  prospectIds,
  onComplete,
}: BulkEmailModalProps) {
  const [phase, setPhase] = useState<ModalPhase>('generating');
  const [queuedIds, setQueuedIds] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<SkippedProspect[]>([]);
  const [emails, setEmails] = useState<BulkEmail[]>([]);
  const [selectedEmailIds, setSelectedEmailIds] = useState<Set<string>>(new Set());
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState<{ id: string; subject: string; body: string } | null>(null);
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasStartedRef = useRef(false);

  // Start bulk generation when modal opens
  useEffect(() => {
    if (isOpen && prospectIds.length > 0 && !hasStartedRef.current) {
      hasStartedRef.current = true;
      startBulkGeneration();
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isOpen, prospectIds]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      hasStartedRef.current = false;
      setPhase('generating');
      setQueuedIds([]);
      setSkipped([]);
      setEmails([]);
      setSelectedEmailIds(new Set());
      setExpandedEmailId(null);
      setEditingEmail(null);
      setSendResult(null);
      setError(null);
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
  }, [isOpen]);

  const startBulkGeneration = async () => {
    setPhase('generating');
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/emails/bulk-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_ids: prospectIds }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to start generation');
        return;
      }

      const data = await res.json();
      setQueuedIds(data.queued_prospect_ids || []);
      setSkipped(data.skipped_details || []);

      if (data.queued === 0) {
        // Nothing to generate — go straight to review with whatever exists
        await fetchEmails(prospectIds);
        setPhase('reviewing');
        return;
      }

      // Start polling for generated emails
      pollRef.current = setInterval(async () => {
        await fetchEmails(data.queued_prospect_ids);
      }, 2000);

    } catch (err) {
      setError('Failed to connect to server');
    }
  };

  const fetchEmails = useCallback(async (ids: string[]) => {
    try {
      // Include all prospect_ids (queued + potentially already existing)
      const allIds = [...new Set([...ids, ...prospectIds])];
      const res = await fetch(`${API_BASE}/emails/by-prospects?ids=${allIds.join(',')}`);
      if (res.ok) {
        const data = await res.json();
        const fetchedEmails: BulkEmail[] = data.emails || [];
        setEmails(fetchedEmails);

        // Auto-select all pending_review emails
        const pendingIds = new Set(fetchedEmails.filter(e => e.status === 'pending_review').map(e => e.id));
        setSelectedEmailIds(pendingIds);

        // Check if all queued are done
        const generatedProspectIds = new Set(fetchedEmails.map(e => e.prospect_id));
        const allDone = ids.every(id => generatedProspectIds.has(id));

        if (allDone && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setPhase('reviewing');
        }
      }
    } catch (err) {
      // Ignore poll errors
    }
  }, [prospectIds]);

  const handleToggleEmail = (emailId: string) => {
    const next = new Set(selectedEmailIds);
    if (next.has(emailId)) {
      next.delete(emailId);
    } else {
      next.add(emailId);
    }
    setSelectedEmailIds(next);
  };

  const handleSelectAll = () => {
    const pendingEmails = emails.filter(e => e.status === 'pending_review');
    if (selectedEmailIds.size === pendingEmails.length) {
      setSelectedEmailIds(new Set());
    } else {
      setSelectedEmailIds(new Set(pendingEmails.map(e => e.id)));
    }
  };

  const handleSaveEdit = async () => {
    if (!editingEmail) return;
    // Update the local email state with edits
    setEmails(prev => prev.map(e =>
      e.id === editingEmail.id
        ? { ...e, edited_subject: editingEmail.subject, edited_body: editingEmail.body }
        : e
    ));
    setEditingEmail(null);
  };

  const handleBulkSend = async () => {
    const idsToSend = Array.from(selectedEmailIds);
    if (idsToSend.length === 0) return;

    setPhase('sending');
    setError(null);

    try {
      // First, save any edits for selected emails
      for (const emailId of idsToSend) {
        const email = emails.find(e => e.id === emailId);
        if (email && (email.edited_subject || email.edited_body)) {
          await fetch(`${API_BASE}/emails/${emailId}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              edited_subject: email.edited_subject || undefined,
              edited_body: email.edited_body || undefined,
            }),
          });
        }
      }

      // Then bulk send the rest (those without edits)
      const editedIds = new Set(
        emails.filter(e => idsToSend.includes(e.id) && (e.edited_subject || e.edited_body)).map(e => e.id)
      );
      const uneditedIds = idsToSend.filter(id => !editedIds.has(id));

      let totalSent = editedIds.size;
      let totalFailed = 0;

      if (uneditedIds.length > 0) {
        const res = await fetch(`${API_BASE}/emails/bulk-send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email_ids: uneditedIds }),
        });

        if (res.ok) {
          const data = await res.json();
          totalSent += data.sent;
          totalFailed += data.failed;
        } else {
          totalFailed += uneditedIds.length;
        }
      }

      setSendResult({ sent: totalSent, failed: totalFailed });
      setPhase('done');
    } catch (err) {
      setError('Failed to send emails');
      setPhase('reviewing');
    }
  };

  const handleDone = () => {
    onComplete();
    onClose();
  };

  if (!isOpen) return null;

  const pendingEmails = emails.filter(e => e.status === 'pending_review');
  const generatedCount = emails.length;
  const totalQueued = queuedIds.length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex justify-between items-center flex-shrink-0">
          <div>
            <h3 className="text-lg font-semibold">
              {phase === 'generating' && 'Generating Emails...'}
              {phase === 'reviewing' && `Review Emails (${pendingEmails.length})`}
              {phase === 'sending' && 'Sending Emails...'}
              {phase === 'done' && 'Emails Sent'}
            </h3>
            {phase === 'generating' && totalQueued > 0 && (
              <p className="text-sm text-gray-500 mt-0.5">
                {generatedCount} of {totalQueued} generated
                {skipped.length > 0 && ` (${skipped.length} skipped)`}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={phase === 'sending'}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* PHASE: Generating */}
          {phase === 'generating' && (
            <div>
              {/* Progress bar */}
              {totalQueued > 0 && (
                <div className="mb-6">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${Math.round((generatedCount / totalQueued) * 100)}%` }}
                    />
                  </div>
                  <div className="text-sm text-gray-500 mt-2 text-center">
                    Generating personalized emails with Claude...
                  </div>
                </div>
              )}

              {/* Skipped items */}
              {skipped.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                  <div className="text-sm font-medium text-yellow-800 mb-1">
                    {skipped.length} prospect{skipped.length > 1 ? 's' : ''} skipped:
                  </div>
                  <ul className="text-sm text-yellow-700 space-y-0.5">
                    {skipped.map((s, i) => (
                      <li key={i}>{s.domain} — {s.reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Generated so far */}
              {emails.length > 0 && (
                <div className="space-y-2">
                  {emails.map(email => (
                    <div key={email.id} className="flex items-center gap-3 p-2 bg-green-50 border border-green-200 rounded-lg">
                      <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{email.domain}</div>
                        <div className="text-xs text-gray-500 truncate">{email.subject}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* PHASE: Reviewing */}
          {phase === 'reviewing' && (
            <div>
              {pendingEmails.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No emails to review. All prospects were either skipped or already have emails.
                </div>
              ) : (
                <>
                  {/* Select All */}
                  <div className="flex items-center justify-between mb-4 pb-3 border-b">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedEmailIds.size === pendingEmails.length && pendingEmails.length > 0}
                        onChange={handleSelectAll}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-600">
                        Select All ({pendingEmails.length})
                      </span>
                    </label>
                    <span className="text-sm text-gray-400">
                      {selectedEmailIds.size} selected
                    </span>
                  </div>

                  {/* Email list */}
                  <div className="space-y-2">
                    {pendingEmails.map(email => (
                      <div key={email.id} className="border border-gray-200 rounded-lg overflow-hidden">
                        {/* Row */}
                        <div
                          className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${
                            selectedEmailIds.has(email.id) ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'
                          }`}
                          onClick={() => setExpandedEmailId(expandedEmailId === email.id ? null : email.id)}
                        >
                          <input
                            type="checkbox"
                            checked={selectedEmailIds.has(email.id)}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleToggleEmail(email.id);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded border-gray-300"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900 text-sm">{email.domain}</span>
                              {email.domain_authority && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                  DA {email.domain_authority}
                                </span>
                              )}
                              <span className="text-xs text-gray-400">
                                {email.contact_name || email.contact_email}
                              </span>
                            </div>
                            <div className="text-sm text-gray-600 truncate mt-0.5">
                              {email.edited_subject || email.subject}
                            </div>
                          </div>
                          <svg
                            className={`w-5 h-5 text-gray-400 transition-transform ${expandedEmailId === email.id ? 'rotate-180' : ''}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>

                        {/* Expanded preview */}
                        {expandedEmailId === email.id && (
                          <div className="border-t border-gray-200 p-4 bg-gray-50">
                            {editingEmail?.id === email.id ? (
                              /* Edit mode */
                              <div className="space-y-3">
                                <div>
                                  <label className="block text-xs font-medium text-gray-500 mb-1">Subject</label>
                                  <input
                                    type="text"
                                    value={editingEmail.subject}
                                    onChange={(e) => setEditingEmail({ ...editingEmail, subject: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-500 mb-1">Body</label>
                                  <textarea
                                    value={editingEmail.body}
                                    onChange={(e) => setEditingEmail({ ...editingEmail, body: e.target.value })}
                                    rows={10}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono"
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={handleSaveEdit}
                                    className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setEditingEmail(null)}
                                    className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              /* Preview mode */
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <div className="text-xs text-gray-500">
                                    To: {email.contact_email}
                                  </div>
                                  <button
                                    onClick={() => setEditingEmail({
                                      id: email.id,
                                      subject: email.edited_subject || email.subject,
                                      body: email.edited_body || email.body,
                                    })}
                                    className="text-xs text-blue-600 hover:text-blue-800"
                                  >
                                    Edit
                                  </button>
                                </div>
                                <div className="text-sm font-medium text-gray-900 mb-2">
                                  {email.edited_subject || email.subject}
                                </div>
                                <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                                  {email.edited_body || email.body}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Skipped summary */}
              {skipped.length > 0 && (
                <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <div className="text-sm font-medium text-yellow-800 mb-1">
                    {skipped.length} skipped:
                  </div>
                  <ul className="text-xs text-yellow-700 space-y-0.5">
                    {skipped.map((s, i) => (
                      <li key={i}>{s.domain} — {s.reason}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* PHASE: Sending */}
          {phase === 'sending' && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-4" />
              <p className="text-gray-600 font-medium">Sending {selectedEmailIds.size} emails...</p>
              <p className="text-gray-400 text-sm mt-1">This may take a moment</p>
            </div>
          )}

          {/* PHASE: Done */}
          {phase === 'done' && sendResult && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-lg font-semibold text-gray-900">
                {sendResult.sent} email{sendResult.sent !== 1 ? 's' : ''} queued for sending
              </p>
              {sendResult.failed > 0 && (
                <p className="text-sm text-red-600 mt-1">{sendResult.failed} failed</p>
              )}
              <p className="text-gray-500 text-sm mt-2">
                Emails will be delivered in the background via the send queue.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 flex-shrink-0">
          {phase === 'generating' && (
            <div className="flex justify-end">
              <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm hover:bg-gray-300">
                Cancel
              </button>
            </div>
          )}

          {phase === 'reviewing' && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">
                {selectedEmailIds.size} of {pendingEmails.length} selected
              </span>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkSend}
                  disabled={selectedEmailIds.size === 0}
                  className="px-6 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Send {selectedEmailIds.size} Email{selectedEmailIds.size !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          )}

          {phase === 'done' && (
            <div className="flex justify-end">
              <button
                onClick={handleDone}
                className="px-6 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
