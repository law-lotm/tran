import React, { useState, useCallback, useEffect } from 'react';
import ContextPanel from './components/ContextPanel';
import TranslationArea from './components/TranslationArea';
import HistoryPanel from './components/HistoryPanel';
import HealthPanel from './components/HealthPanel';
import { TranslationContext, TranslationHistoryItem, ModelType } from './types';
import { Languages, Key, Zap, Star, Cpu, Wind, Maximize2, Minimize2, ShieldCheck } from 'lucide-react';

const App: React.FC = () => {
  const [isFocusMode, setIsFocusMode] = useState(() => localStorage.getItem('mgluck_focus_mode') === 'true');
  const [context, setContext] = useState<TranslationContext>({
    movieTitle: '',
    speaker: '',
    listener: '',
    sceneDescription: '',
    tone: 'Auto',
    glossary: '',
    fewShotExamples: []
  });

  const [model] = useState<ModelType>('auto');
  const [history, setHistory] = useState<TranslationHistoryItem[]>([]);
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  useEffect(() => {
    const checkKey = async () => {
      const win = window as any;
      if (win.aistudio) {
        const has = await win.aistudio.hasSelectedApiKey();
        setHasKey(has);
      } else {
        setHasKey(true);
      }
    };
    checkKey();
  }, []);

  // Listen for teaching events from TranslationArea
  useEffect(() => {
    const handleTeach = (e: any) => {
        const { original, translated } = e.detail;
        setContext(prev => ({
            ...prev,
            fewShotExamples: [
                ...prev.fewShotExamples,
                { id: Date.now().toString(), original, translated }
            ]
        }));
    };
    window.addEventListener('teach-ai', handleTeach);
    return () => window.removeEventListener('teach-ai', handleTeach);
  }, []);

  useEffect(() => {
    localStorage.setItem('mgluck_focus_mode', isFocusMode.toString());
  }, [isFocusMode]);

  const handleSelectKey = async () => {
    const win = window as any;
    if (win.aistudio) {
      await win.aistudio.openSelectKey();
      setHasKey(true);
    }
  };

  const addToHistory = useCallback((item: TranslationHistoryItem) => {
    setHistory(prev => [item, ...prev].slice(0, 50));
  }, []);

  const clearHistory = useCallback(() => {
    if (window.confirm("Are you sure you want to clear your translation history?")) {
      setHistory([]);
    }
  }, []);

  if (hasKey === null) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-emerald-500/50 font-mono space-y-4">
        <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
        <span className="animate-pulse tracking-widest text-xs uppercase">Initializing Studio...</span>
      </div>
    );
  }

  if (hasKey === false) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4 text-center text-gray-200 font-sans relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-900/20 via-gray-950 to-gray-950 pointer-events-none"></div>
        <div className="bg-gray-900/80 backdrop-blur-xl p-8 rounded-3xl border border-gray-800 shadow-2xl max-w-lg w-full relative z-10 ring-1 ring-white/5">
          <div className="bg-gradient-to-br from-emerald-500/20 to-teal-500/10 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-emerald-500/20 shadow-[0_0_40px_rgba(16,185,129,0.15)]">
            <Languages className="text-emerald-400" size={36} />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent mb-3 bg-[length:200%_auto] animate-gradient">
            Mg Luck Translator
          </h1>
          <p className="text-gray-400 mb-8 leading-relaxed text-sm">
            Professional Burmese subtitle localization powered by Gemini AI. 
            <br/>Experience studio-quality translation with context awareness.
          </p>
          <button 
            onClick={handleSelectKey}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white px-8 py-4 rounded-xl font-bold transition-all shadow-lg shadow-emerald-900/40 active:scale-[0.98] group relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
            <Key size={18} className="group-hover:rotate-12 transition-transform relative z-10" />
            <span className="relative z-10">Connect API Key</span>
          </button>
          <div className="mt-8 pt-6 border-t border-gray-800 text-[10px] text-gray-600 flex justify-between items-center">
            <span>Myanmar Orthography Compliant</span>
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-emerald-500/60 hover:text-emerald-400 hover:underline transition-colors">
              Billing Information
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 font-sans selection:bg-emerald-500/30 selection:text-emerald-200 relative overflow-x-hidden">
      {/* Background Gradients - Optimized for mobile */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] sm:w-[40%] sm:h-[40%] bg-emerald-900/10 rounded-full blur-[64px] sm:blur-[128px] will-change-transform"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] sm:w-[40%] sm:h-[40%] bg-teal-900/10 rounded-full blur-[64px] sm:blur-[128px] will-change-transform"></div>
      </div>
      
      {/* Header */}
      <header className="border-b border-gray-800/60 bg-gray-950/90 sm:bg-gray-950/70 backdrop-blur-md sm:backdrop-blur-xl sticky top-0 z-50 transition-all duration-300 will-change-transform">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 group cursor-default">
            <div className="bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)] group-hover:shadow-[0_0_20px_rgba(16,185,129,0.2)] transition-shadow duration-500">
              <Languages className="text-emerald-400 group-hover:scale-110 transition-transform duration-300" size={20} />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent tracking-tight">
                Mg Luck Translator
              </h1>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <p className="text-[10px] text-gray-500 font-medium tracking-widest uppercase hidden sm:block">
                  AI Subtitle Studio
                </p>
                <p className="text-[9px] text-gray-500 font-medium tracking-widest uppercase sm:hidden">
                  AI Studio
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsFocusMode(!isFocusMode)}
              className={`p-2 rounded-lg transition-all duration-300 border ${
                isFocusMode 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                  : 'bg-gray-900/80 border-gray-800 text-gray-500 hover:text-gray-300'
              }`}
              title={isFocusMode ? "Exit Focus Mode" : "Enter Focus Mode"}
            >
              {isFocusMode ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>

            <div className="hidden md:flex items-center gap-2 bg-emerald-500/5 px-3 py-1.5 rounded-lg border border-emerald-500/20">
              <ShieldCheck size={14} className="text-emerald-400" />
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">System Optimized</span>
            </div>

            <div className="flex items-center gap-2 bg-emerald-500/5 px-4 py-2 rounded-full border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]">
              <div className="relative flex items-center justify-center">
                <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping"></div>
                <Cpu size={14} className="text-emerald-400 relative z-10" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest leading-none">AI Auto Selector</span>
                <span className="text-[8px] text-gray-500 font-medium uppercase tracking-tighter">Optimizing for Quality</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-4 sm:py-8 relative z-10">
        <div className={`grid grid-cols-1 ${isFocusMode ? 'lg:grid-cols-1' : 'lg:grid-cols-12'} gap-5 lg:gap-8 items-start transition-all duration-500`}>
          
          {/* Left Column: Controls & Translation */}
          <div className={`${isFocusMode ? 'lg:col-span-1 max-w-4xl mx-auto w-full' : 'lg:col-span-8'} flex flex-col gap-4 sm:gap-6 transition-all duration-500`}>
            <ContextPanel context={context} setContext={setContext} />
            <TranslationArea context={context} onAddToHistory={addToHistory} model={model} />
          </div>

          {/* Right Column: Health & History */}
          {!isFocusMode && (
            <div className="lg:col-span-4 flex flex-col gap-4 sm:gap-6 lg:sticky lg:top-24 animate-in fade-in slide-in-from-right-4 duration-500">
              {/* Reorder for mobile: Health first usually better for debug, then history */}
              <HealthPanel />
              <HistoryPanel history={history} onClearHistory={clearHistory} />
            </div>
          )}

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800/50 mt-12 bg-gray-950/80 py-8 relative z-10 pb-20 sm:pb-8">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-600 text-xs">
          <p className="font-medium">© {new Date().getFullYear()} Mg Luck AI Tools</p>
          <p className="mt-1 opacity-60">Strictly adhering to Myanmar Orthography & Spoken Forms.</p>
        </div>
      </footer>
    </div>
  );
};

export default App;