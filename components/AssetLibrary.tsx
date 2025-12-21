
import React from 'react';
import { ICONS } from '../constants';
import { LibraryAsset } from '../types';
import { saveMediaBlob } from '../mediaStore';
import { getMediaDuration } from '../mediaDuration';

interface AssetLibraryProps {
  library: LibraryAsset[];
  onAdd: (asset: LibraryAsset) => void;
  onRemove: (id: string) => void;
}

export const AssetLibrary: React.FC<AssetLibraryProps> = ({ library, onAdd, onRemove }) => {
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [dropError, setDropError] = React.useState<string | null>(null);

  const importAudioFile = async (file: File) => {
    const assetId = Math.random().toString(36).substr(2, 9);
    const url = URL.createObjectURL(file);
    saveMediaBlob(assetId, file).catch((error) => {
      console.warn('[media] Failed to persist asset.', error);
    });
    const duration = await getMediaDuration(file);
    const safeDuration = duration > 0 ? duration : 180;
    onAdd({
      id: assetId,
      name: file.name,
      url,
      duration: safeDuration,
      addedAt: Date.now()
    });
  };

  const handleAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDropError(null);
    await importAudioFile(file);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (Array.from(e.dataTransfer.types || []).includes('Files')) {
      setIsDragOver(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (Array.from(e.dataTransfer.types || []).includes('Files') && !isDragOver) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) {
      return;
    }

    const audioFiles = files.filter((file) => file.type.startsWith('audio/'));
    if (audioFiles.length === 0) {
      setDropError('Only audio files can be added to the library.');
      return;
    }

    const rejected = files.length - audioFiles.length;
    if (rejected > 0) {
      setDropError('Some files were skipped (only audio files can be added to the library).');
    } else {
      setDropError(null);
    }

    for (const file of audioFiles) {
      await importAudioFile(file);
    }
  };

  const onDragStartAsset = (asset: LibraryAsset) => (e: React.DragEvent) => {
    e.dataTransfer.setData('application/x-heygen-library-asset-id', asset.id);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div
      className="max-w-[1200px] mx-auto p-10 animate-fadeIn"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <header className="flex justify-between items-end mb-10 pb-8 border-b border-slate-100">
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Asset Library</h1>
          <p className="text-sm text-slate-500">
            Store your preferred BGM tracks locally for quick access across different compositions.
          </p>
          {dropError && (
            <p className="mt-3 text-[10px] font-bold text-red-500 bg-red-50 border border-red-100 rounded-2xl px-4 py-3 inline-block">
              {dropError}
            </p>
          )}
        </div>
        
        <label className="flex items-center gap-3 px-8 py-4 rounded-2xl font-black shadow-xl transition-all active:scale-95 bg-blue-600 text-white hover:bg-blue-700 shadow-blue-100 cursor-pointer border-b-4 border-blue-800">
          <input type="file" accept="audio/*" onChange={handleAdd} className="hidden" />
          <ICONS.Music className="w-5 h-5" /> Import Audio Track
        </label>
      </header>

      {isDragOver && (
        <div className="mb-8 p-6 bg-blue-50 rounded-[2rem] border-2 border-dashed border-blue-200 text-center">
          <p className="text-xs font-black text-blue-700 uppercase tracking-widest">Drop audio files to add to library</p>
          <p className="text-[10px] font-bold text-blue-600 mt-1">Tip: drag a track onto the Workstation BGM box to use it.</p>
        </div>
      )}

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
            <div
              key={asset.id}
              draggable
              onDragStart={onDragStartAsset(asset)}
              className="group bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all hover:border-blue-100 cursor-grab active:cursor-grabbing"
              title="Drag to Workstation BGM"
            >
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
              This library stores files in your browser storage (IndexedDB) for persistence. To ensure 100% production stability during batch rendering, avoid clearing site data while processing a large queue. 
              <strong> Files are saved at original quality with zero compression.</strong>
            </p>
         </div>
      </div>
    </div>
  );
};
