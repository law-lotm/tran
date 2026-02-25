import React, { useEffect, useState, useMemo } from 'react';
import { Activity, Wifi, WifiOff, AlertTriangle, RefreshCw, BarChart2, Zap, RotateCcw, Cpu, Layers, AlertOctagon, Clock, Wind, Star } from 'lucide-react';
import { getMetrics, subscribeMetrics, checkSystemHealth, resetSystemHealth, checkModelConnection } from '../services/geminiService';
import { APIMetrics } from '../types';

interface EngineStatus {
  latency: number;
  status: 'IDLE' | 'HEALTHY' | 'DEGRADED' | 'DOWN';
  checking: boolean;
}

const HealthPanel: React.FC = () => {
  const [metrics, setMetrics] = useState<APIMetrics>(getMetrics());
  
  const [flash, setFlash] = useState<EngineStatus>({ latency: 0, status: 'IDLE', checking: false });
  const [pro, setPro] = useState<EngineStatus>({ latency: 0, status: 'IDLE', checking: false });
  const [pro31, setPro31] = useState<EngineStatus>({ latency: 0, status: 'IDLE', checking: false });
  const [lite, setLite] = useState<EngineStatus>({ latency: 0, status: 'IDLE', checking: false });
  const [lowPowerMode, setLowPowerMode] = useState(() => localStorage.getItem('mgluck_low_power') === 'true');

  useEffect(() => {
    localStorage.setItem('mgluck_low_power', lowPowerMode.toString());
    if (lowPowerMode) {
      document.documentElement.classList.add('low-power');
    } else {
      document.documentElement.classList.remove('low-power');
    }
  }, [lowPowerMode]);

  useEffect(() => {
    const unsubscribe = subscribeMetrics(() => {
      setMetrics(getMetrics());
    });
    // Initial Check
    runEngineChecks();
    return unsubscribe;
  }, []);

  const runEngineChecks = async () => {
    // Lite Check
    setLite(prev => ({ ...prev, checking: true }));
    const lRes = await checkModelConnection('gemini-flash-lite-latest');
    setLite({
      latency: lRes.latency,
      status: lRes.ok ? (lRes.latency > 1000 ? 'DEGRADED' : 'HEALTHY') : 'DOWN',
      checking: false
    });

    // Flash Check
    setFlash(prev => ({ ...prev, checking: true }));
    const fRes = await checkModelConnection('gemini-3-flash-preview');
    setFlash({
      latency: fRes.latency,
      status: fRes.ok ? (fRes.latency > 1000 ? 'DEGRADED' : 'HEALTHY') : 'DOWN',
      checking: false
    });

    // Pro Check
    setPro(prev => ({ ...prev, checking: true }));
    const pRes = await checkModelConnection('gemini-3-pro-preview');
    setPro({
      latency: pRes.latency,
      status: pRes.ok ? (pRes.latency > 2000 ? 'DEGRADED' : 'HEALTHY') : 'DOWN',
      checking: false
    });

    // Pro 3.1 Check
    setPro31(prev => ({ ...prev, checking: true }));
    const p31Res = await checkModelConnection('gemini-3.1-pro-preview');
    setPro31({
      latency: p31Res.latency,
      status: p31Res.ok ? (p31Res.latency > 2000 ? 'DEGRADED' : 'HEALTHY') : 'DOWN',
      checking: false
    });
    
    // Also run global system health update for the metrics object
    checkSystemHealth();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'HEALTHY': return 'text-emerald-400';
      case 'DEGRADED': return 'text-yellow-400';
      case 'DOWN': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'HEALTHY': return 'bg-emerald-500/10 border-emerald-500/20';
      case 'DEGRADED': return 'bg-yellow-500/10 border-yellow-500/20';
      case 'DOWN': return 'bg-red-500/10 border-red-500/20';
      default: return 'bg-gray-800/30 border-gray-700/30';
    }
  };

  // Improved Error Parsing Logic
  const errorDetails = useMemo(() => {
    if (!metrics.lastError) return null;
    
    let msg = metrics.lastError;
    let rawMsg = msg;

    // Try parsing if it looks like JSON object (sometimes raw API response bubbles up)
    if (msg.trim().startsWith('{')) {
        try {
            const parsed = JSON.parse(msg);
            if (parsed.error && parsed.error.message) {
                msg = parsed.error.message;
            } else if (parsed.message) {
                msg = parsed.message;
            }
        } catch {}
    }

    const lowerMsg = msg.toLowerCase();

    // 429 Quota Exceeded
    if (msg.includes('429') || lowerMsg.includes('quota') || lowerMsg.includes('exceeded')) {
        return {
            title: 'Usage Limit Hit (429)',
            msg: 'Free tier quota exceeded.',
            suggestion: 'System is auto-pausing. Please wait 30s.',
            color: 'text-yellow-400',
            bg: 'bg-yellow-500/10',
            border: 'border-yellow-500/20',
            icon: Clock
        };
    }
    
    // 503 Service Overloaded
    if (msg.includes('503') || lowerMsg.includes('overloaded') || lowerMsg.includes('unavailable')) {
         return {
            title: 'Service Overloaded',
            msg: 'Gemini AI is experiencing high traffic.',
            suggestion: 'Retrying automatically in a moment.',
             color: 'text-orange-400',
            bg: 'bg-orange-500/10',
            border: 'border-orange-500/20',
            icon: Activity
        };
    }

    // Network / Connection
    if (lowerMsg.includes('fetch') || lowerMsg.includes('network')) {
        return {
            title: 'Network Error',
            msg: 'Connection to Google failed.',
            suggestion: 'Check your internet connection.',
            color: 'text-red-400',
            bg: 'bg-red-500/10',
            border: 'border-red-500/20',
            icon: WifiOff
        };
    }

    // Generic Error
    return {
        title: 'API Error',
        msg: msg.length > 80 ? msg.substring(0, 80) + '...' : msg,
        suggestion: 'Try resetting the monitor or reloading.',
        color: 'text-red-400',
        bg: 'bg-red-500/10',
        border: 'border-red-500/20',
        icon: AlertOctagon
    };
  }, [metrics.lastError]);

  const isChecking = flash.checking || pro.checking || pro31.checking || lite.checking;

  return (
    <div className="bg-gray-900/40 backdrop-blur-sm rounded-2xl border border-gray-800 shadow-sm p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-emerald-400" />
          <h2 className="font-bold text-gray-200 text-xs uppercase tracking-widest">Engine Status</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-gray-950/50 px-2 py-1 rounded-md border border-gray-800">
             <div className={`w-1.5 h-1.5 rounded-full ${metrics.failedRequests > 5 ? 'bg-red-500 animate-pulse' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'}`}></div>
             <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">System Load: {metrics.failedRequests > 5 ? 'High' : 'Stable'}</span>
          </div>
          <button 
            onClick={runEngineChecks}
            disabled={isChecking}
            className={`p-1.5 rounded-lg hover:bg-gray-800/50 transition-all ${isChecking ? 'animate-spin text-emerald-400' : 'text-gray-500 hover:text-emerald-400'}`}
            title="Refresh Connections"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Engine Cards */}
      <div className="grid grid-cols-2 gap-3">
        {/* Lite Engine */}
        <div className={`rounded-xl p-3 border transition-colors duration-300 ${getStatusBg(lite.status)}`}>
            <div className="flex justify-between items-start mb-2">
               <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                  <Wind size={10} /> Lite
               </div>
               <span className={`w-2 h-2 rounded-full ${lite.checking ? 'bg-gray-400 animate-pulse' : (lite.status === 'HEALTHY' ? 'bg-emerald-400' : (lite.status === 'DOWN' ? 'bg-red-400' : 'bg-yellow-400'))}`}></span>
            </div>
            <div className="flex items-baseline justify-between">
                <span className={`text-xs font-bold ${getStatusColor(lite.status)}`}>
                   {lite.checking ? '...' : lite.status}
                </span>
                <span className="text-[10px] font-mono text-gray-500">
                   {lite.latency > 0 ? `${lite.latency}ms` : '--'}
                </span>
            </div>
        </div>

        {/* Flash Engine */}
        <div className={`rounded-xl p-3 border transition-colors duration-300 ${getStatusBg(flash.status)}`}>
            <div className="flex justify-between items-start mb-2">
               <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                  <Zap size={10} /> Flash
               </div>
               <span className={`w-2 h-2 rounded-full ${flash.checking ? 'bg-gray-400 animate-pulse' : (flash.status === 'HEALTHY' ? 'bg-emerald-400' : (flash.status === 'DOWN' ? 'bg-red-400' : 'bg-yellow-400'))}`}></span>
            </div>
            <div className="flex items-baseline justify-between">
                <span className={`text-xs font-bold ${getStatusColor(flash.status)}`}>
                   {flash.checking ? '...' : flash.status}
                </span>
                <span className="text-[10px] font-mono text-gray-500">
                   {flash.latency > 0 ? `${flash.latency}ms` : '--'}
                </span>
            </div>
        </div>

        {/* Pro Engine */}
        <div className={`rounded-xl p-3 border transition-colors duration-300 ${getStatusBg(pro.status)}`}>
            <div className="flex justify-between items-start mb-2">
               <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                  <Star size={10} /> Pro
               </div>
               <span className={`w-2 h-2 rounded-full ${pro.checking ? 'bg-gray-400 animate-pulse' : (pro.status === 'HEALTHY' ? 'bg-emerald-400' : (pro.status === 'DOWN' ? 'bg-red-400' : 'bg-yellow-400'))}`}></span>
            </div>
            <div className="flex items-baseline justify-between">
                <span className={`text-xs font-bold ${getStatusColor(pro.status)}`}>
                   {pro.checking ? '...' : pro.status}
                </span>
                <span className="text-[10px] font-mono text-gray-500">
                   {pro.latency > 0 ? `${pro.latency}ms` : '--'}
                </span>
            </div>
        </div>

        {/* Pro 3.1 Engine */}
        <div className={`rounded-xl p-3 border transition-colors duration-300 ${getStatusBg(pro31.status)}`}>
            <div className="flex justify-between items-start mb-2">
               <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                  <Cpu size={10} /> Pro 3.1
               </div>
               <span className={`w-2 h-2 rounded-full ${pro31.checking ? 'bg-gray-400 animate-pulse' : (pro31.status === 'HEALTHY' ? 'bg-emerald-400' : (pro31.status === 'DOWN' ? 'bg-red-400' : 'bg-yellow-400'))}`}></span>
            </div>
            <div className="flex items-baseline justify-between">
                <span className={`text-xs font-bold ${getStatusColor(pro31.status)}`}>
                   {pro31.checking ? '...' : pro31.status}
                </span>
                <span className="text-[10px] font-mono text-gray-500">
                   {pro31.latency > 0 ? `${pro31.latency}ms` : '--'}
                </span>
            </div>
        </div>
      </div>

      {/* Token Usage Stats & Reservoir */}
      <div className="space-y-3">
        {metrics.isCircuitOpen && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center gap-3 animate-pulse">
            <AlertTriangle size={16} className="text-red-400" />
            <div className="flex-1">
              <p className="text-[10px] font-bold text-red-400 uppercase tracking-tight">Circuit Breaker Open</p>
              <p className="text-[9px] text-red-400/70">System cooling down due to failures.</p>
            </div>
          </div>
        )}
        <div className="bg-gray-950/40 rounded-xl p-3 border border-gray-800/50 flex items-center justify-between">
           <div className="flex items-center gap-2">
              <div className="p-1.5 bg-gray-800 rounded-lg text-gray-400">
                 <Layers size={14} />
              </div>
              <div>
                 <p className="text-[9px] text-gray-500 font-bold uppercase">Session Tokens</p>
                 <p className="text-xs text-gray-200 font-mono font-medium">
                    {metrics.totalTokensUsed.toLocaleString()}
                 </p>
              </div>
           </div>
           <div className="text-[9px] text-emerald-500/70 font-medium bg-emerald-500/5 px-2 py-1 rounded-md">
              Active
           </div>
        </div>

        {/* Local Token Reservoir */}
        <div className="bg-gray-950/60 rounded-xl p-3 border border-emerald-500/10 space-y-2">
           <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                 <BarChart2 size={12} className="text-emerald-400" />
                 <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tight">Daily Reservoir</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 font-bold">
                 {Math.round((metrics.reservoirTokens / 500000) * 100)}%
              </span>
           </div>
           
           <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-1000"
                style={{ width: `${(metrics.reservoirTokens / 500000) * 100}%` }}
              />
           </div>
           
           <div className="flex justify-between text-[9px] text-gray-500 font-mono">
              <span>{metrics.reservoirTokens.toLocaleString()} left</span>
              <span>500K cap</span>
           </div>
        </div>
      </div>

      {/* Detailed Stats (Compact) */}
      <div className="grid grid-cols-3 gap-2 text-[10px]">
           <div className="text-center py-1.5 bg-gray-950/30 rounded-lg border border-gray-800/30">
             <div className="text-gray-500 mb-0.5">Reqs</div>
             <div className="font-mono text-gray-300">{metrics.totalRequests}</div>
           </div>
           <div className="text-center py-1.5 bg-gray-950/30 rounded-lg border border-gray-800/30">
             <div className="text-gray-500 mb-0.5">Rate</div>
             <div className={`font-mono ${metrics.rateLimitCount > 0 ? 'text-yellow-400' : 'text-gray-300'}`}>
               {metrics.rateLimitCount}
             </div>
           </div>
           <div className="text-center py-1.5 bg-gray-950/30 rounded-lg border border-gray-800/30">
             <div className="text-gray-500 mb-0.5">Err</div>
             <div className={`font-mono ${metrics.failedRequests > 0 ? 'text-red-400' : 'text-gray-300'}`}>
               {metrics.failedRequests}
             </div>
           </div>
      </div>
      
      {/* Enhanced Error Display */}
      {errorDetails && (
          <div className={`rounded-xl p-3 border ${errorDetails.bg} ${errorDetails.border} flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2`}>
             <div className={`flex items-center gap-2 text-xs font-bold ${errorDetails.color}`}>
                <errorDetails.icon size={14} className="shrink-0" />
                <span>{errorDetails.title}</span>
             </div>
             <p className="text-[10px] text-gray-300 leading-relaxed font-mono bg-black/20 p-2 rounded">
                "{errorDetails.msg}"
             </p>
             {errorDetails.suggestion && (
                <div className="flex items-center gap-1.5 text-[9px] text-gray-400 font-medium">
                   <span className="text-yellow-500/80">💡</span> 
                   {errorDetails.suggestion}
                </div>
             )}
          </div>
      )}

      <div className="pt-2 border-t border-gray-800/50 space-y-2">
          <button 
              onClick={() => setLowPowerMode(!lowPowerMode)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all text-[10px] font-medium border ${lowPowerMode ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-gray-800/30 border-gray-700/50 text-gray-500 hover:text-gray-300'}`}
          >
              <div className="flex items-center gap-2">
                <Zap size={12} className={lowPowerMode ? 'fill-emerald-400' : ''} />
                <span>Mobile Optimization</span>
              </div>
              <div className={`w-6 h-3 rounded-full relative transition-colors ${lowPowerMode ? 'bg-emerald-500' : 'bg-gray-700'}`}>
                <div className={`absolute top-0.5 w-2 h-2 bg-white rounded-full transition-all ${lowPowerMode ? 'left-3.5' : 'left-0.5'}`} />
              </div>
          </button>

          <button 
              onClick={() => {
                  resetSystemHealth();
                  runEngineChecks();
              }}
              className="w-full flex items-center justify-center gap-2 py-2 bg-gray-800/50 hover:bg-gray-800 text-gray-400 hover:text-gray-200 text-[10px] rounded-lg transition-colors font-medium"
          >
              <RotateCcw size={12} />
              <span>Reset Monitor</span>
          </button>
      </div>
    </div>
  );
};

export default HealthPanel;