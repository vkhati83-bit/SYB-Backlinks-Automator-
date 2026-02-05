'use client';

interface ProspectTabsProps {
  activeTab: 'pending' | 'approved' | 'completed';
  onTabChange: (tab: 'pending' | 'approved' | 'completed') => void;
  counts: {
    pending: number;
    approved: number;
    completed: number;
  };
}

export default function ProspectTabs({ activeTab, onTabChange, counts }: ProspectTabsProps) {
  const tabs = [
    { id: 'pending' as const, label: 'Pending Review', count: counts.pending },
    { id: 'approved' as const, label: 'Approved', count: counts.approved },
    { id: 'completed' as const, label: 'Completed', count: counts.completed },
  ];

  return (
    <div className="border-b border-gray-200">
      <nav className="-mb-px flex space-x-8">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`
              whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm
              ${activeTab === tab.id
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }
            `}
          >
            {tab.label}
            <span
              className={`
                ml-2 py-0.5 px-2 rounded-full text-xs
                ${activeTab === tab.id
                  ? 'bg-primary-100 text-primary-600'
                  : 'bg-gray-100 text-gray-600'
                }
              `}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}
