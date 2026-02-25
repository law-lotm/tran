import React, { useState, useMemo } from 'react';
import { TranslationContext } from '../types';
import { Settings2, User, Users, Clapperboard, Mic2, Sparkles, Film, Book, Plus, X, ArrowRight, ChevronDown, ChevronUp, Brain } from 'lucide-react';

interface ContextPanelProps {
  context: TranslationContext;
  setContext: React.Dispatch<React.SetStateAction<TranslationContext>>;
}

const ContextPanel: React.FC<ContextPanelProps> = ({ context, setContext }) => {
  const [termInput, setTermInput] = useState('');
  const [defInput, setDefInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(false); // Collapsed by default on mobile load, user can toggle

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setContext(prev => ({ ...prev, [name]: value }));
  };

  const terms = useMemo(() => {
    if (!context.glossary) return [];
    return context.glossary
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => {
        const splitIndex = line.indexOf(':');
        if (splitIndex !== -1) {
            return { 
                term: line.substring(0, splitIndex).trim(), 
                def: line.substring(splitIndex + 1).trim() 
            };
        }
        return { term: line.trim(), def: '?' };
      });
  }, [context.glossary]);

  const addTerm = () => {
    if (!termInput.trim() || !defInput.trim()) return;
    const newEntry = `${termInput.trim()}: ${defInput.trim()}`;
    const newGlossary = context.glossary 
      ? `${context.glossary}\n${newEntry}` 
      : newEntry;
    
    setContext(prev => ({ ...prev, glossary: newGlossary }));
    setTermInput('');
    setDefInput('');
  };

  const removeTerm = (indexToRemove: number) => {
    const lines = context.glossary.split('\n').filter(line => line.trim().length > 0);
    const newLines = lines.filter((_, idx) => idx !== indexToRemove);
    setContext(prev => ({ ...prev, glossary: newLines.join('\n') }));
  };

  // Check if any context is set
  const hasContext = context.movieTitle || context.speaker || context.listener || context.sceneDescription || context.glossary;
  const learnedCount = context.fewShotExamples?.length || 0;

  return (
    <div className="bg-gray-900/40 backdrop-blur-sm rounded-2xl border border-gray-800 shadow-sm relative overflow-hidden group">
      {/* Header / Toggle Bar */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-4 sm:p-6 flex items-center justify-between cursor-pointer hover:bg-gray-800/30 transition-colors"
      >
        <div className="flex items-center gap-2 text-emerald-400">
          <Settings2 size={18} />
          <h3 className="font-semibold text-xs uppercase tracking-widest">Context & Engine</h3>
          {!isExpanded && (hasContext || learnedCount > 0) && (
             <span className="ml-2 w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          )}
        </div>
        <div className="flex items-center gap-3">
            {!isExpanded && (
                <div className="hidden sm:flex items-center gap-2">
                    {learnedCount > 0 && (
                      <div className="flex items-center gap-1.5 text-[10px] font-medium text-blue-400/90 bg-blue-950/40 px-3 py-1.5 rounded-full border border-blue-900/40">
                          <Brain size={10} />
                          <span>{learnedCount} Learned</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-500/90 bg-emerald-950/40 px-3 py-1.5 rounded-full border border-emerald-900/40">
                        <Sparkles size={10} />
                        <span>{context.tone}</span>
                    </div>
                </div>
            )}
            {isExpanded ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
        </div>
      </div>
      
      {/* Decorative gradient blob */}
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-emerald-500/10 transition-colors duration-700"></div>

      {/* Expanded Content */}
      <div className={`px-4 sm:px-6 pb-6 transition-all duration-300 ease-in-out ${isExpanded ? 'opacity-100 max-h-[1200px]' : 'opacity-0 max-h-0 pb-0 overflow-hidden'}`}>
        
        {/* Removed Engine Memory UI Section but keeping functionality in background */}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-6 relative z-10 pt-2 border-t border-gray-800/50">
          {/* Movie Title Input */}
          <div className="space-y-2 md:col-span-2">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
              <Film size={12} className="text-gray-600" /> Source Material
            </label>
            <input
              type="text"
              name="movieTitle"
              value={context.movieTitle}
              onChange={handleChange}
              placeholder="e.g. Breaking Bad..."
              className="w-full bg-gray-950/80 border border-gray-800 rounded-xl px-4 py-3 text-sm focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10 focus:outline-none transition-all placeholder:text-gray-700 font-medium text-emerald-100 shadow-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
              <User size={12} className="text-gray-600" /> Speaker (Me)
            </label>
            <input
              type="text"
              name="speaker"
              value={context.speaker}
              onChange={handleChange}
              placeholder="e.g. John"
              className="w-full bg-gray-950/50 border border-gray-800 rounded-xl px-4 py-3 text-sm focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10 focus:outline-none transition-all placeholder:text-gray-700 text-gray-300"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
              <Users size={12} className="text-gray-600" /> Listener (You)
            </label>
            <input
              type="text"
              name="listener"
              value={context.listener}
              onChange={handleChange}
              placeholder="e.g. Mary"
              className="w-full bg-gray-950/50 border border-gray-800 rounded-xl px-4 py-3 text-sm focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10 focus:outline-none transition-all placeholder:text-gray-700 text-gray-300"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
              <Mic2 size={12} className="text-gray-600" /> Tone
            </label>
            <div className="relative">
              <select
                name="tone"
                value={context.tone}
                onChange={handleChange}
                className="w-full bg-gray-950/50 border border-gray-800 rounded-xl px-4 py-3 text-sm focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10 focus:outline-none transition-all text-gray-300 appearance-none cursor-pointer hover:bg-gray-900/50"
              >
                <option value="Auto">✨ Auto (AI Detection)</option>
                <option value="Casual">Casual (Friends/Peers)</option>
                <option value="Formal">Formal (Respectful)</option>
                <option value="Aggressive">Aggressive/Angry</option>
                <option value="Rough">Rough (Street/Action)</option>
                <option value="Intimate">Intimate (Romance)</option>
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
              <Clapperboard size={12} className="text-gray-600" /> Scene Description
            </label>
            <input
              name="sceneDescription"
              value={context.sceneDescription}
              onChange={handleChange}
              placeholder="Describe what is happening..."
              className="w-full bg-gray-950/50 border border-gray-800 rounded-xl px-4 py-3 text-sm focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10 focus:outline-none transition-all placeholder:text-gray-700 text-gray-300"
            />
          </div>

          {/* Glossary UI */}
          <div className="space-y-3 md:col-span-2 pt-4 mt-2 border-t border-gray-800/50">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <Book size={12} className="text-gray-600" /> Glossary
              </label>
              {terms.length > 0 && (
                 <span className="text-[9px] text-gray-600 bg-gray-800/50 px-2 py-0.5 rounded-full border border-gray-700/50">{terms.length} terms</span>
              )}
            </div>
            
            <div className="flex flex-col gap-3">
              {/* Input Row */}
              <div className="flex flex-col sm:flex-row items-stretch gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={termInput}
                    onChange={(e) => setTermInput(e.target.value)}
                    placeholder="Term (e.g. Skyler)"
                    className="w-full bg-gray-950/50 border border-gray-800 rounded-xl px-4 py-2.5 text-sm focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10 outline-none placeholder:text-gray-700 transition-all"
                    onKeyDown={(e) => e.key === 'Enter' && addTerm()}
                  />
                </div>
                
                <div className="flex items-center justify-center text-gray-600 sm:rotate-0 rotate-90 py-1 sm:py-0">
                  <ArrowRight size={16} className="opacity-50" />
                </div>

                <div className="relative flex-1">
                  <input
                    type="text"
                    value={defInput}
                    onChange={(e) => setDefInput(e.target.value)}
                    placeholder="Burmese (e.g. စကိုင်လာ)"
                    className="w-full bg-gray-950/50 border border-gray-800 rounded-xl px-4 py-2.5 text-sm focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10 outline-none placeholder:text-gray-700 font-burmese transition-all"
                    onKeyDown={(e) => e.key === 'Enter' && addTerm()}
                  />
                </div>

                <button
                  onClick={addTerm}
                  disabled={!termInput.trim() || !defInput.trim()}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed text-white p-2.5 sm:px-4 rounded-xl transition-all shadow-lg shadow-emerald-900/20 flex items-center justify-center shrink-0 active:scale-95 group/btn"
                  title="Add Term"
                >
                  <Plus size={18} className="group-active/btn:rotate-90 transition-transform" />
                  <span className="sm:hidden ml-2 text-xs font-bold">Add</span>
                </button>
              </div>

              {/* List of Terms */}
              {terms.length > 0 ? (
                <div className="flex flex-wrap gap-2 mt-1 max-h-[160px] overflow-y-auto custom-scrollbar p-1">
                  {terms.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-gray-800/40 border border-gray-700/50 hover:border-emerald-500/30 rounded-lg pl-3 pr-2 py-1.5 text-xs group transition-all animate-in zoom-in duration-200">
                      <span className="text-gray-300 font-medium">{item.term}</span>
                      <span className="text-gray-600 text-[10px]">●</span>
                      <span className="text-emerald-400 font-burmese font-medium">{item.def}</span>
                      <button 
                        onClick={() => removeTerm(idx)}
                        className="ml-1 p-1 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-full transition-all"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                  <div className="text-center py-4 border border-dashed border-gray-800 rounded-xl bg-gray-900/20">
                      <p className="text-[10px] text-gray-600 italic">No glossary terms added yet.</p>
                  </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContextPanel;