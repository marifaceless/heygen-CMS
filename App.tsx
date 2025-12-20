
import React, { useState, useEffect, useRef } from 'react';
import { LicenseGate } from './components/LicenseGate';
import { Sidebar } from './components/Sidebar';
import { TemplateEditor } from './components/TemplateEditor';
import { BatchQueue } from './components/BatchQueue';
import { AssetLibrary } from './components/AssetLibrary';
import { EngineConfig } from './components/EngineConfig';
import { ProjectConfig, LibraryAsset } from './types';
import { LicenseRecord, loadLicenseFile, validateLicenseKey } from './license';
import { loadPersistedState, hydratePersistedState, savePersistedState } from './storage';
import { deleteMediaBlob } from './mediaStore';

const App: React.FC = () => {
  const [isLicensed, setIsLicensed] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'workstation' | 'queue' | 'library' | 'config'>('workstation');
  const [queue, setQueue] = useState<ProjectConfig[]>([]);
  const [library, setLibrary] = useState<LibraryAsset[]>([]);
  const [licenses, setLicenses] = useState<LicenseRecord[] | null>(null);
  const [licenseLoadError, setLicenseLoadError] = useState<string | null>(null);
  const [appStateLoaded, setAppStateLoaded] = useState(false);
  const activeJobPolls = useRef(new Map<string, { cancelled: boolean }>());

  useEffect(() => {
    let cancelled = false;

    const loadAppState = async () => {
      const persisted = loadPersistedState();
      if (!persisted) {
        if (!cancelled) {
          setAppStateLoaded(true);
        }
        return;
      }

      try {
        const hydrated = await hydratePersistedState(persisted);
        if (cancelled) {
          return;
        }
        setQueue(hydrated.queue);
        setLibrary(hydrated.library);
        setActiveTab(hydrated.activeTab);
      } catch (error) {
        console.warn('[storage] Unable to hydrate local state.', error);
      } finally {
        if (!cancelled) {
          setAppStateLoaded(true);
        }
      }
    };

    loadAppState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadLicenses = async () => {
      try {
        const data = await loadLicenseFile();
        if (cancelled) {
          return;
        }
        setLicenses(data.licenses);
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : 'Unable to load license list.';
        setLicenseLoadError(message);
        setLicenses([]);
      }
    };

    loadLicenses();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (licenses === null) {
      return;
    }

    const storedKey = localStorage.getItem('heygen_license_key') || '';
    if (storedKey) {
      const result = validateLicenseKey(storedKey, licenses);
      if (result.ok) {
        setIsLicensed(true);
        localStorage.setItem('heygen_license_active', 'true');
      } else {
        localStorage.removeItem('heygen_license_active');
        localStorage.removeItem('heygen_license_key');
        setIsLicensed(false);
      }
    }

  }, [licenses]);

  useEffect(() => {
    if (licenses !== null && appStateLoaded) {
      setIsLoading(false);
    }
  }, [licenses, appStateLoaded]);

  useEffect(() => {
    if (!appStateLoaded) {
      return;
    }

    const timeout = window.setTimeout(() => {
      savePersistedState({ activeTab, queue, library });
    }, 400);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [activeTab, queue, library, appStateLoaded]);

  const startPolling = (jobId: string, itemId: string) => {
    if (activeJobPolls.current.has(jobId)) {
      return;
    }
    const controller = { cancelled: false };
    activeJobPolls.current.set(jobId, controller);

    const poll = async () => {
      try {
        while (!controller.cancelled) {
          const response = await fetch(`/api/render/${jobId}`);
          if (!response.ok) {
            if (response.status === 404) {
              updateQueueItem(itemId, {
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

          if (status === 'queued' || status === 'rendering' || status === 'cancelling' || status === 'normalizing') {
            updateQueueItem(itemId, {
              status: 'RENDERING',
              progress,
              outputUrl: undefined,
              errorMessage: undefined,
            });
          }

          if (status === 'completed') {
            updateQueueItem(itemId, {
              status: 'COMPLETED',
              progress: 100,
              outputUrl: data.outputUrl || undefined,
              errorMessage: undefined,
            });
            return;
          }

          if (status === 'failed') {
            updateQueueItem(itemId, {
              status: 'FAILED',
              progress,
              errorMessage: data.error || 'Render failed.',
            });
            return;
          }

          if (status === 'cancelled') {
            updateQueueItem(itemId, {
              status: 'CANCELLED',
              progress,
              errorMessage: data.error || 'Render cancelled by user.',
            });
            return;
          }

          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      } catch (error) {
        if (!controller.cancelled) {
          updateQueueItem(itemId, {
            status: 'FAILED',
            progress: 0,
            errorMessage: error instanceof Error ? error.message : 'Render status check failed.',
          });
        }
      } finally {
        activeJobPolls.current.delete(jobId);
      }
    };

    poll();
  };

  useEffect(() => {
    if (!appStateLoaded) {
      return;
    }

    queue.forEach((item) => {
      if (item.status === 'RENDERING' && item.jobId) {
        startPolling(item.jobId, item.id);
      }
    });
  }, [queue, appStateLoaded]);

  useEffect(() => {
    return () => {
      activeJobPolls.current.forEach((controller) => {
        controller.cancelled = true;
      });
      activeJobPolls.current.clear();
    };
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

  const resetQueueAfterCacheClear = () => {
    setQueue((prev) =>
      prev.map((item) => ({
        ...item,
        status: 'PENDING',
        progress: 0,
        outputUrl: undefined,
        errorMessage: undefined,
        jobId: undefined,
      }))
    );
  };

  const removeFromLibrary = (id: string) => {
    const assetName = library.find((asset) => asset.id === id)?.name || 'this asset';
    const referenced = queue.filter(
      (item) => item.bgm?.id === id || item.video1?.id === id || item.video2?.id === id
    );

    if (referenced.length > 0) {
      const preview = referenced
        .slice(0, 6)
        .map((item) => `- ${item.name}`)
        .join('\n');
      const more = referenced.length > 6 ? `\n...and ${referenced.length - 6} more.` : '';
      const confirmed = window.confirm(
        [
          `Delete "${assetName}" from Asset Library?`,
          '',
          `This asset is used in ${referenced.length} queued item(s):`,
          preview + more,
          '',
          'If you continue, it will be removed from those items and deleted from this device.',
          'Continue?',
        ].join('\n')
      );
      if (!confirmed) {
        return;
      }

      setQueue((prev) =>
        prev.map((item) => {
          const usesAsset = item.bgm?.id === id || item.video1?.id === id || item.video2?.id === id;
          if (!usesAsset) {
            return item;
          }
          return {
            ...item,
            bgm: item.bgm?.id === id ? null : item.bgm,
            video1: item.video1?.id === id ? null : item.video1,
            video2: item.video2?.id === id ? null : item.video2,
            status: 'PENDING',
            progress: 0,
            outputUrl: undefined,
            jobId: undefined,
            errorMessage: `Removed "${assetName}" from library. Please re-select media.`,
          };
        })
      );
    }

    setLibrary((prev) => prev.filter((asset) => asset.id !== id));
    deleteMediaBlob(id).catch((error) => {
      console.warn('[media] Failed to remove blob.', error);
    });

    fetch(`/api/asset/${encodeURIComponent(id)}/purge`, { method: 'POST' }).catch(() => {
      // render server may not be running; local blob deletion is the source-of-truth
    });
  };

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-white flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isLicensed) {
    return (
      <LicenseGate
        licenses={licenses ?? []}
        licenseLoadError={licenseLoadError}
        onUnlock={() => setIsLicensed(true)}
      />
    );
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
          <EngineConfig onCacheCleared={resetQueueAfterCacheClear} />
        )}
      </main>
    </div>
  );
};

export default App;
