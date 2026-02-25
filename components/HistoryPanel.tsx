import React, { useState } from 'react';
import { TranslationHistoryItem } from '../types';
import { History, Clock, Trash2, Copy, Check } from 'lucide-react';

interface HistoryPanelProps {
  history: TranslationHistoryItem[];
  onClearHistory: () => void;
}

const HistoryPanel: React.FC<HistoryPanelProps> = ({ history, onClearHistory }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="bg-gray-900/40 backdrop-blur-sm rounded-2xl border border-gray-800 shadow-sm flex flex-col h-96 sm:h-[500px] lg:h-auto lg:min-h-[500px] overflow-hidden transition-all duration-300">
      {/* Header */}
      <div className="p-4 border-b border-gray-800/50 bg-gray-900/80 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <History size={16} className="text-emerald-400" />
          <h2 className="font-bold text-gray-200 text-xs uppercase tracking-widest">History</h2>
        </div>
        {history.length > 0 && (
          <button 
            onClick={onClearHistory}
            className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
            title="Clear History"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      
      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {history.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-4 opacity-50">
            <div className="bg-gray-800/50 p-4 rounded-full border border-gray-700/50">
              <Clock size={24} />
            </div>
            <p className="text-xs font-medium tracking-wide">NO TRANSLATIONS YET</p>
          </div>
        ) : (
          history.map((item) => (
            <div 
              key={item.id} 
              className="group bg-gray-950/40 hover:bg-gray-900/80 border border-gray-800/60 hover:border-emerald-500/20 rounded-xl p-3.5 transition-all duration-200 hover:shadow-lg hover:shadow-black/20"
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-gray-600 font-mono flex items-center gap-1.5">
                    <Clock size={10} />
                    {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <button
                  onClick={() => handleCopy(item.translated, item.id)}
                  className="text-gray-600 hover:text-emerald-400 transition-colors opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-800 rounded"
                  title="Copy Translation"
                >
                  {copiedId === item.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                </button>
              </div>
              
              <div className="space-y-3">
                <p className="text-xs text-gray-400 font-medium leading-relaxed pl-1">
                  {item.original}
                </p>
                <div className="relative">
                  <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-emerald-500/30 rounded-full"></div>
                  <p className="text-sm text-emerald-100 font-burmese leading-loose pl-3 py-0.5">
                    {item.translated}
                  </p>
                </div>
              </div>
              
              {item.context && (
                <div className="mt-3 pt-2 border-t border-gray-800/50 flex justify-end">
                  <span className="text-[9px] font-medium bg-emerald-500/5 text-emerald-500/70 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    {item.context}
                  </span>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default HistoryPanel;