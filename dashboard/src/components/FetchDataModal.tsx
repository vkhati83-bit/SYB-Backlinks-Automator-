'use client';

import { useState } from 'react';

interface FetchDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'research_citation' | 'broken_link';
  onFetch: (params: FetchParams) => Promise<void>;
}

export interface FetchParams {
  // Common
  limit: number;
  minDA: number;
  maxDA: number;

  // Research citations
  minPosition?: number;
  maxPosition?: number;
  keywords?: string[];

  // Broken links - Mode 1: Competitor domains
  competitors?: string[];
  dofollow?: boolean;

  // Broken links - Mode 2: Specific broken URLs
  mode?: 'competitors' | 'specific_urls';
  brokenUrls?: string[];
}

const DEFAULT_COMPETITORS = [
  'defendershield.com',
  'safesleevecases.com',
  'airestech.com',
];

export default function FetchDataModal({ isOpen, onClose, type, onFetch }: FetchDataModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Common filters
  const [limit, setLimit] = useState(500);
  const [minDA, setMinDA] = useState(15);
  const [maxDA, setMaxDA] = useState(100);

  // Research citation filters
  const [minPosition, setMinPosition] = useState(1);
  const [maxPosition, setMaxPosition] = useState(50);
  const [keywordsInput, setKeywordsInput] = useState('');

  // Broken link filters
  const [brokenLinkMode, setBrokenLinkMode] = useState<'competitors' | 'specific_urls'>('competitors');
  const [competitors, setCompetitors] = useState<string[]>(DEFAULT_COMPETITORS);
  const [newCompetitor, setNewCompetitor] = useState('');
  const [dofollow, setDofollow] = useState(true);

  // Specific broken URLs
  const [brokenUrls, setBrokenUrls] = useState<string[]>([]);
  const [newBrokenUrl, setNewBrokenUrl] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const keywords = keywordsInput
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);

      const params: FetchParams = {
        limit,
        minDA,
        maxDA,
      };

      if (type === 'research_citation') {
        params.minPosition = minPosition;
        params.maxPosition = maxPosition;
        params.keywords = keywords.length > 0 ? keywords : undefined;
      } else {
        params.mode = brokenLinkMode;
        params.dofollow = dofollow;

        if (brokenLinkMode === 'competitors') {
          params.competitors = competitors;
        } else {
          if (brokenUrls.length === 0) {
            setError('Please add at least one broken URL to check');
            setLoading(false);
            return;
          }
          params.brokenUrls = brokenUrls;
        }
      }

      await onFetch(params);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const addCompetitor = () => {
    if (newCompetitor && !competitors.includes(newCompetitor)) {
      setCompetitors([...competitors, newCompetitor]);
      setNewCompetitor('');
    }
  };

  const removeCompetitor = (comp: string) => {
    setCompetitors(competitors.filter(c => c !== comp));
  };

  const addBrokenUrl = () => {
    if (newBrokenUrl && !brokenUrls.includes(newBrokenUrl)) {
      // Basic URL validation
      try {
        new URL(newBrokenUrl);
        setBrokenUrls([...brokenUrls, newBrokenUrl]);
        setNewBrokenUrl('');
        setError(null);
      } catch {
        setError('Please enter a valid URL (e.g., https://example.com/page)');
      }
    }
  };

  const removeBrokenUrl = (url: string) => {
    setBrokenUrls(brokenUrls.filter(u => u !== url));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              {type === 'research_citation' ? 'Fetch Research Citations' : 'Fetch Broken Links'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {type === 'research_citation'
              ? 'Configure filters to find research citation opportunities from SEO Command Center'
              : 'Find broken link opportunities via DataForSEO'}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 space-y-5">
            {/* Common Filters */}
            <div className="space-y-4">
              <h3 className="font-medium text-gray-900 flex items-center gap-2">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                Filters
              </h3>

              {/* Limit */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Results
                </label>
                <input
                  type="number"
                  value={limit}
                  onChange={(e) => setLimit(parseInt(e.target.value) || 500)}
                  min={1}
                  max={1000}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  How many prospects to fetch and add to pending review (max: 1000)
                </p>
              </div>

              {/* Domain Authority Range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Min DA (Domain Authority)
                  </label>
                  <input
                    type="number"
                    value={minDA}
                    onChange={(e) => setMinDA(parseInt(e.target.value) || 0)}
                    min={0}
                    max={100}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max DA
                  </label>
                  <input
                    type="number"
                    value={maxDA}
                    onChange={(e) => setMaxDA(parseInt(e.target.value) || 100)}
                    min={0}
                    max={100}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Research Citation Specific Filters */}
            {type === 'research_citation' && (
              <div className="space-y-4 pt-4 border-t border-gray-200">
                <h3 className="font-medium text-gray-900 flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  SERP Position
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Min Position
                    </label>
                    <input
                      type="number"
                      value={minPosition}
                      onChange={(e) => setMinPosition(parseInt(e.target.value) || 1)}
                      min={1}
                      max={100}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Max Position
                    </label>
                    <input
                      type="number"
                      value={maxPosition}
                      onChange={(e) => setMaxPosition(parseInt(e.target.value) || 50)}
                      min={1}
                      max={100}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Keywords */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Keywords (comma-separated)
                  </label>
                  <textarea
                    value={keywordsInput}
                    onChange={(e) => setKeywordsInput(e.target.value)}
                    placeholder="emf protection, cell phone radiation, 5g health, wifi safety"
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Leave empty to search all EMF-related keywords
                  </p>
                </div>
              </div>
            )}

            {/* Broken Link Specific Filters */}
            {type === 'broken_link' && (
              <div className="space-y-4 pt-4 border-t border-gray-200">
                {/* Mode Selection */}
                <div className="space-y-2">
                  <h3 className="font-medium text-gray-900 flex items-center gap-2">
                    <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    Search Mode
                  </h3>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setBrokenLinkMode('competitors')}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        brokenLinkMode === 'competitors'
                          ? 'border-orange-500 bg-orange-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-medium text-sm">Competitor Domains</div>
                      <div className="text-xs text-gray-500 mt-1">
                        Find any broken backlinks to competitor sites
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBrokenLinkMode('specific_urls')}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        brokenLinkMode === 'specific_urls'
                          ? 'border-orange-500 bg-orange-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-medium text-sm">Specific URLs</div>
                      <div className="text-xs text-gray-500 mt-1">
                        Find who links to a specific broken URL
                      </div>
                    </button>
                  </div>
                </div>

                {/* Mode 1: Competitor Domains */}
                {brokenLinkMode === 'competitors' && (
                  <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">
                      Find pages that link to these competitor domains where the link is now broken (404).
                    </p>

                    {/* Competitors List */}
                    <div className="flex flex-wrap gap-2">
                      {competitors.map((comp) => (
                        <span
                          key={comp}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-sm"
                        >
                          {comp}
                          <button
                            type="button"
                            onClick={() => removeCompetitor(comp)}
                            className="hover:text-orange-600"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </span>
                      ))}
                    </div>

                    {/* Add Competitor */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newCompetitor}
                        onChange={(e) => setNewCompetitor(e.target.value)}
                        placeholder="Add competitor domain..."
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCompetitor())}
                      />
                      <button
                        type="button"
                        onClick={addCompetitor}
                        className="px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}

                {/* Mode 2: Specific Broken URLs */}
                {brokenLinkMode === 'specific_urls' && (
                  <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">
                      Enter competitor URLs you know are broken. We'll verify they're broken and find all pages linking to them.
                    </p>

                    {/* Broken URLs List */}
                    {brokenUrls.length > 0 && (
                      <div className="space-y-2">
                        {brokenUrls.map((url) => (
                          <div
                            key={url}
                            className="flex items-center gap-2 p-2 bg-white rounded-lg border border-gray-200"
                          >
                            <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                            <span className="text-sm text-gray-700 truncate flex-1">{url}</span>
                            <button
                              type="button"
                              onClick={() => removeBrokenUrl(url)}
                              className="text-gray-400 hover:text-red-500"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add Broken URL */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newBrokenUrl}
                        onChange={(e) => setNewBrokenUrl(e.target.value)}
                        placeholder="https://competitor.com/broken-page"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addBrokenUrl())}
                      />
                      <button
                        type="button"
                        onClick={addBrokenUrl}
                        className="px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200"
                      >
                        Add
                      </button>
                    </div>

                    <p className="text-xs text-gray-500">
                      Tip: Find broken competitor pages using tools like Ahrefs, or check their old blog posts.
                    </p>
                  </div>
                )}

                {/* Dofollow Only */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dofollow}
                    onChange={(e) => setDofollow(e.target.checked)}
                    className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                  />
                  <span className="text-sm text-gray-700">Only dofollow links</span>
                </label>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-red-50 text-red-800 rounded-lg text-sm">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`px-6 py-2 rounded-lg text-white font-medium flex items-center gap-2 ${
                type === 'research_citation'
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-orange-600 hover:bg-orange-700'
              } disabled:opacity-50`}
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Fetching...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Fetch Data
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
