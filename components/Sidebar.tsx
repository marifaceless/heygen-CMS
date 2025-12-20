
import React, { useState, useEffect } from 'react';
import { ICONS } from '../constants';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  queueCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, queueCount }) => {
  const activeKey = localStorage.getItem('heygen_license_key') || 'ST-2024-UNSET';
  const [ramUsage, setRamUsage] = useState(12);

  useEffect(() => {
    const interval = setInterval(() => {
      setRamUsage(prev => Math.max(8, Math.min(64, prev + (Math.random() * 4 - 2))));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const items = [
    { id: 'workstation', label: 'Workstation', icon: ICONS.Video },
    { id: 'queue', label: 'Batch Queue', icon: ICONS.Download, badge: queueCount },
    { id: 'library', label: 'Asset Library', icon: ICONS.Music },
    { id: 'config', label: 'Engine Config', icon: ICONS.Settings },
  ];

  return (
    <aside className="w-20 lg:w-72 bg-white border-r border-slate-100 flex flex-col transition-all relative z-20 shadow-[1px_0_10px_rgba(0,0,0,0.02)]">
      <div className="p-8 flex items-center gap-4">
        <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-blue-100 border-b-4 border-blue-800">
          <span className="text-white font-black text-sm italic">HG</span>
        </div>
        <div className="hidden lg:block overflow-hidden">
          <span className="block font-black text-slate-900 tracking-tight leading-none text-lg uppercase">Local CMS</span>
          <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Station Alpha</span>
        </div>
      </div>

      <nav className="flex-1 px-6 space-y-3 mt-4">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all group relative ${
              activeTab === item.id 
                ? 'bg-blue-600 text-white shadow-xl shadow-blue-100' 
                : 'text-slate-400 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <item.icon className="w-5 h-5 shrink-0" />
            <span className="hidden lg:block text-sm font-bold tracking-tight">{item.label}</span>
            {item.badge && item.badge > 0 && (
              <span className={`absolute right-4 px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                activeTab === item.id ? 'bg-white text-blue-600' : 'bg-blue-600 text-white'
              }`}>
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="p-8 space-y-6">
        <div className="hidden lg:block space-y-4">
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
             <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Local RAM Buffer</p>
                <div className="w-full bg-slate-200 h-1 rounded-full overflow-hidden">
                   <div className="bg-blue-500 h-full transition-all duration-1000" style={{ width: `${ramUsage}%` }}></div>
                </div>
             </div>
             <div className="flex justify-between items-center">
                <p className="text-[9px] font-black text-slate-400 uppercase">License Key</p>
                <p className="text-[10px] font-mono font-bold text-blue-600 truncate max-w-[80px]">{activeKey}</p>
             </div>
          </div>
          
          <div className="flex items-center gap-2 px-1">
             <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
             <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Remotion Engine: Idle</span>
          </div>
        </div>
        
        <button 
          onClick={() => {
            localStorage.removeItem('heygen_license_active');
            localStorage.removeItem('heygen_license_key');
            window.location.reload();
          }}
          className="w-full py-4 text-center text-[10px] text-slate-300 hover:text-red-500 font-black uppercase tracking-[0.3em] transition-all hover:bg-red-50 rounded-2xl"
        >
          Relinquish Station
        </button>
      </div>
    </aside>
  );
};
