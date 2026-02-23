'use client';

import { useState, useEffect, useCallback } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

interface SentEmail {
  id: string;
  subject: string;
  sent_at: string;
  status: string;
  contact_email: string;
  contact_name: string | null;
  domain: string;
  prospect_url: string;
  opportunity_type: string;
  research_link_found: boolean | null;
  research_link_last_checked_at: string | null;
}

export default function SentPage() {
  const [emails, setEmails] = useState<SentEmail[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const limit = 50;

  const loadEmails = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/emails/sent?page=${page}&limit=${limit}`);
      const data = await res.json();
      setEmails(data.emails || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Failed to load sent emails:', err);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { loadEmails(); }, [loadEmails]);

  const handleCheckLink = async (emailId: string) => {
    setCheckingId(emailId);
    try {
      const res = await fetch(`${API_BASE}/emails/${emailId}/check-link`, { method: 'POST' });
      const data = await res.json();
      setEmails(prev => prev.map(e =>
        e.id === emailId
          ? { ...e, research_link_found: data.found, research_link_last_checked_at: data.checkedAt }
          : e
      ));
    } catch (err) {
      console.error('Failed to check link:', err);
    } finally {
      setCheckingId(null);
    }
  };

  const linkBadge = (email: SentEmail) => {
    if (email.research_link_found === null) {
      return <span className="text-gray-400 text-xs">Not checked</span>;
    }
    if (email.research_link_found) {
      return (
        <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 text-xs font-medium">
          ✓ Link found
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5 text-xs font-medium">
        ✗ Not found
      </span>
    );
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Sent Emails</h1>
        <p className="text-gray-500 mt-1">
          {total} emails sent · Check if recipients added a link to shieldyourbody.com/research
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Domain</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Contact</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Subject</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Sent</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Link Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {emails.map(email => (
                  <tr key={email.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <a
                        href={email.prospect_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline font-medium"
                      >
                        {email.domain}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <div>{email.contact_name || '—'}</div>
                      <div className="text-xs text-gray-400">{email.contact_email}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs truncate" title={email.subject}>
                      {email.subject}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        email.opportunity_type === 'research_citation'
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-orange-50 text-orange-700'
                      }`}>
                        {email.opportunity_type === 'research_citation' ? 'Research' : 'Broken Link'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {email.sent_at ? new Date(email.sent_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {linkBadge(email)}
                      {email.research_link_last_checked_at && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          checked {new Date(email.research_link_last_checked_at).toLocaleDateString()}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleCheckLink(email.id)}
                        disabled={checkingId === email.id}
                        className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        {checkingId === email.id ? 'Checking...' : 'Check link'}
                      </button>
                    </td>
                  </tr>
                ))}
                {emails.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                      No sent emails yet. Approve prospects and send emails to see them here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {total > limit && (
            <div className="mt-4 flex justify-center items-center gap-3">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Prev
              </button>
              <span className="text-sm text-gray-500">
                Page {page} of {Math.ceil(total / limit)}
              </span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page >= Math.ceil(total / limit)}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
