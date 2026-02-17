'use client';

import { useState, useEffect, useRef } from 'react';

// --- Types ---

export interface ProspectFilters {
  search: string;
  sort_by: string;
  sort_order: 'asc' | 'desc';
  min_da: string;
  max_da: string;
  min_score: string;
  max_score: string;
  date_from: string;
  date_to: string;
  is_dofollow: '' | 'true' | 'false';
  has_article_match: '' | 'true' | 'false';
  filter_status: string;
}

export const defaultFilters: ProspectFilters = {
  search: '',
  sort_by: 'quality_score',
  sort_order: 'desc',
  min_da: '',
  max_da: '',
  min_score: '',
  max_score: '',
  date_from: '',
  date_to: '',
  is_dofollow: '',
  has_article_match: '',
  filter_status: '',
};

export interface ShowFilters {
  search?: boolean;
  sort?: boolean;
  da?: boolean;
  score?: boolean;
  date?: boolean;
  dofollow?: boolean;
  articleMatch?: boolean;
  filterStatus?: boolean;
}

const defaultShow: ShowFilters = {
  search: true,
  sort: true,
  da: true,
  score: true,
  date: true,
  dofollow: true,
  articleMatch: true,
  filterStatus: true,
};

interface Props {
  filters: ProspectFilters;
  onChange: (filters: ProspectFilters) => void;
  showFilters?: ShowFilters;
  accentColor?: 'blue' | 'orange';
  resultCount?: number;
}

// --- Helper ---

export function filtersToQueryString(f: ProspectFilters): string {
  const params = new URLSearchParams();
  if (f.sort_by && f.sort_by !== 'quality_score') params.set('sort_by', f.sort_by);
  if (f.sort_order && f.sort_order !== 'desc') params.set('sort_order', f.sort_order);
  if (f.search) params.set('search', f.search);
  if (f.min_da) params.set('min_da', f.min_da);
  if (f.max_da) params.set('max_da', f.max_da);
  if (f.min_score) params.set('min_score', f.min_score);
  if (f.max_score) params.set('max_score', f.max_score);
  if (f.date_from) params.set('date_from', f.date_from);
  if (f.date_to) params.set('date_to', f.date_to);
  if (f.is_dofollow) params.set('is_dofollow', f.is_dofollow);
  if (f.has_article_match) params.set('has_article_match', f.has_article_match);
  if (f.filter_status) params.set('filter_status', f.filter_status);
  const str = params.toString();
  return str ? `&${str}` : '';
}

function countActiveFilters(f: ProspectFilters): number {
  let count = 0;
  if (f.min_da) count++;
  if (f.max_da) count++;
  if (f.min_score) count++;
  if (f.max_score) count++;
  if (f.date_from) count++;
  if (f.date_to) count++;
  if (f.is_dofollow) count++;
  if (f.has_article_match) count++;
  if (f.filter_status) count++;
  return count;
}

// --- Sort options ---

const sortOptions = [
  { value: 'quality_score', label: 'Score' },
  { value: 'domain_authority', label: 'DA' },
  { value: 'created_at', label: 'Date Added' },
];

// --- Component ---

