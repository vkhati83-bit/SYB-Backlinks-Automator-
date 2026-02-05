'use client';

import { useState } from 'react';
import ProspectCard from './ProspectCard';

interface Prospect {
  id: string;
  url: string;
  domain: string;
  title: string | null;
  domain_authority: number | null;
  quality_score: number | null;
  opportunity_type: string;
  status: string;
  niche: string | null;
  approval_status: string;
  outcome_tag: string | null;
  contact_count: number;
}

interface ProspectSectionProps {
  title: string;
  prospects: Prospect[];
  selectedId: string | null;
  checkedIds: Set<string>;
  onSelect: (prospect: Prospect) => void;
  onToggleCheck: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  collapsed?: boolean;
}

const sectionColors: Record<string, string> = {
  'Broken Links': 'bg-orange-500',
  'Research Citations': 'bg-blue-500',
  'Guest Posts': 'bg-purple-500',
};

export default function ProspectSection({
  title,
  prospects,
  selectedId,
  checkedIds,
  onSelect,
  onToggleCheck,
  onSelectAll,
  collapsed: initialCollapsed = false,
}: ProspectSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);

  const allChecked = prospects.length > 0 && prospects.every(p => checkedIds.has(p.id));
  const someChecked = prospects.some(p => checkedIds.has(p.id));

  const handleSelectAll = () => {
    if (allChecked) {
      // Deselect all in this section
      prospects.forEach(p => {
        if (checkedIds.has(p.id)) {
          onToggleCheck(p.id);
        }
      });
    } else {
      // Select all in this section
      onSelectAll(prospects.map(p => p.id));
    }
  };

  if (prospects.length === 0) {
    return null;
  }

  return (
    <div className="mb-4">
      <div
        className="flex items-center justify-between p-2 bg-gray-50 rounded-t-lg cursor-pointer hover:bg-gray-100"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${sectionColors[title] || 'bg-gray-500'}`} />
          <span className="font-medium text-gray-900">{title}</span>
          <span className="text-sm text-gray-500">({prospects.length})</span>
        </div>
        <div className="flex items-center gap-2">
          {!isCollapsed && (
            <label className="flex items-center gap-1 text-sm text-gray-600" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={allChecked}
                ref={(el) => {
                  if (el) el.indeterminate = someChecked && !allChecked;
                }}
                onChange={handleSelectAll}
                className="h-4 w-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
              />
              Select All
            </label>
          )}
          <svg
            className={`w-5 h-5 text-gray-500 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {!isCollapsed && (
        <div className="border border-t-0 border-gray-200 rounded-b-lg overflow-hidden">
          {prospects.map((prospect) => (
            <ProspectCard
              key={prospect.id}
              prospect={prospect}
              isSelected={selectedId === prospect.id}
              isChecked={checkedIds.has(prospect.id)}
              onSelect={() => onSelect(prospect)}
              onToggleCheck={() => onToggleCheck(prospect.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
