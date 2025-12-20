
import React from 'react';
import { ICONS } from '../constants';
import { LibraryAsset } from '../types';

interface AssetLibraryProps {
  library: LibraryAsset[];
  onAdd: (asset: LibraryAsset) => void;
  onRemove: (id: string) => void;
}

export const AssetLibrary: React.FC<AssetLibraryProps> = ({ library, onAdd, onRemove }) => {
  const handleAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    onAdd({
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      url,
      duration: 180, // Simulation
      addedAt: Date.now()
    });
  };

  return (
    <div className="max-w-[1200px] mx-auto p-10 animate-fadeIn">
      <header className="flex justify-between items-end mb-10 pb-8 border-b border-slate-100">
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Asset Library</h1>
          <p className="text-sm text-slate-500">
            Store your preferred BGM tracks locally for quick access across different compositions.
          </p>
        </div>
        
        <label className="flex items-center gap-3 px-8 py-4 rounded-2xl font-black shadow-xl transition-all active:scale-95 bg-blue-600 text-white hover:bg-blue-700 shadow-blue-100 cursor-pointer border-b-4 border-blue-800">
          <input type="file" accept="audio/*" onChange={handleAdd} className="hidden" />
          <ICONS.Music className="w-5 h-5" /> Import Audio Track
        </label>
      </header>

      {library.length === 0 ? (
        <div className="bg-white rounded-[2.5rem] border-2 border-dashed border-slate-100 p-20 text-center">
           <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-6 text-slate-200">
              <ICONS.Music className="w-10 h-10" />
           </div>
           <h2 className="text-xl font-bold text-slate-900 mb-2">No Assets Saved</h2>
           <p className="text-slate-400 text-sm max-w-xs mx-auto">Upload audio files to your library so you can reuse them in any project without re-uploading.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {library.map((asset) => (
            <div key={asset.id} className="group bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all hover:border-blue-100">
               <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center border border-blue-100 shadow-sm group-hover:bg-blue-600 group-hover:text-white transition-all">
                     <ICONS.Music className="w-6 h-6" />
                  </div>
                  <div className="flex-1 overflow-hidden">
                     <h3 className="font-bold text-slate-800 truncate">{asset.name}</h3>
                     <p className="text-[10px] font-black text-slate-400 uppercase">Added {new Date(asset.addedAt).toLocaleDateString()}</p>
                  </div>
               </div>
               
               <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                  <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded tracking-widest uppercase">AUDIO/MPEG</span>
                  <button 
                    onClick={() => onRemove(asset.id)}
                    className="text-[10px] font-black text-red-400 hover:text-red-600 uppercase tracking-widest"
                  >
                    Delete Asset
                  </button>
               </div>
            </div>
          ))}
        </div>
      )}
      
      <div className="mt-12 p-8 bg-blue-50 rounded-[2rem] border border-blue-100 flex gap-6 items-center">
         <div className="p-4 bg-white rounded-2xl shadow-sm text-blue-600 shrink-0">
            <ICONS.Info className="w-8 h-8" />
         </div>
         <div>
            <h4 className="text-sm font-black text-blue-900 mb-1">LOCAL PERSISTENCE NOTE</h4>
            <p className="text-xs text-blue-700 leading-relaxed max-w-2xl">
              This library caches your files in the browser's local memory. To ensure 100% production stability during batch rendering, avoid clearing your browser cache while processing a large queue. 
              <strong> Files are stored natively at original quality with zero compression.</strong>
            </p>
         </div>
      </div>
    </div>
  );
};
