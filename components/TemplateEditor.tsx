
import React, { useState, useEffect } from 'react';
import { ICONS } from '../constants';
import { ProjectConfig, BGMMode, VideoAsset, BGMAsset, LibraryAsset } from '../types';

interface TemplateEditorProps {
  onEnqueue: (config: ProjectConfig) => void;
  library: LibraryAsset[];
  onAddToLibrary: (asset: LibraryAsset) => void;
}

export const TemplateEditor: React.FC<TemplateEditorProps> = ({ onEnqueue, library, onAddToLibrary }) => {
  const [config, setConfig] = useState<ProjectConfig>({
    id: '',
    name: `Composition_${new Date().toLocaleTimeString()}`,
    video1: null,
    video2: null,
    bgm: null,
    exportQuality: '1080p',
    status: 'PENDING',
    progress: 0
  });

  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [totalFrames, setTotalFrames] = useState(600);

  useEffect(() => {
    const v1Dur = config.video1?.duration || 0;
    const v2Dur = config.video2?.duration || 0;
    const totalSec = v1Dur + v2Dur || 20;
    setTotalFrames(Math.floor(totalSec * 30));
  }, [config.video1, config.video2]);

  const selectFromLibrary = (asset: LibraryAsset) => {
    setConfig(prev => ({
      ...prev,
      bgm: {
        id: asset.id,
        name: asset.name,
        url: asset.url,
        duration: asset.duration,
        startTime: 0,
        playLength: 30,
        volume: 0.5,
        mode: BGMMode.FULL,
        loop: true
      }
    }));
    setShowLibraryPicker(false);
  };

  const handleFileUpload = (type: 'video1' | 'video2' | 'bgm') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    
    if (type === 'bgm') {
      const newBgm: BGMAsset = {
        id: Math.random().toString(),
        name: file.name,
        url,
        duration: 180,
        startTime: 0,
        playLength: 30,
        volume: 0.5,
        mode: BGMMode.FULL,
        loop: true
      };
      setConfig(prev => ({ ...prev, bgm: newBgm }));
      // Automatically add to library for convenience
      onAddToLibrary({
        id: newBgm.id,
        name: newBgm.name,
        url: newBgm.url,
        duration: newBgm.duration,
        addedAt: Date.now()
      });
    } else {
      setConfig(prev => ({
        ...prev,
        [type]: {
          id: Math.random().toString(),
          name: file.name,
          url,
          duration: 15 
        }
      }));
    }
  };

  const handleAdd = () => {
    if (!config.video1 || !config.video2) {
      alert("Validation: Both Video 1 and Video 2 are required for the CMS template.");
      return;
    }
    onEnqueue({ ...config });
    setConfig({
      id: '',
      name: `Composition_${new Date().toLocaleTimeString()}`,
      video1: null,
      video2: null,
      bgm: null,
      exportQuality: '1080p',
      status: 'PENDING',
      progress: 0
    });
  };

  return (
    <div className="max-w-[1400px] mx-auto p-8 animate-fadeIn relative">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 pb-8 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
             <h1 className="text-3xl font-black text-slate-900 tracking-tight italic">HEYGEN <span className="text-blue-600 not-italic">CMS</span></h1>
             <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-md border border-blue-100 uppercase tracking-widest">v2.5.0-Stable</span>
          </div>
          <p className="text-slate-500 text-sm max-w-lg">
            High-fidelity video engine. Prepare your clips and add them to the <span className="font-bold text-blue-600">Batch Queue</span> for bulk processing.
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <input 
              type="text" 
              value={config.name} 
              onChange={(e) => setConfig({...config, name: e.target.value})}
              className="block bg-transparent text-right text-sm font-bold text-slate-700 outline-none border-b border-transparent focus:border-blue-400"
            />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Composition Label</p>
          </div>
          <button
            onClick={handleAdd}
            className="group flex items-center gap-3 px-8 py-4 rounded-2xl font-bold shadow-xl transition-all active:scale-95 bg-blue-600 text-white hover:bg-blue-700 shadow-blue-100 border-b-4 border-blue-800"
          >
            <ICONS.Download className="w-5 h-5" /> Add to Batch Queue
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        <div className="xl:col-span-4 space-y-6">
          <section className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
              <div className="w-1.5 h-4 bg-blue-600 rounded-full"></div> Asset Configuration
            </h2>
            <div className="space-y-4">
              {['video1', 'video2'].map((v) => (
                <div key={v} className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase">{v === 'video1' ? '1. Intro Clip' : '2. Body Clip'}</label>
                  <div className={`relative border-2 border-dashed rounded-2xl p-4 transition-all ${config[v] ? 'border-blue-500 bg-blue-50/30' : 'border-slate-200 hover:bg-slate-50'}`}>
                    {config[v] ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 overflow-hidden">
                           <ICONS.Video className="w-4 h-4 text-blue-500" />
                           <span className="text-xs font-bold text-slate-700 truncate max-w-[140px]">{config[v].name}</span>
                        </div>
                        <button onClick={() => setConfig(prev => ({...prev, [v]: null}))} className="text-[10px] font-black text-red-400 hover:text-red-600 transition-colors">Remove</button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center py-4 cursor-pointer">
                        <input type="file" accept="video/*" onChange={handleFileUpload(v as any)} className="hidden" />
                        <ICONS.Download className="w-5 h-5 text-slate-200 mb-1" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select {v === 'video1' ? 'Intro' : 'Body'}</span>
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-3">
                 <div className="w-1.5 h-4 bg-blue-400 rounded-full"></div> Audio Logic
              </h2>
              {library.length > 0 && !config.bgm && (
                <button 
                  onClick={() => setShowLibraryPicker(true)}
                  className="text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-1"
                >
                  <ICONS.Music className="w-3 h-3" /> Pick from Library
                </button>
              )}
            </div>
            
            {config.bgm ? (
              <div className="space-y-6">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <ICONS.Music className="w-4 h-4 text-blue-500" />
                    <span className="text-[10px] font-bold truncate text-slate-600">{config.bgm.name}</span>
                  </div>
                  <button onClick={() => setConfig(prev => ({...prev, bgm: null}))} className="text-[10px] font-bold text-red-400 hover:text-red-600 transition-colors">Remove</button>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-black uppercase text-slate-400">
                      <span>Start Offset</span>
                      <span className="text-blue-600">{config.bgm.startTime}s</span>
                    </div>
                    <input type="range" min="0" max="60" step="1" value={config.bgm.startTime} 
                      onChange={(e) => setConfig(prev => ({...prev, bgm: prev.bgm ? {...prev.bgm, startTime: parseInt(e.target.value)} : null}))}
                      className="w-full h-1.5 bg-slate-100 rounded-full appearance-none cursor-pointer accent-blue-600" />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-black uppercase text-slate-400">
                      <span>Loop Length</span>
                      <span className="text-blue-600">{config.bgm.playLength}s</span>
                    </div>
                    <input type="range" min="5" max="120" step="1" value={config.bgm.playLength} 
                      onChange={(e) => setConfig(prev => ({...prev, bgm: prev.bgm ? {...prev.bgm, playLength: parseInt(e.target.value)} : null}))}
                      className="w-full h-1.5 bg-slate-100 rounded-full appearance-none cursor-pointer accent-blue-600" />
                  </div>
                  
                  <div className="space-y-2 pt-2">
                    <div className="flex justify-between text-[10px] font-black uppercase text-slate-400">
                      <span>Master Vol</span>
                      <span className="text-blue-600">{Math.round(config.bgm.volume * 100)}%</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.01" value={config.bgm.volume} 
                      onChange={(e) => setConfig(prev => ({...prev, bgm: prev.bgm ? {...prev.bgm, volume: parseFloat(e.target.value)} : null}))}
                      className="w-full h-1.5 bg-slate-100 rounded-full appearance-none cursor-pointer accent-blue-600" />
                  </div>
                </div>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center py-8 cursor-pointer border-2 border-dashed border-slate-200 rounded-2xl hover:bg-slate-50 transition-colors">
                <input type="file" accept="audio/*" onChange={handleFileUpload('bgm')} className="hidden" />
                <ICONS.Music className="w-8 h-8 text-slate-200 mb-2" />
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Incorporate BGM Track</span>
              </label>
            )}
          </section>
        </div>

        <div className="xl:col-span-8 space-y-8">
          <section className="bg-slate-950 rounded-[2.5rem] overflow-hidden aspect-video shadow-2xl border-[12px] border-slate-900 relative group">
            {config.video1 || config.video2 ? (
              <div className="w-full h-full relative">
                {config.video1 && <video src={config.video1.url} className="w-full h-full object-cover opacity-60" autoPlay muted loop />}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                   <div className="px-6 py-2 bg-blue-600/20 backdrop-blur-xl border border-white/20 rounded-full text-white text-[10px] font-black tracking-[0.3em] uppercase">
                     Local Workspace Preview
                   </div>
                </div>
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-[radial-gradient(circle_at_center,#1e293b_0%,#020617_100%)]">
                <p className="text-slate-600 font-mono text-[10px] tracking-widest font-bold uppercase">Ready for local asset injection</p>
              </div>
            )}
            
            <div className="absolute top-8 right-8 flex flex-col items-end gap-2">
               <div className="px-4 py-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl text-white text-[10px] font-mono">
                 FPS: 30 | DUR: {Math.round(totalFrames / 30)}s
               </div>
            </div>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col gap-4">
                <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                   <div className="p-1.5 bg-blue-50 rounded text-blue-600"><ICONS.Settings className="w-3 h-3" /></div>
                   Dynamic Props JSON
                </h4>
                <pre className="flex-1 bg-slate-900 text-blue-400 p-4 rounded-2xl text-[10px] font-mono border border-slate-800 overflow-auto max-h-[160px]">
{JSON.stringify({
  template: "heygen-cms-v2",
  id: config.id || "TEMP",
  bgm: config.bgm ? {
    offset: config.bgm.startTime,
    len: config.bgm.playLength,
    vol: config.bgm.volume
  } : null
}, null, 2)}
                </pre>
             </div>

             <div className="bg-blue-600 p-8 rounded-[2.5rem] text-white shadow-xl shadow-blue-100 flex flex-col justify-center">
                <h3 className="text-xl font-black mb-2 italic">PRODUCTION READY</h3>
                <p className="text-blue-100 text-[11px] leading-relaxed mb-6 font-medium">
                  When you add to queue, we snapshot these settings. You can then render 20+ videos sequentially with one click in the <span className="underline">Batch Queue</span> tab.
                </p>
                <div className="flex gap-4">
                   <div className="bg-white/10 rounded-xl p-3 flex-1 border border-white/10 text-center">
                      <p className="text-[8px] font-black uppercase text-white/50 mb-1 tracking-tighter">Render Engine</p>
                      <p className="text-xs font-bold">REMOTION 4.0</p>
                   </div>
                   <div className="bg-white/10 rounded-xl p-3 flex-1 border border-white/10 text-center">
                      <p className="text-[8px] font-black uppercase text-white/50 mb-1 tracking-tighter">Queue Limit</p>
                      <p className="text-xs font-bold">UNLIMITED</p>
                   </div>
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* Library Selection Modal */}
      {showLibraryPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/20 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white w-full max-w-lg rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
               <h3 className="font-black text-slate-900 uppercase text-xs tracking-widest">Select From Library</h3>
               <button onClick={() => setShowLibraryPicker(false)} className="text-slate-400 hover:text-slate-600 text-sm font-bold">Close</button>
            </div>
            <div className="p-4 overflow-y-auto space-y-2">
               {library.map((asset) => (
                 <button 
                  key={asset.id}
                  onClick={() => selectFromLibrary(asset)}
                  className="w-full p-4 rounded-2xl hover:bg-blue-50 transition-all border border-transparent hover:border-blue-100 flex items-center justify-between group"
                 >
                   <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-blue-600 border border-slate-100 group-hover:bg-blue-600 group-hover:text-white transition-all">
                        <ICONS.Music className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-slate-800 truncate max-w-[200px]">{asset.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Library Asset • {(asset.duration / 60).toFixed(1)}m</p>
                      </div>
                   </div>
                   <ICONS.Check className="w-5 h-5 text-blue-600 opacity-0 group-hover:opacity-100" />
                 </button>
               ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
