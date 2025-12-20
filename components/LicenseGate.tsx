
import React, { useState } from 'react';
import { ICONS, VALID_KEYS } from '../constants';

interface LicenseGateProps {
  onUnlock: () => void;
}

export const LicenseGate: React.FC<LicenseGateProps> = ({ onUnlock }) => {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');

  const handleValidate = () => {
    const sanitizedKey = key.trim().toUpperCase();
    if (VALID_KEYS.includes(sanitizedKey)) {
      localStorage.setItem('heygen_license_active', 'true');
      localStorage.setItem('heygen_license_key', sanitizedKey);
      onUnlock();
    } else {
      setError('This license key is not recognized. Please verify your partner credentials.');
    }
  };

  return (
    <div className="fixed inset-0 bg-white flex items-center justify-center p-4">
      {/* Background patterns for a professional local-tool feel */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#2563eb 1px, transparent 1px)', backgroundSize: '32px 32px' }}></div>
      
      <div className="max-w-md w-full bg-white rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-slate-100 p-10 relative z-10">
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
            <ICONS.Key className="w-8 h-8 text-white" />
          </div>
        </div>
        
        <h1 className="text-3xl font-bold text-center text-slate-900 mb-2 tracking-tight">Access Terminal</h1>
        <p className="text-center text-slate-500 mb-10 text-sm leading-relaxed">
          The HeyGen CMS Station requires a valid partner license. <br/>
          <span className="font-medium text-blue-600">Please enter your 16-character key below.</span>
        </p>

        <div className="space-y-6">
          <div className="relative">
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Station License Key</label>
            <input
              type="text"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleValidate()}
              placeholder="HEYGEN-XXXX-XXXX"
              className="w-full px-5 py-4 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all uppercase font-mono text-center tracking-[0.2em] placeholder:text-slate-300"
            />
            {error && (
              <div className="mt-3 flex items-center gap-2 text-red-500 bg-red-50 p-3 rounded-xl border border-red-100 animate-shake">
                <ICONS.Info className="w-4 h-4" />
                <p className="text-xs font-semibold">{error}</p>
              </div>
            )}
          </div>

          <button
            onClick={handleValidate}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl shadow-xl shadow-blue-100 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            Authenticate Station
          </button>
        </div>

        <div className="mt-10 pt-8 border-t border-slate-50 text-center">
          <p className="text-xs text-slate-400 mb-1">Authenticated via Remotion Runtime</p>
          <div className="flex justify-center gap-4 text-xs font-semibold text-blue-600/60">
            <a href="#" className="hover:text-blue-600">Documentation</a>
            <span className="text-slate-200">•</span>
            <a href="#" className="hover:text-blue-600">Support</a>
          </div>
        </div>
      </div>
    </div>
  );
};
