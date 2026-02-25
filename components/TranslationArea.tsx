import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Copy, Check, AlertCircle, Sparkles, RotateCcw, Upload, FileText, Download, Play, Pause, RefreshCw, X, Wand2, FileType, Save, Trash2, Clock, Brain } from 'lucide-react';
import { translateTextStream, translateBatchChunk, cleanBurmeseText, smartPostProcess } from '../services/geminiService';
import { TranslationContext, ProcessingStatus, TranslationHistoryItem, BatchMode, BatchProgress, ModelType } from '../types';
import { SAMPLE_ASS_INPUT } from '../constants';

interface TranslationAreaProps {
  context: TranslationContext;
  onAddToHistory: (item: TranslationHistoryItem) => void;
  model: ModelType;
}


const TranslationArea: React.FC<TranslationAreaProps> = ({ context, onAddToHistory, model }) => {
  const [batchSize, setBatchSize] = useState(30);
  const RATE_LIMIT_DELAY_MS = 6000; 
  const [mode, setMode] = useState<BatchMode>('text');
  const [input, setInput] = useState<string>('');
  const [output, setOutput] = useState<string>('');
  
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileContent, setFileContent] = useState<string[]>([]);
  const [translatedLines, setTranslatedLines] = useState<(string | null)[]>([]);
  
  // New state to track if we restored from storage
  const [restoredFromCache, setRestoredFromCache] = useState(false);
  const [waitingForQuota, setWaitingForQuota] = useState(false);
  const [isTaught, setIsTaught] = useState(false);

  const [batchProgress, setBatchProgress] = useState<BatchProgress>({
    totalLines: 0,
    processedLines: 0,
    currentBatch: 0,
    totalBatches: 0,
    isPaused: false
  });
  
  const [status, setStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [cleaned, setCleaned] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const latestRequestTime = useRef<number>(0);

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // --- LOCAL STORAGE HELPERS ---
  const getStorageKey = (fileName: string, fileSize: number) => {
    return `mgluck_progress_${fileName}_${fileSize}`;
  };

  const saveProgressToStorage = (fileName: string, fileSize: number, lines: (string | null)[]) => {
    try {
      const key = getStorageKey(fileName, fileSize);
      localStorage.setItem(key, JSON.stringify({
        timestamp: Date.now(),
        lines: lines
      }));
    } catch (e) {
      console.warn("Local storage full or disabled", e);
    }
  };

  const clearProgressFromStorage = (fileName: string, fileSize: number) => {
    const key = getStorageKey(fileName, fileSize);
    localStorage.removeItem(key);
    setRestoredFromCache(false);
  };

  // --- TRANSLATION LOGIC ---

  const triggerTranslation = useCallback(async (text: string, ctx: TranslationContext, saveToHistory: boolean) => {
    if (!text.trim()) {
      setOutput('');
      setStatus(ProcessingStatus.IDLE);
      return;
    }

    const timestamp = Date.now();
    latestRequestTime.current = timestamp;

    setStatus(ProcessingStatus.PROCESSING);
    setErrorMsg(null);
    setOutput(''); 
    setIsTaught(false); // Reset taught status

    try {
      let fullText = '';
      const stream = translateTextStream(text, ctx, model);

      for await (const chunk of stream) {
        if (latestRequestTime.current !== timestamp) return;
        fullText += chunk;
        setOutput(fullText);
      }
      
      if (latestRequestTime.current === timestamp) {
        const cleanedFinal = cleanBurmeseText(fullText);
        setOutput(cleanedFinal);
        setStatus(ProcessingStatus.SUCCESS);
        
        if (saveToHistory) {
          onAddToHistory({
            id: timestamp.toString(),
            original: text,
            translated: cleanedFinal,
            timestamp: timestamp,
            context: `${ctx.speaker || 'Unknown'} -> ${ctx.listener || 'Unknown'} (${ctx.tone})`
          });
        }
      }
    } catch (err: any) {
      if (latestRequestTime.current === timestamp) {
        setStatus(ProcessingStatus.ERROR);
        const msg = err.message || 'Unknown error';
        if (msg.includes('503') || msg.includes('overloaded')) {
             setErrorMsg('Gemini is currently overloaded. Please try again in a moment.');
        } else if (msg.includes('429') || msg.includes('quota')) {
             setErrorMsg('Usage limit exceeded. Please wait a minute before retrying.');
        } else {
             setErrorMsg(msg);
        }
      }
    }
  }, [onAddToHistory, model]);

  useEffect(() => {
    if (mode === 'file') return;
    const timer = setTimeout(() => {
      if (input.trim()) triggerTranslation(input, context, false);
      else { setOutput(''); setStatus(ProcessingStatus.IDLE); }
    }, 1000); 
    return () => clearTimeout(timer);
  }, [input, context, triggerTranslation, mode]);

  const handleFileSelect = (selectedFile: File) => {
    if (selectedFile) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const lines = text.split(/\r\n|\n|\r/);
        setFileContent(lines);
        
        // CHECK STORAGE
        const key = getStorageKey(selectedFile.name, selectedFile.size);
        const savedData = localStorage.getItem(key);
        
        if (savedData) {
          try {
            const parsed = JSON.parse(savedData);
            if (Array.isArray(parsed.lines) && parsed.lines.length === lines.length) {
              setTranslatedLines(parsed.lines);
              setRestoredFromCache(true);
              
              const completedCount = parsed.lines.filter((l: any) => l !== null).length;
              setBatchProgress({
                totalLines: lines.length,
                processedLines: completedCount,
                currentBatch: 0,
                totalBatches: Math.ceil(lines.length / batchSize),
                isPaused: false
              });
              
              setStatus(ProcessingStatus.IDLE);
              setErrorMsg(null);
              return;
            }
          } catch (e) {
            console.error("Failed to parse saved progress", e);
          }
        }

        setTranslatedLines(new Array(lines.length).fill(null));
        setRestoredFromCache(false);
        setStatus(ProcessingStatus.IDLE);
        setErrorMsg(null);
        setBatchProgress({
          totalLines: lines.length,
          processedLines: 0,
          currentBatch: 0,
          totalBatches: 0,
          isPaused: false
        });
      };
      reader.readAsText(selectedFile);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const onDragLeave = () => setIsDragging(false);
  
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const processBatch = async () => {
    if (!file || fileContent.length === 0) return;
    
    setStatus(ProcessingStatus.PROCESSING);
    setErrorMsg(null);
    setWaitingForQuota(false);
    abortControllerRef.current = new AbortController();

    const isAss = file.name.toLowerCase().endsWith('.ass');
    const isSrt = file.name.toLowerCase().endsWith('.srt');

    const indicesToTranslate: number[] = [];
    const currentTranslatedState = [...translatedLines]; 
    
    fileContent.forEach((line, index) => {
      let shouldTranslate = true;
      const trimmed = line.trim();
      
      if (currentTranslatedState[index] !== null) shouldTranslate = false;
      else if (!trimmed) shouldTranslate = false;
      else if (isAss) shouldTranslate = trimmed.startsWith('Dialogue:');
      else if (isSrt) {
         if (/^\d+$/.test(trimmed)) shouldTranslate = false;
         else if (/^\d{2}:\d{2}:\d{2}.*\d{2}:\d{2}:\d{2}/.test(trimmed)) shouldTranslate = false;
      }

      if (shouldTranslate) {
        indicesToTranslate.push(index);
      } else {
        if (currentTranslatedState[index] === null) currentTranslatedState[index] = line; 
      }
    });

    setTranslatedLines(currentTranslatedState); 

    if (indicesToTranslate.length === 0) {
        setBatchProgress(prev => ({
          ...prev,
          totalLines: fileContent.length,
          processedLines: fileContent.length
        }));
        setStatus(ProcessingStatus.SUCCESS);
        return;
    }

    const totalBatches = Math.ceil(indicesToTranslate.length / batchSize);
    
    setBatchProgress(prev => ({
      ...prev,
      totalLines: fileContent.length,
      totalBatches: totalBatches,
      processedLines: fileContent.length - indicesToTranslate.length
    }));

    for (let i = 0; i < totalBatches; i++) {
      if (abortControllerRef.current?.signal.aborted) {
        setStatus(ProcessingStatus.IDLE);
        setWaitingForQuota(false);
        return;
      }

      setBatchProgress(prev => ({ ...prev, currentBatch: i + 1 }));

      const startIdx = i * batchSize;
      const endIdx = Math.min(startIdx + batchSize, indicesToTranslate.length);
      const batchIndices = indicesToTranslate.slice(startIdx, endIdx);
      const batchLines = batchIndices.map(idx => fileContent[idx]);

      let success = false;
      let retryCount = 0;
      // Retry loop specifically for the Batch
      while (!success && retryCount < 5) {
        if (abortControllerRef.current?.signal.aborted) return;
        
        try {
          const resultLines = await translateBatchChunk(batchLines, context, isAss, model);
          
          setTranslatedLines(prev => {
            const newLines = [...prev];
            batchIndices.forEach((originalIndex, relativeIndex) => {
              newLines[originalIndex] = resultLines[relativeIndex] || cleanBurmeseText(fileContent[originalIndex]);
            });
            saveProgressToStorage(file.name, file.size, newLines);
            return newLines;
          });

          setBatchProgress(prev => ({ ...prev, processedLines: prev.processedLines + batchIndices.length }));
          success = true; // Move to next batch
          setWaitingForQuota(false);

        } catch (err: any) {
          const isQuota = err.message.includes('429') || err.message.includes('quota') || err.message.includes('exhausted');
          
          if (isQuota) {
            setWaitingForQuota(true);
            console.warn("Quota exceeded in component. Cooling down and reducing batch size...");
            setBatchSize(prev => Math.max(2, prev - 2)); // Reduce batch size on quota
            await delay(30000); 
            retryCount++;
          } else {
             console.error(`Batch ${i+1} failed`, err);
             setErrorMsg(`Batch ${i+1} failed: ${err.message}. Progress saved. Click Resume.`);
             setStatus(ProcessingStatus.ERROR);
             setWaitingForQuota(false);
             return;
          }
        }
      }

      if (!success) {
          setErrorMsg("Failed after multiple retries due to connection/quota.");
          setStatus(ProcessingStatus.ERROR);
          setWaitingForQuota(false);
          return;
      }

      if (i < totalBatches - 1) {
          await delay(RATE_LIMIT_DELAY_MS);
      }
    }

    setStatus(ProcessingStatus.SUCCESS);
  };

  const handleDownload = () => {
    if (!translatedLines.length || !file) return;
    const safeLines = translatedLines.map((l, i) => l === null ? fileContent[i] : l);
    const blob = new Blob([safeLines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `[MM] ${file.name}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleStopBatch = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setStatus(ProcessingStatus.IDLE);
      setWaitingForQuota(false);
    }
  };

  const handleManualTranslate = () => triggerTranslation(input, context, true);
  
  const handleCopy = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSmartClean = () => {
    if (!output) return;
    const clean = smartPostProcess(output);
    setOutput(clean);
    setCleaned(true);
    setTimeout(() => setCleaned(false), 2000);
  };

  // TEACHING MECHANISM
  const handleTeachAI = () => {
    if (!input.trim() || !output.trim()) return;
    
    // Check if duplicate
    const exists = context.fewShotExamples?.some(ex => ex.original === input && ex.translated === output);
    if (exists) {
        setIsTaught(true);
        setTimeout(() => setIsTaught(false), 2000);
        return;
    }

    // Add to training data in Context
    const newExample = {
        id: Date.now().toString(),
        original: input,
        translated: output
    };

    // Assuming we have setContext passed down or we just assume Context is mutable? 
    // In this specific architecture, context is a prop. We need to handle this via a callback if setContext isn't available.
    // However, context in this component is READ-ONLY based on props. 
    // Wait, the parent `App` holds the state. `ContextPanel` has setContext, but `TranslationArea` does not.
    // For this feature to work strictly, we need `setContext` passed to TranslationArea. 
    // BUT, we can hack it slightly or update the types. Let's look at `App.tsx`... 
    // Currently TranslationArea doesn't receive setContext. I will fix this in App.tsx later.
    // For now, I will use a callback `onTeach` if I added it, OR I will assume I need to modify App.tsx.
    // Let's modify App.tsx to pass setContext or a helper.
    // Actually, to keep it simple, I will emit a custom event or require the user to use the glossary.
    // NO, the user asked to "treat smart fix... as train data". This implies automated flow.
    // I will add `onTeach` prop to TranslationArea.
    
    // See below for App.tsx change. 
  };

  const handleClear = () => {
    setInput('');
    setOutput('');
    setStatus(ProcessingStatus.IDLE);
    setErrorMsg(null);
    setIsTaught(false);
  };

  const handleRemoveFile = () => {
    setFile(null);
    setFileContent([]);
    setTranslatedLines([]);
    setRestoredFromCache(false);
    setStatus(ProcessingStatus.IDLE);
    setBatchProgress({ totalLines: 0, processedLines: 0, currentBatch: 0, totalBatches: 0, isPaused: false });
  };

  const handleClearCache = () => {
    if (file && window.confirm("Delete saved progress for this file? This cannot be undone.")) {
       clearProgressFromStorage(file.name, file.size);
       handleRemoveFile();
    }
  };

  return (
    <div className="bg-gray-900/40 backdrop-blur-xl p-4 sm:p-6 rounded-2xl border border-gray-800 shadow-xl shadow-black/20 relative overflow-hidden">
      {/* Glow Effect */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500/0 via-emerald-500/50 to-emerald-500/0 opacity-50"></div>

      {/* Mode Tabs */}
      <div className="flex justify-center mb-6 sm:mb-8">
        <div className="flex w-full sm:w-auto bg-gray-950/80 p-1.5 rounded-xl border border-gray-800 shadow-inner">
          <button
            onClick={() => setMode('text')}
            className={`flex-1 sm:flex-none justify-center flex items-center gap-2 px-4 sm:px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 relative ${mode === 'text' ? 'text-gray-200 shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
          >
            {mode === 'text' && <div className="absolute inset-0 bg-gray-800 rounded-lg shadow-sm border border-gray-700/50" />}
            <span className="relative flex items-center gap-2 z-10"><Sparkles size={14} className={mode === 'text' ? 'text-emerald-400' : ''} /> <span className="hidden sm:inline">Direct Input</span><span className="sm:hidden">Input</span></span>
          </button>
          <button
            onClick={() => setMode('file')}
            className={`flex-1 sm:flex-none justify-center flex items-center gap-2 px-4 sm:px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 relative ${mode === 'file' ? 'text-gray-200 shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
          >
            {mode === 'file' && <div className="absolute inset-0 bg-gray-800 rounded-lg shadow-sm border border-gray-700/50" />}
            <span className="relative flex items-center gap-2 z-10"><Upload size={14} className={mode === 'file' ? 'text-emerald-400' : ''} /> <span className="hidden sm:inline">Batch File</span><span className="sm:hidden">File</span></span>
          </button>
        </div>
      </div>

      {mode === 'text' ? (
        /* --- DIRECT INPUT MODE --- */
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex flex-col gap-6">
          <div className="space-y-3">
            <div className="flex justify-between items-end px-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Original Text</label>
              <button 
                onClick={() => setInput(SAMPLE_ASS_INPUT)}
                className="text-[10px] text-emerald-500 hover:text-emerald-400 hover:underline transition-colors flex items-center gap-1"
              >
                <FileType size={10} /> Load Sample
              </button>
            </div>
            <div className="relative group">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Paste dialogue here..."
                className="w-full h-28 sm:h-32 bg-gray-950/50 border border-gray-800 group-hover:border-gray-700 rounded-xl p-4 sm:p-5 font-mono text-base sm:text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 outline-none transition-all resize-none text-gray-200 placeholder:text-gray-700 shadow-inner"
              />
              {input && (
                <button 
                  onClick={handleClear}
                  className="absolute top-3 right-3 p-2 text-gray-600 hover:text-gray-300 bg-gray-900/50 hover:bg-gray-800 rounded-lg transition-all border border-transparent hover:border-gray-700"
                  title="Clear Input"
                >
                  <RotateCcw size={16} />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-center">
            <button
              onClick={handleManualTranslate}
              disabled={status === ProcessingStatus.PROCESSING || !input.trim()}
              className={`
                w-full sm:w-auto group relative flex items-center justify-center gap-3 px-8 py-3.5 sm:px-10 sm:py-4 rounded-xl font-bold text-sm tracking-wide transition-all transform active:scale-[0.98] duration-200
                ${status === ProcessingStatus.PROCESSING 
                  ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700' 
                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-gray-100 shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.3)]'}
              `}
            >
              {status === ProcessingStatus.PROCESSING ? (
                <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />GENERATING...</>
              ) : (
                <><Sparkles size={16} className="group-hover:rotate-12 transition-transform" />TRANSLATE</>
              )}
            </button>
          </div>

           {/* Direct Output */}
           <div className="space-y-3 relative animate-in fade-in duration-500">
             <div className="flex flex-wrap justify-between items-center px-1 gap-2">
               <label className="text-[10px] font-bold text-emerald-400 font-burmese uppercase tracking-widest flex items-center gap-2">
                 <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Translation
               </label>
               <div className="flex items-center gap-2 ml-auto">
                 {output && (
                   <>
                    <button 
                      onClick={() => {
                        if(input && output) {
                            // Emit custom event because props don't have setContext here yet
                            // This is a cleaner way without prop drilling for now
                            const event = new CustomEvent('teach-ai', { 
                                detail: { original: input, translated: output } 
                            });
                            window.dispatchEvent(event);
                            setIsTaught(true);
                            setTimeout(() => setIsTaught(false), 2000);
                        }
                      }}
                      className="flex items-center gap-1.5 text-[10px] bg-blue-900/30 hover:bg-blue-800/50 px-3 py-1.5 rounded-md transition-all text-blue-300 border border-blue-500/20 hover:border-blue-500/40"
                      title="Add to Training Data (Memory)"
                    >
                      {isTaught ? <Check size={12} className="text-blue-400" /> : <Brain size={12} />}
                      {isTaught ? 'Learned' : 'Teach AI'}
                    </button>
                    <div className="w-px h-4 bg-gray-800"></div>
                    <button 
                      onClick={handleSmartClean}
                      className="flex items-center gap-1.5 text-[10px] bg-gray-800/80 hover:bg-gray-700 px-3 py-1.5 rounded-md transition-all text-indigo-300 border border-indigo-500/20 hover:border-indigo-500/40"
                    >
                      {cleaned ? <Check size={12} className="text-indigo-400" /> : <Wand2 size={12} />}
                      {cleaned ? 'Cleaned' : 'Smart Fix'}
                    </button>
                    <div className="w-px h-4 bg-gray-800"></div>
                     <button onClick={handleCopy} className="flex items-center gap-1.5 text-[10px] bg-gray-800/80 hover:bg-gray-700 px-3 py-1.5 rounded-md transition-all text-gray-300 border border-gray-700/50 hover:border-gray-600">
                       {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                       {copied ? 'Copied' : 'Copy'}
                     </button>
                   </>
                 )}
               </div>
             </div>
             {/* EDITABLE TEXTAREA: Removed readOnly to allow keyboard correction */}
             <textarea
               value={output}
               onChange={(e) => setOutput(e.target.value)}
               className={`w-full min-h-[12rem] sm:min-h-[14rem] rounded-xl p-4 sm:p-6 font-burmese text-lg sm:text-lg leading-loose resize-none outline-none transition-all duration-300 ${output ? 'bg-gray-900/50 border border-emerald-500/30 text-emerald-50 shadow-[0_0_25px_rgba(16,185,129,0.05)] focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20' : 'bg-gray-950/30 border border-gray-800/50 text-gray-600 italic'}`}
               placeholder="Translation result will stream here... (You can edit this)"
             />
           </div>
        </div>
      ) : (
        /* --- BATCH FILE MODE --- */
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {!file ? (
            <div 
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`
                border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all cursor-pointer relative group flex flex-col items-center justify-center gap-4 sm:gap-6 h-64 sm:h-72
                ${isDragging 
                  ? 'border-emerald-500 bg-emerald-500/10 scale-[1.01]' 
                  : 'border-gray-800 hover:border-emerald-500/30 bg-gray-950/30 hover:bg-gray-900/40'}
              `}
            >
              <input 
                type="file" 
                accept=".ass,.srt,.txt"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className={`p-5 sm:p-6 rounded-2xl transition-all duration-300 ${isDragging ? 'bg-emerald-500/20 scale-110 rotate-3' : 'bg-gray-900 group-hover:scale-110 group-hover:bg-gray-800 shadow-xl'}`}>
                <Upload size={32} className={isDragging ? 'text-emerald-400' : 'text-gray-400 group-hover:text-emerald-400'} />
              </div>
              <div className="space-y-2">
                <h3 className="text-gray-200 font-medium text-base sm:text-lg group-hover:text-emerald-100 transition-colors">
                  {isDragging ? "Drop file to upload" : "Click or Drag file here"}
                </h3>
                <p className="text-xs text-gray-500">Supports .ASS, .SRT, .TXT</p>
              </div>
            </div>
          ) : (
             <div className="bg-gray-950/50 rounded-2xl p-5 sm:p-6 border border-gray-800 relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500/20"></div>
                
                {/* File Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 relative z-10">
                   <div className="flex items-center gap-4 w-full sm:w-auto">
                      <div className="bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
                        <FileText size={24} className="text-emerald-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-gray-200 font-medium text-lg truncate max-w-[200px]">{file.name}</h3>
                        <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                           {(file.size / 1024).toFixed(1)} KB
                           <span className="w-1 h-1 bg-gray-700 rounded-full"></span>
                           {batchProgress.totalLines} lines
                           {status === ProcessingStatus.PROCESSING && batchProgress.processedLines > 0 && (
                             <>
                               <span className="w-1 h-1 bg-gray-700 rounded-full"></span>
                               <span className="text-emerald-500/80 animate-pulse">
                                 ~{Math.ceil(((batchProgress.totalBatches - batchProgress.currentBatch) * RATE_LIMIT_DELAY_MS) / 1000)}s remaining
                               </span>
                             </>
                           )}
                        </p>
                      </div>
                   </div>
                   
                   <div className="flex items-center gap-2 self-end sm:self-auto">
                     {restoredFromCache && (
                       <button 
                          onClick={handleClearCache}
                          className="p-2 text-gray-500 hover:text-red-400 bg-gray-900/50 hover:bg-red-500/10 rounded-lg transition-all border border-transparent hover:border-red-500/20"
                          title="Delete Saved Progress"
                       >
                         <Trash2 size={18} />
                       </button>
                     )}
                     <button onClick={handleRemoveFile} className="p-2 text-gray-500 hover:text-red-400 bg-gray-900/50 hover:bg-gray-800 rounded-lg transition-all">
                       <X size={18} />
                     </button>
                   </div>
                </div>

                {/* Restored Banner */}
                {restoredFromCache && status === ProcessingStatus.IDLE && batchProgress.processedLines > 0 && batchProgress.processedLines < batchProgress.totalLines && (
                  <div className="mb-6 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex items-center gap-3">
                    <div className="bg-emerald-500/20 p-1.5 rounded-full">
                       <Save size={14} className="text-emerald-400" />
                    </div>
                    <p className="text-xs text-emerald-200/80">
                      Previous progress restored. <span className="text-emerald-100 font-bold">{batchProgress.processedLines}</span> lines completed.
                    </p>
                  </div>
                )}

                {/* Central Action Buttons */}
                <div className="flex flex-col items-center justify-center py-4 space-y-4">
                  {(status === ProcessingStatus.IDLE || status === ProcessingStatus.ERROR) && batchProgress.processedLines === 0 && (
                     <button
                        onClick={processBatch}
                        className="w-full py-3.5 sm:py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-bold text-sm tracking-wide shadow-lg shadow-emerald-900/30 hover:shadow-emerald-900/50 transition-all transform active:scale-[0.99] flex items-center justify-center gap-3"
                     >
                        <Play size={18} fill="currentColor" />
                        START TRANSLATION
                     </button>
                  )}
                  
                   {(status === ProcessingStatus.IDLE || status === ProcessingStatus.ERROR) && batchProgress.processedLines > 0 && batchProgress.processedLines < batchProgress.totalLines && (
                     <button
                        onClick={processBatch}
                        className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm tracking-wide shadow-lg transition-all active:scale-[0.99] flex items-center justify-center gap-3"
                     >
                        <RefreshCw size={18} />
                        RESUME BATCH
                     </button>
                  )}

                  {status === ProcessingStatus.PROCESSING && (
                     <button
                        onClick={handleStopBatch}
                        className={`w-full py-4 rounded-xl font-bold text-sm tracking-wide transition-all active:scale-[0.99] flex items-center justify-center gap-3 ${waitingForQuota ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'}`}
                     >
                        {waitingForQuota ? (
                          <><Clock size={18} className="animate-pulse" /> COOLING DOWN (AUTO-RESUME)</>
                        ) : (
                          <><Pause size={18} /> PAUSE</>
                        )}
                     </button>
                  )}

                  {status === ProcessingStatus.SUCCESS && (
                     <button
                        onClick={handleDownload}
                        className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm tracking-wide shadow-lg shadow-emerald-900/30 transition-all animate-in zoom-in flex items-center justify-center gap-3"
                     >
                        <Download size={18} />
                        DOWNLOAD FILE
                     </button>
                  )}
                </div>

                {/* Status Bar */}
                {(batchProgress.processedLines > 0 || status === ProcessingStatus.PROCESSING) && (
                  <div className="space-y-3 mb-2 mt-6 animate-in fade-in duration-500">
                    <div className="flex justify-between text-[10px] uppercase tracking-wider font-semibold text-gray-500">
                      <span>Progress</span>
                      <span>{Math.round((batchProgress.totalLines > 0 ? batchProgress.processedLines / batchProgress.totalLines : 0) * 100)}%</span>
                    </div>
                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                       <div 
                         className={`h-full bg-gradient-to-r transition-all duration-700 ease-out ${status === ProcessingStatus.PROCESSING ? 'animate-pulse' : ''} ${waitingForQuota ? 'from-yellow-600 to-yellow-400' : 'from-emerald-600 to-emerald-400'}`}
                         style={{ width: `${batchProgress.totalLines > 0 ? (batchProgress.processedLines / batchProgress.totalLines) * 100 : 0}%` }}
                       />
                    </div>
                    {status === ProcessingStatus.PROCESSING && (
                       <div className="flex justify-between items-center text-[10px] text-gray-600">
                          <span className="flex items-center gap-1.5"><Save size={10} className="text-gray-600"/> Auto-saving...</span>
                          {waitingForQuota ? (
                            <span className="text-yellow-500/90 font-bold animate-pulse">Rate Limit Hit - Waiting 30s...</span>
                          ) : (
                            <span className="text-emerald-500/70 animate-pulse">Processing Batch {batchProgress.currentBatch}</span>
                          )}
                       </div>
                    )}
                  </div>
                )}
             </div>
          )}
        </div>
      )}

      {/* Shared Error Message */}
      {status === ProcessingStatus.ERROR && (
        <div className="mt-6 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-4 rounded-xl flex items-start gap-3 text-sm animate-in fade-in slide-in-from-top-2 shadow-lg shadow-red-900/10">
           <AlertCircle size={18} className="mt-0.5 shrink-0" />
           <p className="flex-1 font-medium">{errorMsg}</p>
        </div>
      )}
    </div>
  );
};

export default TranslationArea;