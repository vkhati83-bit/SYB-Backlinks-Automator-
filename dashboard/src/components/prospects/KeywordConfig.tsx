'use client';

import { useState, useEffect } from 'react';

interface Keyword {
  id: string;
  keyword: string;
  niche: string | null;
  is_active: boolean;
  match_count: number;
}

interface Niche {
  id: string;
  name: string;
  description: string | null;
  keywords: string[];
  is_active: boolean;
}

interface KeywordConfigProps {
  onClose?: () => void;
}

export default function KeywordConfig({ onClose }: KeywordConfigProps) {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [niches, setNiches] = useState<Niche[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyword, setNewKeyword] = useState({ keyword: '', niche: '' });
  const [selectedNiche, setSelectedNiche] = useState<string>('all');
  const [isCollapsed, setIsCollapsed] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [keywordsRes, nichesRes] = await Promise.all([
        fetch('/api/keywords'),
        fetch('/api/keywords/niches/list'),
      ]);

      if (keywordsRes.ok) {
        const data = await keywordsRes.json();
        setKeywords(data.keywords || []);
      }

      if (nichesRes.ok) {
        const data = await nichesRes.json();
        setNiches(data.niches || []);
      }
    } catch (error) {
      console.error('Error fetching keyword data:', error);
    }
    setLoading(false);
  };

  const addKeyword = async () => {
    if (!newKeyword.keyword.trim()) return;

    try {
      const res = await fetch('/api/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: newKeyword.keyword.trim(),
          niche: newKeyword.niche || null,
        }),
      });

      if (res.ok) {
        const keyword = await res.json();
        setKeywords([keyword, ...keywords]);
        setNewKeyword({ keyword: '', niche: '' });
      }
    } catch (error) {
      console.error('Error adding keyword:', error);
    }
  };

  const deleteKeyword = async (id: string) => {
    try {
      const res = await fetch(`/api/keywords/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setKeywords(keywords.filter(k => k.id !== id));
      }
    } catch (error) {
      console.error('Error deleting keyword:', error);
    }
  };

  const toggleKeyword = async (id: string) => {
    try {
      const res = await fetch(`/api/keywords/${id}/toggle`, { method: 'POST' });
      if (res.ok) {
        const updated = await res.json();
        setKeywords(keywords.map(k => k.id === id ? updated : k));
      }
    } catch (error) {
      console.error('Error toggling keyword:', error);
    }
  };

  const filteredKeywords = selectedNiche === 'all'
    ? keywords
    : keywords.filter(k => k.niche === selectedNiche);

  return (
    <div className="bg-white rounded-lg border border-gray-200 mb-6">
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="font-medium text-gray-900">Search Keywords</span>
          <span className="text-sm text-gray-500">({keywords.filter(k => k.is_active).length} active)</span>
        </div>
        <svg
          className={`w-5 h-5 text-gray-500 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!isCollapsed && (
        <div className="p-4 border-t border-gray-200">
          {loading ? (
            <div className="text-center py-4 text-gray-500">Loading...</div>
          ) : (
            <>
              {/* Add Keyword Form */}
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newKeyword.keyword}
                  onChange={(e) => setNewKeyword({ ...newKeyword, keyword: e.target.value })}
                  placeholder="Enter keyword..."
                  className="flex-1 input"
                  onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
                />
                <select
                  value={newKeyword.niche}
                  onChange={(e) => setNewKeyword({ ...newKeyword, niche: e.target.value })}
                  className="input w-40"
                >
                  <option value="">No niche</option>
                  {niches.map(n => (
                    <option key={n.id} value={n.name}>{n.name}</option>
                  ))}
                </select>
                <button onClick={addKeyword} className="btn btn-primary">
                  Add
                </button>
              </div>

              {/* Filter by Niche */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setSelectedNiche('all')}
                  className={`px-3 py-1 rounded-full text-sm ${
                    selectedNiche === 'all'
                      ? 'bg-primary-100 text-primary-700'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  All
                </button>
                {niches.map(n => (
                  <button
                    key={n.id}
                    onClick={() => setSelectedNiche(n.name)}
                    className={`px-3 py-1 rounded-full text-sm ${
                      selectedNiche === n.name
                        ? 'bg-primary-100 text-primary-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {n.name}
                  </button>
                ))}
              </div>

              {/* Keywords List */}
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {filteredKeywords.length === 0 ? (
                  <div className="text-center py-4 text-gray-500 text-sm">
                    No keywords found. Add some above.
                  </div>
                ) : (
                  filteredKeywords.map(keyword => (
                    <div
                      key={keyword.id}
                      className={`flex items-center justify-between p-2 rounded-lg border ${
                        keyword.is_active ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleKeyword(keyword.id)}
                          className={`w-4 h-4 rounded ${
                            keyword.is_active ? 'bg-green-500' : 'bg-gray-300'
                          }`}
                          title={keyword.is_active ? 'Active' : 'Inactive'}
                        />
                        <span className={keyword.is_active ? 'text-gray-900' : 'text-gray-500'}>
                          {keyword.keyword}
                        </span>
                        {keyword.niche && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                            {keyword.niche}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">
                          {keyword.match_count} matches
                        </span>
                        <button
                          onClick={() => deleteKeyword(keyword.id)}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