export default function ProspectFilterBar({
  filters,
  onChange,
  showFilters: showProp,
  accentColor = 'blue',
  resultCount,
}: Props) {
  const show = { ...defaultShow, ...showProp };
  const [expanded, setExpanded] = useState(false);
  const [searchInput, setSearchInput] = useState(filters.search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync searchInput when filters.search is reset externally
  useEffect(() => {
    setSearchInput(filters.search);
  }, [filters.search]);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChange({ ...filters, search: value });
    }, 300);
  };

  const update = (partial: Partial<ProspectFilters>) => {
    onChange({ ...filters, ...partial });
  };

  const clearAll = () => {
    setSearchInput('');
    onChange({ ...defaultFilters });
  };

  const activeCount = countActiveFilters(filters);
  const accent = accentColor === 'orange' ? 'orange' : 'blue';
  const accentBg = accent === 'orange' ? 'bg-orange-100' : 'bg-blue-100';
  const accentText = accent === 'orange' ? 'text-orange-700' : 'text-blue-700';
  const accentBorder = accent === 'orange' ? 'border-orange-300' : 'border-blue-300';
  const accentBgDark = accent === 'orange' ? 'bg-orange-500' : 'bg-blue-500';

  return (
    <div className="mb-4">
      {/* Always-visible row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        {show.search && (
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search domains..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
            />
          </div>
        )}

        {/* Sort */}
        {show.sort && (
          <div className="flex items-center gap-1">
            <select
              value={filters.sort_by}
              onChange={(e) => update({ sort_by: e.target.value })}
              className="text-sm border border-gray-300 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {sortOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={() => update({ sort_order: filters.sort_order === 'asc' ? 'desc' : 'asc' })}
              className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
              title={filters.sort_order === 'asc' ? 'Ascending' : 'Descending'}
            >
              {filters.sort_order === 'asc' ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
                </svg>
              )}
            </button>
          </div>
        )}

        {/* Filters toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg transition-colors ${
            expanded || activeCount > 0
              ? `${accentBg} ${accentText} ${accentBorder}`
              : 'border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filters
          {activeCount > 0 && (
            <span className={`${accentBgDark} text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center`}>
              {activeCount}
            </span>
          )}
        </button>

        {/* Result count */}
        {resultCount !== undefined && (
          <span className="text-sm text-gray-500 ml-auto">
            {resultCount} result{resultCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Collapsible filter panel */}
      {expanded && (
        <div className="mt-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {/* DA Range */}
            {show.da && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">DA Range</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={filters.min_da}
                    onChange={(e) => update({ min_da: e.target.value })}
                    placeholder="Min"
                    className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300"
                    min="0"
                    max="100"
                  />
                  <span className="text-gray-400">-</span>
                  <input
                    type="number"
                    value={filters.max_da}
                    onChange={(e) => update({ max_da: e.target.value })}
                    placeholder="Max"
                    className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300"
                    min="0"
                    max="100"
                  />
                </div>
              </div>
            )}

            {/* Score Range */}
            {show.score && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Score Range</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={filters.min_score}
                    onChange={(e) => update({ min_score: e.target.value })}
                    placeholder="Min"
                    className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300"
                    min="0"
                  />
                  <span className="text-gray-400">-</span>
                  <input
                    type="number"
                    value={filters.max_score}
                    onChange={(e) => update({ max_score: e.target.value })}
                    placeholder="Max"
                    className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300"
                    min="0"
                  />
                </div>
              </div>
            )}

            {/* Date Range */}
            {show.date && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date Range</label>
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    value={filters.date_from}
                    onChange={(e) => update({ date_from: e.target.value })}
                    className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300"
                  />
                  <span className="text-gray-400">-</span>
                  <input
                    type="date"
                    value={filters.date_to}
                    onChange={(e) => update({ date_to: e.target.value })}
                    className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300"
                  />
                </div>
              </div>
            )}

            {/* Dofollow */}
            {show.dofollow && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Link Type</label>
                <select
                  value={filters.is_dofollow}
                  onChange={(e) => update({ is_dofollow: e.target.value as '' | 'true' | 'false' })}
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300"
                >
                  <option value="">All</option>
                  <option value="true">Dofollow only</option>
                  <option value="false">Nofollow only</option>
                </select>
              </div>
            )}

            {/* Article Match */}
            {show.articleMatch && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Article Match</label>
                <select
                  value={filters.has_article_match}
                  onChange={(e) => update({ has_article_match: e.target.value as '' | 'true' | 'false' })}
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300"
                >
                  <option value="">All</option>
                  <option value="true">Has match</option>
                  <option value="false">No match</option>
                </select>
              </div>
            )}

            {/* Filter Status */}
            {show.filterStatus && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Filter Status</label>
                <select
                  value={filters.filter_status}
                  onChange={(e) => update({ filter_status: e.target.value })}
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300"
                >
                  <option value="">All</option>
                  <option value="auto_approved">Auto Approved</option>
                  <option value="needs_review">Needs Review</option>
                  <option value="auto_rejected">Auto Rejected</option>
                </select>
              </div>
            )}
          </div>

          {/* Clear All */}
          {activeCount > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <button
                onClick={clearAll}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
