'use client';

import { useState, useEffect } from 'react';
import ContactQueue from './ContactQueue';
import OutcomeTagSelector from './OutcomeTagSelector';
import type { Prospect } from '../../lib/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

interface Contact {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  confidence_tier: string;
  is_primary: boolean;
  queue_position: number | null;
  queue_status: string | null;
}

interface Niche {
  id: string;
  name: string;
}

interface ProspectDetailProps {
  prospect: Prospect;
  onUpdate: (prospect: Prospect) => void;
  onShowAddContact: () => void;
}

const opportunityLabels: Record<string, string> = {
  broken_link: 'Broken Link',
  research_citation: 'Research Citation',
  guest_post: 'Guest Post',
};

export default function ProspectDetail({
  prospect,
  onUpdate,
  onShowAddContact,
}: ProspectDetailProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [niches, setNiches] = useState<Niche[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showComposeModal, setShowComposeModal] = useState(false);
  type ModalState = 'idle' | 'generating' | 'ready' | 'sending' | 'sent';
  const [modalState, setModalState] = useState<ModalState>('idle');
  const [generatedEmail, setGeneratedEmail] = useState<{ subject: string; body: string } | null>(null);
  const [sentEmailId, setSentEmailId] = useState<string | null>(null);
  const [editedSubject, setEditedSubject] = useState('');
  const [editedBody, setEditedBody] = useState('');
  const [composeError, setComposeError] = useState<string | null>(null);
  const [findingEmails, setFindingEmails] = useState(false);

  useEffect(() => {
    fetchData();
  }, [prospect.id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [contactsRes, nichesRes] = await Promise.all([
        fetch(`${API_BASE}/contacts/${prospect.id}`),
        fetch(`${API_BASE}/keywords/niches/list`),
      ]);

      if (contactsRes.ok) {
        const data = await contactsRes.json();
        setContacts(data.contacts || []);
      }

      if (nichesRes.ok) {
        const data = await nichesRes.json();
        setNiches(data.niches || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }
    setLoading(false);
  };

  const handleSetPrimary = async (contactId: string) => {
    try {
      const res = await fetch(`${API_BASE}/contacts/${prospect.id}/set-primary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId }),
      });
      if (res.ok) {
        const contactsRes = await fetch(`${API_BASE}/contacts/${prospect.id}`);
        if (contactsRes.ok) {
          const data = await contactsRes.json();
          setContacts(data.contacts || []);
        }
      }
    } catch (error) {
      console.error('Error setting primary contact:', error);
    }
  };

  const handleAddToQueue = async (contactId: string) => {
    try {
      const res = await fetch(`${API_BASE}/contacts/${prospect.id}/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId }),
      });
      if (res.ok) {
        const contactsRes = await fetch(`${API_BASE}/contacts/${prospect.id}`);
        if (contactsRes.ok) {
          const data = await contactsRes.json();
          setContacts(data.contacts || []);
        }
      }
    } catch (error) {
      console.error('Error adding to queue:', error);
    }
  };

  const handleRemoveFromQueue = async (contactId: string) => {
    try {
      const res = await fetch(`${API_BASE}/contacts/${prospect.id}/queue/${contactId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const contactsRes = await fetch(`${API_BASE}/contacts/${prospect.id}`);
        if (contactsRes.ok) {
          const data = await contactsRes.json();
          setContacts(data.contacts || []);
        }
      }
    } catch (error) {
      console.error('Error removing from queue:', error);
    }
  };

  const handleSetNiche = async (niche: string | null) => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/prospects/${prospect.id}/niche`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche }),
      });
      if (res.ok) {
        const updated = await res.json();
        onUpdate({ ...prospect, niche: updated.niche });
      }
    } catch (error) {
      console.error('Error setting niche:', error);
    }
    setSaving(false);
  };

  const handleSetOutcome = async (outcomeTag: string | null) => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/prospects/${prospect.id}/outcome`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome_tag: outcomeTag }),
      });
      if (res.ok) {
        const updated = await res.json();
        onUpdate({ ...prospect, outcome_tag: updated.outcome_tag });
      }
    } catch (error) {
      console.error('Error setting outcome:', error);
    }
    setSaving(false);
  };

  const handleFindEmails = async () => {
    setFindingEmails(true);
    try {
      const res = await fetch(`${API_BASE}/contacts/${prospect.id}/find`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.ok) {
        const pollInterval = setInterval(async () => {
          const contactsRes = await fetch(`${API_BASE}/contacts/${prospect.id}`);
          if (contactsRes.ok) {
            const data = await contactsRes.json();
            setContacts(data.contacts || []);

            if (data.contacts && data.contacts.length > 0) {
              clearInterval(pollInterval);
              setFindingEmails(false);
            }
          }
        }, 2000);

        setTimeout(() => {
          clearInterval(pollInterval);
          setFindingEmails(false);
        }, 30000);
      } else {
        setFindingEmails(false);
        alert('Failed to start email search');
      }
    } catch (error) {
      console.error('Error finding emails:', error);
      setFindingEmails(false);
      alert('Failed to find emails');
    }
  };

  const handleUseContact = async (contactId: string) => {
    try {
      const res = await fetch(`${API_BASE}/contacts/${prospect.id}/use`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId }),
      });

      if (res.ok) {
        await fetchData();
        alert('Contact selected! Email generation has been queued and will appear in the review queue shortly.');
      } else {
        alert('Failed to select contact');
      }
    } catch (error) {
      console.error('Error using contact:', error);
      alert('Failed to use contact');
    }
  };

  const handleComposeEmail = async () => {
    const primaryContact = contacts.find(c => c.is_primary) || contacts[0];
    if (!primaryContact) {
      setComposeError('No contact available. Add a contact first.');
      return;
    }

    setShowComposeModal(true);
    setModalState('generating');
    setComposeError(null);
    setGeneratedEmail(null);
    setSentEmailId(null);

    try {
      const res = await fetch(`${API_BASE}/emails/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospect_id: prospect.id,
          contact_id: primaryContact.id,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setGeneratedEmail({ subject: data.subject, body: data.body });
        setEditedSubject(data.subject);
        setEditedBody(data.body);
        setModalState('ready');
      } else {
        const errorData = await res.json();
        const errorMsg = errorData.details
          ? `${errorData.error}: ${errorData.details}`
          : errorData.error || 'Failed to generate email';
        setComposeError(errorMsg);
        setModalState('idle');
      }
    } catch (error) {
      setComposeError('Failed to connect to server. Is the backend running?');
      setModalState('idle');
    }
  };

  const handleSendEmail = async () => {
    const primaryContact = contacts.find(c => c.is_primary) || contacts[0];
    if (!primaryContact || !generatedEmail) return;

    setModalState('sending');
    try {
      const res = await fetch(`${API_BASE}/emails/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospect_id: prospect.id,
          contact_id: primaryContact.id,
          subject: editedSubject,
          body: editedBody,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSentEmailId(data.id || null);
        setModalState('sent');
      } else {
        const error = await res.json();
        setComposeError(error.message || 'Failed to send email');
        setModalState('ready');
      }
    } catch (error) {
      setComposeError('Failed to connect to server');
      setModalState('ready');
    }
  };

  const isBrokenLink = prospect.opportunity_type === 'broken_link';

  return (
    <div className="card h-full overflow-y-auto">
      {/* Header */}
      <div className="mb-4">
        <a
          href={prospect.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xl font-semibold text-primary-600 hover:underline"
        >
          {prospect.domain}
        </a>
        <div className="text-sm text-gray-500 truncate mt-1">{prospect.url}</div>
      </div>

      {/* Stats Row — expanded for broken_link */}
      <div className={`grid ${isBrokenLink ? 'grid-cols-6' : 'grid-cols-4'} gap-4 py-4 border-y border-gray-100 mb-4`}>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">{prospect.domain_authority ?? '-'}</div>
          <div className="text-xs text-gray-500">DA</div>
        </div>
        {isBrokenLink && (
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{prospect.page_authority ?? '-'}</div>
            <div className="text-xs text-gray-500">PA</div>
          </div>
        )}
        <div className="text-center">
          <div className="text-2xl font-bold text-primary-600">{prospect.quality_score ?? '-'}</div>
          <div className="text-xs text-gray-500">Score</div>
        </div>
        {isBrokenLink && (
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{prospect.spam_score ?? '-'}</div>
            <div className="text-xs text-gray-500">Spam</div>
          </div>
        )}
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">{contacts.length}</div>
          <div className="text-xs text-gray-500">Contacts</div>
        </div>
        <div className="text-center">
          <div className="text-sm font-medium text-gray-900">
            {opportunityLabels[prospect.opportunity_type] || prospect.opportunity_type}
          </div>
          <div className="text-xs text-gray-500">Type</div>
        </div>
      </div>

      {/* Broken Link Details (red-tinted card) */}
      {isBrokenLink && (prospect.broken_url || prospect.outbound_link_context) && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-red-800 mb-2">Broken Link Details</div>

              {/* Referring article */}
              <div className="mb-2">
                <div className="text-xs text-red-600 font-medium">Referring Article</div>
                <a
                  href={prospect.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-red-700 hover:underline truncate block"
                  title={prospect.url}
                >
                  {prospect.title || prospect.url}
                </a>
              </div>

              {/* Broken URL + status code */}
              {prospect.broken_url && (
                <div className="mb-2">
                  <div className="text-xs text-red-600 font-medium">Broken URL</div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-red-700 truncate" title={prospect.broken_url}>
                      {prospect.broken_url}
                    </span>
                    {prospect.broken_url_status_code != null && prospect.broken_url_status_code > 0 && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-red-200 text-red-800 font-mono flex-shrink-0">
                        HTTP {prospect.broken_url_status_code}
                      </span>
                    )}
                  </div>
                  {prospect.broken_url_verified_at && (
                    <div className="text-xs text-red-500 mt-0.5">
                      Verified: {new Date(prospect.broken_url_verified_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
              )}

              {/* Anchor text */}
              {prospect.outbound_link_context && (
                <div className="mb-2">
                  <div className="text-xs text-red-600 font-medium">Anchor Text</div>
                  <div className="text-sm text-red-700">&quot;{prospect.outbound_link_context}&quot;</div>
                </div>
              )}

              {/* Dofollow badge */}
              {prospect.is_dofollow != null && (
                <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                  prospect.is_dofollow
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {prospect.is_dofollow ? 'Dofollow' : 'Nofollow'}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Research DB Citation (for research_citation prospects) */}
      {!isBrokenLink && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <div className="text-sm font-medium text-green-800">Research DB Citation</div>
              <a
                href="https://shieldyourbody.com/research"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-green-700 hover:underline block mt-1"
              >
                shieldyourbody.com/research — 3,600+ peer-reviewed studies
              </a>
              {prospect.match_reason && (
                <div className="text-xs text-green-600 mt-1">{prospect.match_reason}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Suggested Replacement Article (for broken_link prospects only) */}
      {isBrokenLink && prospect.suggested_article_url && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <div className="text-sm font-medium text-green-800">Suggested Replacement Article</div>
              <a
                href={prospect.suggested_article_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-green-700 hover:underline block mt-1"
              >
                {prospect.suggested_article_title || prospect.suggested_article_url}
              </a>
              {prospect.match_reason && (
                <div className="text-xs text-green-600 mt-1">{prospect.match_reason}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Niche Selector */}
      <div className="mb-4">
        <label className="text-sm font-medium text-gray-700 mb-2 block">Niche</label>
        <select
          value={prospect.niche || ''}
          onChange={(e) => handleSetNiche(e.target.value || null)}
          disabled={saving}
          className="input w-full"
        >
          <option value="">Select niche...</option>
          {niches.map(n => (
            <option key={n.id} value={n.name}>{n.name}</option>
          ))}
        </select>
      </div>

      {/* Contacts Section */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Contacts & Email Queue</h3>
        {loading ? (
          <div className="text-center py-4 text-gray-500">Loading contacts...</div>
        ) : (
          <ContactQueue
            prospectId={prospect.id}
            contacts={contacts}
            onSetPrimary={handleSetPrimary}
            onAddToQueue={handleAddToQueue}
            onRemoveFromQueue={handleRemoveFromQueue}
            onAddContact={onShowAddContact}
            onUseContact={handleUseContact}
          />
        )}
      </div>

      {/* Outcome Tag Section (only for approved prospects) */}
      {prospect.approval_status === 'approved' && (
        <div className="mb-6 pt-4 border-t border-gray-100">
          <OutcomeTagSelector
            currentTag={prospect.outcome_tag}
            onSelect={handleSetOutcome}
            disabled={saving}
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-4 border-t border-gray-100">
        <button
          onClick={handleComposeEmail}
          disabled={contacts.length === 0}
          className="btn btn-primary flex-1"
        >
          Compose Email
        </button>
        <button
          onClick={handleFindEmails}
          disabled={findingEmails}
          className="btn btn-secondary"
        >
          {findingEmails ? 'Finding...' : 'Find Emails'}
        </button>
      </div>

      {/* Compose Email Modal */}
      {showComposeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold">
                Compose Email to {prospect.domain}
              </h3>
              <button
                onClick={() => {
                  setShowComposeModal(false);
                  setGeneratedEmail(null);
                  setComposeError(null);
                  setModalState('idle');
                  setSentEmailId(null);
                }}
                disabled={modalState === 'sending'}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[calc(90vh-140px)]">
              {modalState === 'generating' && (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mb-4"></div>
                  <p className="text-gray-600">Generating personalized email with Claude...</p>
                </div>
              )}

              {modalState === 'ready' && !composeError && generatedEmail && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
                    <div className="input bg-gray-50">
                      {contacts.find(c => c.is_primary)?.email || contacts[0]?.email}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                    <input
                      type="text"
                      value={editedSubject}
                      onChange={(e) => setEditedSubject(e.target.value)}
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
                    <textarea
                      value={editedBody}
                      onChange={(e) => setEditedBody(e.target.value)}
                      rows={12}
                      className="input w-full font-mono text-sm"
                    />
                  </div>
                </div>
              )}

              {composeError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                  {composeError}
                </div>
              )}

              {modalState === 'sending' && (
                <div className="text-center py-12">
                  <div className="mb-4 flex justify-center">
                    <svg
                      className="w-16 h-16 text-primary-500 animate-bounce"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                      />
                    </svg>
                  </div>
                  <p className="text-gray-600 font-medium">Sending to {prospect.domain}...</p>
                  <p className="text-gray-400 text-sm mt-1">This usually takes a few seconds</p>
                </div>
              )}

              {modalState === 'sent' && (
                <div className="text-center py-12">
                  <div className="mb-4 flex justify-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                      <svg
                        className="w-10 h-10 text-green-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  </div>
                  <p className="text-gray-900 font-semibold text-lg">Email sent!</p>
                  <p className="text-gray-500 mt-1">Successfully sent to {prospect.domain}</p>
                </div>
              )}
            </div>

            {(modalState === 'ready' || modalState === 'sending') && !composeError && (
              <div className="p-4 border-t border-gray-200 flex gap-3">
                <button
                  onClick={handleSendEmail}
                  disabled={modalState === 'sending'}
                  className="btn btn-primary flex-1"
                >
                  {modalState === 'sending' ? 'Sending...' : 'Send'}
                </button>
                <button
                  onClick={handleComposeEmail}
                  disabled={modalState === 'sending'}
                  className="btn btn-secondary"
                >
                  Regenerate
                </button>
                <button
                  onClick={() => {
                    setShowComposeModal(false);
                    setGeneratedEmail(null);
                    setModalState('idle');
                  }}
                  disabled={modalState === 'sending'}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
