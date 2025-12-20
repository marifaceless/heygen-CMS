import React, { useEffect, useMemo, useState } from 'react';
import { ICONS } from '../constants';

type CacheBucket = { files: number; bytes: number };
type CacheStats = {
  uploads: CacheBucket;
  cache: CacheBucket;
  output: CacheBucket;
  bundle: CacheBucket;
  jobsFile: CacheBucket;
  total: CacheBucket;
};

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let value = bytes;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

export const EngineConfig: React.FC<{
  onCacheCleared: () => void;
}> = ({ onCacheCleared }) => {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStats = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/cache/stats');
      if (!response.ok) {
        throw new Error('Unable to load cache stats.');
      }
      const data = (await response.json()) as CacheStats;
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load cache stats.');
      setStats(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const summary = useMemo(() => {
    if (!stats) {
      return null;
    }
    return [
      { label: 'Uploads', value: formatBytes(stats.uploads.bytes) },
      { label: 'Normalized Cache', value: formatBytes(stats.cache.bytes) },
      { label: 'Outputs', value: formatBytes(stats.output.bytes) },
      { label: 'Bundle', value: formatBytes(stats.bundle.bytes) },
    ];
  }, [stats]);

  const clearCache = async () => {
    const confirmed = window.confirm(
      [
        'Delete local render cache?',
        '',
        'This deletes:',
        '- Render outputs',
        '- Upload copies + normalized media cache',
        '- Render job history + bundle',
        '',
        'This keeps:',
        '- Asset Library (your browser stored files)',
        '- Queue list (but completed outputs will be reset)',
        '',
        'Continue?',
      ].join('\n')
    );
    if (!confirmed) {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/cache/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Unable to clear cache.');
      }
      onCacheCleared();
      await loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to clear cache.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-[900px] mx-auto p-10 animate-fadeIn">
      <header className="flex justify-between items-end mb-10 pb-8 border-b border-slate-100">
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Engine Config</h1>
          <p className="text-sm text-slate-500">Local render settings and storage controls.</p>
        </div>

        <button
          onClick={loadStats}
          disabled={isLoading}
          className="px-6 py-4 bg-white border border-slate-200 rounded-2xl text-slate-900 font-bold text-sm shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2 disabled:opacity-50"
        >
          <ICONS.Info className="w-4 h-4 text-blue-600" /> Refresh
        </button>
      </header>

      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Storage</h2>
            <p className="text-sm font-bold text-slate-800">Output is always rendered at 24fps.</p>
            <p className="text-xs text-slate-500 mt-1 max-w-xl">
              The render server caches normalized media + outputs on disk for speed. You can wipe this at any time —
              your Asset Library stays in the browser.
            </p>
          </div>

          <button
            onClick={clearCache}
            disabled={isLoading}
            className="px-6 py-4 bg-red-50 text-red-600 rounded-2xl border border-red-100 font-black text-xs uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all disabled:opacity-50"
          >
            Delete Cache
          </button>
        </div>

        {error && <p className="mt-4 text-xs font-bold text-red-500">{error}</p>}

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {summary?.map((item) => (
            <div key={item.label} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.label}</p>
              <p className="text-lg font-black text-slate-900 mt-1">{item.value}</p>
            </div>
          ))}
          {!stats && !isLoading && (
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cache</p>
              <p className="text-sm font-bold text-slate-500 mt-1">Stats unavailable (is the render server running?).</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

