'use client';

interface OutcomeTagSelectorProps {
  currentTag: string | null;
  onSelect: (tag: string | null) => void;
  disabled?: boolean;
}

const outcomeOptions = [
  { value: 'partner', label: 'Partner', description: 'Got the backlink!', color: 'bg-green-100 text-green-800 border-green-200' },
  { value: 'not_interested', label: 'Not Interested', description: 'Declined our offer', color: 'bg-red-100 text-red-800 border-red-200' },
  { value: 'follow_up_later', label: 'Follow Up Later', description: 'Interested but not now', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  { value: 'no_response', label: 'No Response', description: 'No reply received', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  { value: 'bounced', label: 'Bounced', description: 'Email bounced', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  { value: 'unsubscribed', label: 'Unsubscribed', description: 'Asked to be removed', color: 'bg-purple-100 text-purple-800 border-purple-200' },
];

export default function OutcomeTagSelector({
  currentTag,
  onSelect,
  disabled = false,
}: OutcomeTagSelectorProps) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-gray-700">Outcome Tag</h4>
      <div className="grid grid-cols-2 gap-2">
        {outcomeOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => onSelect(currentTag === option.value ? null : option.value)}
            disabled={disabled}
            className={`
              p-2 rounded-lg border text-left transition-all
              ${currentTag === option.value
                ? `${option.color} border-2`
                : 'bg-white border-gray-200 hover:border-gray-300'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            <div className="text-sm font-medium">{option.label}</div>
            <div className="text-xs text-gray-500">{option.description}</div>
          </button>
        ))}
      </div>
      {currentTag && (
        <button
          onClick={() => onSelect(null)}
          disabled={disabled}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          Clear tag
        </button>
      )}
    </div>
  );
}
