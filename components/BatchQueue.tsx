
import React, { useState } from 'react';
import { ICONS } from '../constants';
import { ProjectConfig } from '../types';

interface BatchQueueProps {
  items: ProjectConfig[];
  onUpdateItem: (id: string, updates: Partial<ProjectConfig>) => void;
  onClear: () => void;
}

export const BatchQueue: React.FC<BatchQueueProps> = ({ items, onUpdateItem, onClear }) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const startBatchRender = async () => {
    if (items.length === 0) return;
    setIsProcessing(true);

    for (const item of items) {
      if (item.status === 'COMPLETED') continue;

      onUpdateItem(item.id, { status: 'RENDERING', progress: 0 });

      // Simulated sequential render
      for (let p = 0; p <= 100; p += Math.random() * 15) {
        await new Promise(r => setTimeout(r, 400));
        onUpdateItem(item.id, { progress: Math.min(Math.floor(p), 100) });
      }

      onUpdateItem(item.id, { 
        status: 'COMPLETED', 
        progress: 100, 
        outputUrl: item.video1?.url // In real life, this would be the rendered blob
      });
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
              disabled={isProcessing}
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
            disabled={isProcessing || items.length === 0}
            className={`flex items-center gap-3 px-10 py-4 rounded-2xl font-black shadow-xl transition-all active:scale-95 ${
              isProcessing || items.length === 0
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200 shadow-none'
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-100 border-b-4 border-blue-800'
            }`}
          >
            {isProcessing ? 'Rendering Batch...' : 'Process Batch Queue'}
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
                       'bg-slate-50 text-slate-400 border-slate-200'
                     }`}>
                        {item.status}
                     </span>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                     <span className="flex items-center gap-1"><ICONS.Video className="w-3 h-3" /> {item.exportQuality}</span>
                     <span className="flex items-center gap-1"><ICONS.Music className="w-3 h-3" /> {item.bgm?.name || 'No BGM'}</span>
                  </div>
               </div>

               <div className="w-64 space-y-2">
                  <div className="flex justify-between text-[10px] font-black uppercase text-slate-400">
                     <span>{item.status === 'RENDERING' ? 'Processing Frames' : item.status === 'COMPLETED' ? 'Success' : 'Ready'}</span>
                     <span className="tabular-nums">{item.progress}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-50 shadow-inner">
                     <div 
                      className={`h-full transition-all duration-300 ${item.status === 'COMPLETED' ? 'bg-green-500' : 'bg-blue-600'}`} 
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

      {isProcessing && (
        <div className="mt-10 p-6 bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl animate-slideDown">
          <div className="flex items-center gap-4 text-blue-400 font-mono text-xs">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            <span>[SYS]: LOCAL_RENDER_THREAD_ACTIVE // MODE: SEQUENTIAL_BATCH</span>
          </div>
          <div className="mt-4 font-mono text-[10px] text-slate-500 space-y-1">
             <p className="text-slate-300">>> npx remotion render src/index.ts {items.find(i => i.status === 'RENDERING')?.name || 'idle'} --props=local_blob_id</p>
             <p>>> Rendering frame 402/1200... (32fps)</p>
          </div>
        </div>
      )}
    </div>
  );
};
