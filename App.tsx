
import React, { useState, useEffect } from 'react';
import { LicenseGate } from './components/LicenseGate';
import { Sidebar } from './components/Sidebar';
import { TemplateEditor } from './components/TemplateEditor';
import { BatchQueue } from './components/BatchQueue';
import { AssetLibrary } from './components/AssetLibrary';
import { ProjectConfig, LibraryAsset } from './types';

const App: React.FC = () => {
  const [isLicensed, setIsLicensed] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'workstation' | 'queue' | 'library' | 'config'>('workstation');
  const [queue, setQueue] = useState<ProjectConfig[]>([]);
  const [library, setLibrary] = useState<LibraryAsset[]>([]);

  useEffect(() => {
    const active = localStorage.getItem('heygen_license_active');
    if (active === 'true') {
      setIsLicensed(true);
    }
    setIsLoading(false);
  }, []);

  const addToQueue = (config: ProjectConfig) => {
    setQueue(prev => [...prev, { ...config, id: Math.random().toString(36).substr(2, 9) }]);
    setActiveTab('queue');
  };

  const updateQueueItem = (id: string, updates: Partial<ProjectConfig>) => {
    setQueue(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const clearQueue = () => setQueue([]);

  const addToLibrary = (asset: LibraryAsset) => {
    setLibrary(prev => [asset, ...prev]);
  };

  const removeFromLibrary = (id: string) => {
    setLibrary(prev => prev.filter(a => a.id !== id));
  };

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-white flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isLicensed) {
    return <LicenseGate onUnlock={() => setIsLicensed(true)} />;
  }

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} queueCount={queue.length} />
      <main className="flex-1 overflow-y-auto bg-slate-50/30">
        {activeTab === 'workstation' && (
          <TemplateEditor onEnqueue={addToQueue} library={library} onAddToLibrary={addToLibrary} />
        )}
        {activeTab === 'queue' && (
          <BatchQueue 
            items={queue} 
            onUpdateItem={updateQueueItem} 
            onClear={clearQueue}
          />
        )}
        {activeTab === 'library' && (
          <AssetLibrary 
            library={library} 
            onAdd={addToLibrary} 
            onRemove={removeFromLibrary} 
          />
        )}
        {activeTab === 'config' && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-8 bg-white rounded-3xl border border-slate-100 shadow-sm max-w-sm">
               <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <span className="font-bold">v2</span>
               </div>
               <h2 className="text-lg font-bold text-slate-900 mb-1">ENGINE CONFIG</h2>
               <p className="text-sm text-slate-500">Global rendering parameters and codec selection will be available in the next version.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
