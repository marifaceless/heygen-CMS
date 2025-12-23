
import React, { useState } from 'react';
import { ICONS } from '../constants';
import { ProjectConfig } from '../types';
import { loadMediaBlob } from '../mediaStore';

interface BatchQueueProps {
  items: ProjectConfig[];
  onUpdateItem: (id: string, updates: Partial<ProjectConfig>) => void;
  onClear: () => void;
}

export const BatchQueue: React.FC<BatchQueueProps> = ({ items, onUpdateItem, onClear }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const activeItem = items.find((item) => item.status === 'RENDERING') || null;
  const isActivelyRendering = isProcessing || Boolean(activeItem);

  const uploadAsset = async (asset: { id: string; name: string } | null, label: string) => {
    if (!asset) {
      return null;
    }
    const blob = await loadMediaBlob(asset.id);
    if (!blob) {
      throw new Error(`${label} file not found. Please re-import the asset.`);
    }

    const formData = new FormData();
    formData.append('assetId', asset.id);
    formData.append('file', blob, asset.name || `${asset.id}.bin`);

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`${label} upload failed.`);
    }

    const data = await response.json();
    return data.path as string;
  };

  const pollJob = async (jobId: string, itemId: string) => {
    while (true) {
      const response = await fetch(`/api/render/${jobId}`);
      if (!response.ok) {
        if (response.status === 404) {
          onUpdateItem(itemId, {
            status: 'FAILED',
            progress: 0,
            errorMessage: 'Render job missing. The server may have restarted.',
          });
          return;
        }
        throw new Error('Unable to fetch render status.');
      }
      const data = await response.json();
      const status = data.status as string;
      const progress = typeof data.progress === 'number' ? data.progress : 0;

      if (status === 'rendering' || status === 'queued' || status === 'cancelling' || status === 'normalizing') {
        onUpdateItem(itemId, { status: 'RENDERING', progress });
      }

      if (status === 'completed') {
        onUpdateItem(itemId, {
          status: 'COMPLETED',
          progress: 100,
          outputUrl: data.outputUrl || undefined,
          errorMessage: undefined,
        });
        return;
      }

      if (status === 'failed') {
        onUpdateItem(itemId, {
          status: 'FAILED',
          progress,
          errorMessage: data.error || 'Render failed.',
        });
        return;
      }

      if (status === 'cancelled') {
        onUpdateItem(itemId, {
          status: 'CANCELLED',
          progress,
          errorMessage: data.error || 'Render cancelled by user.',
        });
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  };

  const renderQueueItem = async (item: ProjectConfig) => {
    onUpdateItem(item.id, { status: 'RENDERING', progress: 0, errorMessage: undefined, outputUrl: undefined });

    const video1Path = await uploadAsset(item.video1, 'Video 1');
    const video2Path = await uploadAsset(item.video2, 'Video 2');
    const bgmPath = await uploadAsset(item.bgm, 'BGM');

    if (!video1Path) {
      throw new Error('Video 1 is required to render.');
    }

    const bgm = item.bgm
      ? {
          path: bgmPath,
          duration: item.bgm.duration,
          playLength: item.bgm.playLength,
          volume: item.bgm.volume,
          mode: item.bgm.mode,
          startTime: item.bgm.startTime || 0,
          loop: item.bgm.loop || (item.bgm.duration > 0 && item.bgm.playLength > item.bgm.duration),
        }
      : null;

    const response = await fetch('/api/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: item.name,
        exportQuality: item.exportQuality,
        video1: { path: video1Path, duration: item.video1?.duration || 0 },
        video2: video2Path ? { path: video2Path, duration: item.video2?.duration || 0 } : null,
        bgm,
      }),
    });

    if (!response.ok) {
      throw new Error('Render job could not be created.');
    }

    const data = await response.json();
    const jobId = data.jobId as string;
    onUpdateItem(item.id, { jobId, status: 'RENDERING', progress: 0 });
    await pollJob(jobId, item.id);
  };

  const cancelRender = async (item: ProjectConfig) => {
    if (!item.jobId) {
      onUpdateItem(item.id, {
        status: 'FAILED',
        progress: item.progress,
        errorMessage: 'Render job missing.',
      });
      return;
    }

    const response = await fetch(`/api/render/${item.jobId}/cancel`, { method: 'POST' });
    if (!response.ok) {
      onUpdateItem(item.id, {
        status: 'FAILED',
        progress: item.progress,
        errorMessage: 'Unable to cancel render.',
      });
      return;
    }

    onUpdateItem(item.id, {
      status: 'CANCELLED',
      progress: item.progress,
      errorMessage: 'Render cancelled by user.',
    });
  };

  const startBatchRender = async () => {
    if (items.length === 0) return;
    setIsProcessing(true);

    for (const item of items) {
      if (item.status === 'COMPLETED' || item.status === 'RENDERING') continue;
      try {
        await renderQueueItem(item);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Render failed.';
        onUpdateItem(item.id, { status: 'FAILED', progress: 0, errorMessage: message });
      }
    }

    setIsProcessing(false);
  };

  const downloadItem = (item: ProjectConfig) => {
    if (!item.outputUrl) return;
    const a = document.createElement('a');
    a.href = item.outputUrl;
    a.download = `${item.name}.mp4`;
    a.click();
  };

  const downloadAll = () => {
    items.forEach(item => {
      if (item.status === 'COMPLETED') {
        downloadItem(item);
      }
    });
  };

  const completedCount = items.filter(i => i.status === 'COMPLETED').length;

  return (
    <div className="max-w-[1200px] mx-auto p-10 animate-fadeIn">
      <header className="flex justify-between items-end mb-10 pb-8 border-b border-slate-100">
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Production Queue</h1>
          <p className="text-sm text-slate-500">
            {items.length} compositions prepared for sequential local rendering.
          </p>
        </div>
        
        <div className="flex gap-4">
          {items.length > 0 && (
            <button 
              onClick={onClear} 
              disabled={isActivelyRendering}
              className="px-6 py-4 text-xs font-black text-red-400 uppercase tracking-widest hover:text-red-600 disabled:opacity-30"
            >
              Flush Queue
            </button>
          )}
          
          {completedCount > 0 && (
            <button 
              onClick={downloadAll}
              className="px-8 py-4 bg-white border border-slate-200 rounded-2xl text-slate-900 font-bold text-sm shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2"
            >
              <ICONS.Download className="w-4 h-4 text-blue-600" /> Download All ({completedCount})
            </button>
          )}

          <button
            onClick={startBatchRender}
            disabled={isActivelyRendering || items.length === 0}
            className={`flex items-center gap-3 px-10 py-4 rounded-2xl font-black shadow-xl transition-all active:scale-95 ${
              isActivelyRendering || items.length === 0
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200 shadow-none'
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-100 border-b-4 border-blue-800'
            }`}
          >
            {isActivelyRendering ? 'Rendering Batch...' : 'Process Batch Queue'}
          </button>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="bg-white rounded-[2.5rem] border-2 border-dashed border-slate-100 p-20 text-center">
           <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-6 text-slate-200">
              <ICONS.Download className="w-10 h-10" />
           </div>
           <h2 className="text-xl font-bold text-slate-900 mb-2">Queue is Empty</h2>
           <p className="text-slate-400 text-sm max-w-xs mx-auto">Go to the Workstation to prepare your compositions and add them here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {items.map((item, idx) => (
            <div key={item.id} className={`group bg-white p-6 rounded-3xl border transition-all flex items-center gap-6 ${
              item.status === 'RENDERING' ? 'border-blue-500 shadow-xl shadow-blue-50' : 'border-slate-100 shadow-sm'
            }`}>
               <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 font-black text-sm shrink-0 border border-slate-100">
                  {idx + 1}
               </div>
               
               <div className="flex-1 overflow-hidden">
                  <div className="flex items-center gap-3 mb-1">
                     <h3 className="font-black text-slate-900 truncate tracking-tight">{item.name}</h3>
                     <span className={`text-[9px] font-black px-1.5 py-0.5 rounded tracking-widest uppercase border ${
                       item.status === 'COMPLETED' ? 'bg-green-50 text-green-600 border-green-100' :
                       item.status === 'RENDERING' ? 'bg-blue-600 text-white border-blue-700' :
                       item.status === 'FAILED' ? 'bg-red-50 text-red-600 border-red-100' :
                       item.status === 'CANCELLED' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                       'bg-slate-50 text-slate-400 border-slate-200'
                     }`}>
                        {item.status}
                     </span>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                     <span className="flex items-center gap-1"><ICONS.Video className="w-3 h-3" /> {item.exportQuality}</span>
                     <span className="flex items-center gap-1"><ICONS.Music className="w-3 h-3" /> {item.bgm?.name || 'No BGM'}</span>
                  </div>
                  {(item.status === 'FAILED' || item.status === 'CANCELLED') && item.errorMessage && (
                    <p
                      className={`mt-2 text-[10px] font-bold ${
                        item.status === 'CANCELLED' ? 'text-amber-600' : 'text-red-500'
                      }`}
                    >
                      {item.errorMessage}
                    </p>
                  )}
                  {item.status === 'RENDERING' && item.jobId && (
                    <div className="mt-2 flex items-center gap-3 text-[10px] font-bold text-blue-600">
                      <span>Job: {item.jobId.slice(0, 8).toUpperCase()}</span>
                      <button
                        onClick={() => cancelRender(item)}
                        className="text-[10px] font-black text-red-500 hover:text-red-600 uppercase tracking-widest"
                      >
                        Cancel Render
                      </button>
                    </div>
                  )}
               </div>

               <div className="w-64 space-y-2">
                  <div className="flex justify-between text-[10px] font-black uppercase text-slate-400">
                     <span>{
                       item.status === 'RENDERING'
                         ? 'Processing Frames'
                         : item.status === 'COMPLETED'
                           ? 'Success'
                           : item.status === 'FAILED'
                             ? 'Failed'
                             : item.status === 'CANCELLED'
                               ? 'Cancelled'
                             : 'Ready'
                     }</span>
                     <span className="tabular-nums">{item.progress}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-50 shadow-inner">
                     <div 
                      className={`h-full transition-all duration-300 ${
                        item.status === 'COMPLETED'
                          ? 'bg-green-500'
                          : item.status === 'CANCELLED'
                            ? 'bg-amber-500'
                            : item.status === 'FAILED'
                              ? 'bg-red-500'
                              : 'bg-blue-600'
                      }`} 
                      style={{ width: `${item.progress}%` }}
                     ></div>
                  </div>
               </div>

               <div className="w-32 flex justify-end">
                  {item.status === 'COMPLETED' ? (
                    <button 
                      onClick={() => downloadItem(item)}
                      className="p-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                    >
                      <ICONS.Download className="w-5 h-5" />
                    </button>
                  ) : (
                    <div className="w-10 h-10 border-2 border-slate-100 rounded-xl border-dashed"></div>
                  )}
               </div>
            </div>
          ))}
        </div>
      )}

      {isActivelyRendering && (
        <div className="mt-10 p-6 bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl animate-slideDown">
          <div className="flex items-center gap-4 text-blue-400 font-mono text-xs">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            <span>[SYS]: LOCAL_RENDER_ACTIVE</span>
          </div>
          <div className="mt-4 font-mono text-[10px] text-slate-400 space-y-1">
            <p className="text-slate-200">Active: {activeItem?.name || 'Starting...'}</p>
            <p>Progress: {activeItem ? `${activeItem.progress}%` : '...'} </p>
            {activeItem?.jobId ? <p>Job: {activeItem.jobId.toUpperCase()}</p> : null}
          </div>
        </div>
      )}
    </div>
  );
};
