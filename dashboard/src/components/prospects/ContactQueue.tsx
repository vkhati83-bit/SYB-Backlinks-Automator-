'use client';

import { useState } from 'react';

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

interface ContactQueueProps {
  prospectId: string;
  contacts: Contact[];
  onSetPrimary: (contactId: string) => void;
  onAddToQueue: (contactId: string) => void;
  onRemoveFromQueue: (contactId: string) => void;
  onAddContact: () => void;
  onUseContact?: (contactId: string) => void;
}

const tierColors: Record<string, string> = {
  A: 'bg-green-100 text-green-800',
  B: 'bg-blue-100 text-blue-800',
  C: 'bg-yellow-100 text-yellow-800',
  D: 'bg-gray-100 text-gray-800',
};

export default function ContactQueue({
  contacts,
  onSetPrimary,
  onAddToQueue,
  onRemoveFromQueue,
  onAddContact,
  onUseContact,
  prospectId,
}: ContactQueueProps) {
  const [expandedQueue, setExpandedQueue] = useState(true);
  const [usingContact, setUsingContact] = useState<string | null>(null);

  const primaryContact = contacts.find(c => c.is_primary);
  const queuedContacts = contacts
    .filter(c => c.queue_status === 'queued')
    .sort((a, b) => (a.queue_position || 0) - (b.queue_position || 0));
  const availableContacts = contacts.filter(c => !c.is_primary && c.queue_status !== 'queued');
  const allContacts = contacts.filter(c => !c.is_primary);

  const handleUseContact = async (contactId: string) => {
    setUsingContact(contactId);
    if (onUseContact) {
      await onUseContact(contactId);
    }
    setUsingContact(null);
  };

  return (
    <div className="space-y-4">
      {/* Primary Contact (Selected) */}
      {primaryContact && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">✓ Selected Contact</h4>
          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <div>
                <div className="font-medium text-gray-900">{primaryContact.email}</div>
                {primaryContact.name && <div className="text-xs text-gray-600">{primaryContact.name}</div>}
                {primaryContact.role && <div className="text-xs text-gray-500">{primaryContact.role}</div>}
              </div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded ${tierColors[primaryContact.confidence_tier]}`}>
              Tier {primaryContact.confidence_tier}
            </span>
          </div>
        </div>
      )}

      {/* All Found Emails */}
      {allContacts.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">
            Found Emails ({allContacts.length})
          </h4>
          <div className="space-y-2">
            {allContacts.map((contact) => (
              <div
                key={contact.id}
                className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-3 hover:border-gray-300"
              >
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">{contact.email}</div>
                  {contact.name && <div className="text-xs text-gray-600">{contact.name}</div>}
                  {contact.role && <div className="text-xs text-gray-500">{contact.role}</div>}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${tierColors[contact.confidence_tier]}`}>
                    Tier {contact.confidence_tier}
                  </span>
                  <button
                    onClick={() => handleUseContact(contact.id)}
                    disabled={usingContact === contact.id}
                    className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {usingContact === contact.id ? 'Using...' : 'Use'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Show message if no contacts found */}
      {contacts.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-sm text-gray-600 mb-2">No emails found yet</p>
          <p className="text-xs text-gray-500">Click "Find Emails" to search for contact information</p>
        </div>
      )}

      {/* Add Contact Button */}
      <button
        onClick={onAddContact}
        className="w-full py-2 text-sm text-primary-600 hover:text-primary-700 border border-dashed border-gray-300 rounded-lg hover:border-primary-300"
      >
        + Add Contact
      </button>
    </div>
  );
}
