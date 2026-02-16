'use client';

import type { Prospect } from '../../lib/types';

interface ProspectCardProps {
  prospect: Prospect;
  isSelected: boolean;
  isChecked: boolean;
  onSelect: () => void;
  onToggleCheck: () => void;
}

const outcomeColors: Record<string, string> = {
  partner: 'bg-green-100 text-green-800',
  not_interested: 'bg-red-100 text-red-800',
  follow_up_later: 'bg-yellow-100 text-yellow-800',
  no_response: 'bg-gray-100 text-gray-800',
  bounced: 'bg-orange-100 text-orange-800',
  unsubscribed: 'bg-purple-100 text-purple-800',
};

const outcomeLabels: Record<string, string> = {
  partner: 'Partner',
  not_interested: 'Not Interested',
  follow_up_later: 'Follow Up',
  no_response: 'No Response',
  bounced: 'Bounced',
  unsubscribed: 'Unsubscribed',
};

export default function ProspectCard({
  prospect,
  isSelected,
  isChecked,
  onSelect,
  onToggleCheck,
}: ProspectCardProps) {
  return (
    <div
      className={`
        flex items-center gap-3 p-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors
        ${isSelected ? 'bg-primary-50 border-l-4 border-l-primary-500' : ''}
      `}
    >
      <input
        type="checkbox"
        checked={isChecked}
        onChange={(e) => {
          e.stopPropagation();
          onToggleCheck();
        }}
        className="h-4 w-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
      />
      <div className="flex-1 min-w-0" onClick={onSelect}>
        <div className="flex justify-between items-start">
          <span className="font-medium text-gray-900 truncate">{prospect.domain}</span>
          {prospect.outcome_tag && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${outcomeColors[prospect.outcome_tag]}`}>
              {outcomeLabels[prospect.outcome_tag]}
            </span>
          )}
        </div>
        {prospect.title && (
          <div className="text-sm text-gray-600 truncate">{prospect.title}</div>
        )}
        <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
          <span>DA: {prospect.domain_authority || '-'}</span>
          <span>Score: {prospect.quality_score || '-'}</span>
          <span>{prospect.contact_count} contact{prospect.contact_count !== 1 ? 's' : ''}</span>
        </div>
        {prospect.niche && (
          <span className="inline-block mt-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
            {prospect.niche}
          </span>
        )}
      </div>
    </div>
  );
}
