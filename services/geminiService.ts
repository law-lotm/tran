import { GoogleGenAI, HarmCategory, HarmBlockThreshold, ThinkingLevel } from "@google/genai";
import { MG_LUCK_SYSTEM_INSTRUCTION } from '../constants';
import { TranslationContext, APIMetrics, TokenReservoir } from '../types';

const RESERVOIR_KEY = 'mgluck_token_reservoir';
const DEFAULT_CAPACITY = 500000; // 500k tokens daily limit for free tier management

const loadReservoir = (): TokenReservoir => {
  const saved = localStorage.getItem(RESERVOIR_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // Daily reset logic
      const now = Date.now();
      const lastRefillDate = new Date(parsed.lastRefill).toDateString();
      const nowDate = new Date(now).toDateString();
      
      if (lastRefillDate !== nowDate) {
        return {
          capacity: DEFAULT_CAPACITY,
          remaining: DEFAULT_CAPACITY,
          lastRefill: now,
          totalConsumed: parsed.totalConsumed || 0
        };
      }
      return parsed;
    } catch (e) {
      console.error("Failed to load reservoir", e);
    }
  }
  return {
    capacity: DEFAULT_CAPACITY,
    remaining: DEFAULT_CAPACITY,
    lastRefill: Date.now(),
    totalConsumed: 0
  };
};

const saveReservoir = (res: TokenReservoir) => {
  localStorage.setItem(RESERVOIR_KEY, JSON.stringify(res));
};

let reservoir = loadReservoir();

// --- Metrics & Health Monitoring ---
let circuitBreaker = {
  failures: 0,
  lastFailure: 0,
  isOpen: false,
  COOLDOWN: 60000 // 1 minute
};

const checkCircuit = () => {
  if (circuitBreaker.isOpen) {
    if (Date.now() - circuitBreaker.lastFailure > circuitBreaker.COOLDOWN) {
      circuitBreaker.isOpen = false;
      circuitBreaker.failures = 0;
      updateMetrics({ isCircuitOpen: false });
      return true;
    }
    return false;
  }
  return true;
};

const recordFailure = () => {
  circuitBreaker.failures++;
  circuitBreaker.lastFailure = Date.now();
  if (circuitBreaker.failures >= 5) {
    circuitBreaker.isOpen = true;
    updateMetrics({ isCircuitOpen: true });
  }
};

const recordSuccess = () => {
  if (circuitBreaker.isOpen) {
    updateMetrics({ isCircuitOpen: false });
  }
  circuitBreaker.failures = 0;
  circuitBreaker.isOpen = false;
};

let metrics: APIMetrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  rateLimitCount: 0,
  lastLatencyMs: 0,
  avgLatencyMs: 0,
  lastError: null,
  status: 'IDLE',
  lastCheckTimestamp: Date.now(),
  totalTokensUsed: 0,
  reservoirTokens: reservoir.remaining,
  isCircuitOpen: false
};

let listeners: (() => void)[] = [];

export const getMetrics = () => ({ ...metrics });
export const getReservoir = () => ({ ...reservoir });

export const subscribeMetrics = (cb: () => void) => {
  listeners.push(cb);
  return () => { listeners = listeners.filter(l => l !== cb); };
};

const updateMetrics = (partial: Partial<APIMetrics>) => {
  metrics = { ...metrics, ...partial };
  listeners.forEach(cb => cb());
};

// --- Smart Cache ---
const translationCache = new Map<string, string>();

const getCacheKey = (text: string, context: TranslationContext, model: string) => {
  return `${model}:${text}:${context.movieTitle}:${context.tone}:${context.speaker}:${context.listener}`;
};

const consumeTokens = (count: number) => {
  reservoir.remaining = Math.max(0, reservoir.remaining - count);
  reservoir.totalConsumed += count;
  saveReservoir(reservoir);
  updateMetrics({ 
    totalTokensUsed: metrics.totalTokensUsed + count,
    reservoirTokens: reservoir.remaining 
  });
};

// Improved token estimation based on character count (approx 4 chars per token for English, 2 for Burmese)
const estimateTokens = (input: string, output: string = '') => {
  const inputTokens = Math.ceil(input.length / 3.5);
  const outputTokens = Math.ceil(output.length / 2);
  return inputTokens + outputTokens + 50; // +50 for system instructions and overhead
};

export const resetSystemHealth = () => {
  metrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    rateLimitCount: 0,
    lastLatencyMs: 0,
    avgLatencyMs: 0,
    lastError: null,
    status: 'IDLE',
    lastCheckTimestamp: Date.now(),
    totalTokensUsed: 0,
    reservoirTokens: reservoir.remaining,
    isCircuitOpen: false
  };
  listeners.forEach(cb => cb());
};

export const checkSystemHealth = async (): Promise<boolean> => {
  if (!process.env.API_KEY) return false;
  
  const startTime = Date.now();
  updateMetrics({ status: 'HEALTHY' }); // Optimistic start

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: 'ping',
      config: { maxOutputTokens: 1 }
    });
    
    const latency = Date.now() - startTime;
    updateMetrics({
      lastLatencyMs: latency,
      lastCheckTimestamp: Date.now(),
      status: latency > 2000 ? 'DEGRADED' : 'HEALTHY',
      lastError: null
    });
    return true;
  } catch (err: any) {
    updateMetrics({
      status: 'DOWN',
      lastError: err.message,
      lastCheckTimestamp: Date.now()
    });
    return false;
  }
};

export const checkModelConnection = async (model: string): Promise<{ ok: boolean; latency: number; msg?: string }> => {
  if (!process.env.API_KEY) return { ok: false, latency: 0, msg: "No API Key" };
  
  const startTime = Date.now();
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    await ai.models.generateContent({
      model: model,
      contents: 'ping',
      config: { maxOutputTokens: 1 }
    });
    return { ok: true, latency: Date.now() - startTime };
  } catch (err: any) {
    return { ok: false, latency: 0, msg: err.message };
  }
};

// --- Existing Helpers ---

// Helper to extract actor from ASS line
const extractActorFromASS = (text: string): string | null => {
  const regex = /^Dialogue:\s*[^,]+,[^,]+,[^,]+,[^,]+,([^,]*),/i;
  const match = text.match(regex);
  return match && match[1] ? match[1].trim() : null;
};

// Helper to parse ASS Dialogue line components
const extractAssComponents = (line: string) => {
    let commaCount = 0;
    let splitIdx = -1;
    for (let i = 0; i < line.length; i++) {
        if (line[i] === ',') {
            commaCount++;
            if (commaCount === 9) {
                splitIdx = i;
                break;
            }
        }
    }
    if (splitIdx !== -1) {
        return {
            header: line.substring(0, splitIdx + 1),
            content: line.substring(splitIdx + 1)
        };
    }
    return null;
};

// Internal function to strictly clean content text (strip commas, punctuation)
const _cleanContentOnly = (text: string): string => {
  let cleaned = text.replace(/\{\\i[01]?\}/g, '');
  let result = '';
  let depth = 0;
  
  for (let i = 0; i < cleaned.length; i++) {
      const char = cleaned[i];
      if (char === '{') {
          depth++;
          result += char;
      } else if (char === '}') {
          depth = Math.max(0, depth - 1);
          result += char;
      } else {
          if (depth > 0) {
              result += char;
          } else {
              // Only strip commas and '။' (Burmese pipe) to ensure no punctuation in output
              if (char !== ',' && char !== '။') {
                  result += char;
              }
          }
      }
  }
  return result;
};

export const cleanBurmeseText = (text: string): string => {
  // Check if the text is a full ASS line before cleaning
  if (text.trim().startsWith('Dialogue:')) {
    const components = extractAssComponents(text);
    if (components) {
       // If it is an ASS line, preserve the header (keep commas) and only clean the content
       return components.header + _cleanContentOnly(components.content);
    }
    // SAFETY FALLBACK:
    return text;
  }
  // Otherwise, clean the whole text
  return _cleanContentOnly(text);
};

// Smart processor for manual cleanup
export const smartPostProcess = (text: string): string => {
  let processed = cleanBurmeseText(text);
  // Remove double spaces
  processed = processed.replace(/\s+/g, ' ');
  // Fix space around \N (Subtitle new line)
  processed = processed.replace(/\s*\\N\s*/g, '\\N');
  // Remove leading/trailing
  processed = processed.trim();
  // Ensure no dot at end of line if it's not strictly English (keeps dots for "Mr.", "A.I.", but removes for Burmese)
  processed = processed.replace(/([^\w])\.$/, '$1');
  
  return processed;
};

const processRawResponse = (rawResult: string, isAssContext: boolean): string[] => {
    rawResult = rawResult.replace(/^```(?:ass|text)?\s*[\r\n]+/, "").replace(/[\r\n]+```\s*$/, "");
    
    // Split lines and remove potential empty trailing line from split
    let lines = rawResult.split('\n');
    if (lines.length > 0 && lines[lines.length - 1].trim() === '') {
        lines.pop();
    }

    return lines.map(line => {
      // If explicit ASS context, try to ensure we have a clean line structure
      if (isAssContext && line.trim().startsWith('Dialogue:')) {
         // smartPostProcess calls cleanBurmeseText, which now handles ASS headers correctly.
         return smartPostProcess(line);
      }
      return smartPostProcess(line);
    });
};

// Retry helper for API calls with increased robustness
async function callWithRetry<T>(fn: () => Promise<T>, retries = 3, baseDelay = 1000): Promise<T> {
  const startTime = Date.now();
  updateMetrics({ totalRequests: metrics.totalRequests + 1 });

  try {
    const result = await fn();
    recordSuccess();
    
    // Update Metrics on Success
    const latency = Date.now() - startTime;
    const newSuccessTotal = metrics.successfulRequests + 1;
    // Weighted moving average for latency to keep it smooth
    const oldAvg = metrics.avgLatencyMs;
    const newAvg = oldAvg === 0 ? latency : (oldAvg * 0.9) + (latency * 0.1);

    updateMetrics({
      successfulRequests: newSuccessTotal,
      lastLatencyMs: latency,
      avgLatencyMs: Math.round(newAvg),
      status: metrics.status === 'DOWN' ? 'DEGRADED' : 'HEALTHY', // Recovering
      lastError: null
    });
    
    return result;
  } catch (error: any) {
    // Check for 429 (Resource Exhausted) or 503 (Service Unavailable)
    const status = error.status || error.code;
    const msg = (error.message || '').toLowerCase();
    
    const isRateLimit = status === 429 || msg.includes('429') || msg.includes('quota') || msg.includes('exhausted');
    const isServiceUnavailable = status === 503 || msg.includes('overloaded') || msg.includes('unavailable');
    const isNetworkError = msg.includes('fetch failed') || msg.includes('network');
    
    if (isRateLimit) {
      updateMetrics({
        rateLimitCount: metrics.rateLimitCount + 1,
        status: 'DEGRADED',
        lastError: 'Rate Limit (429)'
      });
    } else {
      recordFailure();
      updateMetrics({
        failedRequests: metrics.failedRequests + 1,
        status: 'DOWN',
        lastError: error.message || 'Unknown Error'
      });
    }

    if (retries > 0) {
      const isBatchError = msg.includes('batch alignment error');
      
      if (isRateLimit || isServiceUnavailable || isNetworkError || isBatchError) {
        
        let waitTime = baseDelay;
        if (isRateLimit) {
             // CRITICAL: If rate limited, wait SIGNIFICANTLY longer.
             // Google quotas usually reset every minute.
             waitTime = 30000; // 30 seconds minimum wait
             console.warn(`Quota exceeded. Pausing for ${waitTime}ms before retry...`);
        } else {
             // Normal jitter
             const jitter = Math.random() * 200;
             waitTime = baseDelay + jitter;
             console.warn(`API Issue. Retrying in ${waitTime}ms...`);
        }

        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        // Exponential backoff
        return callWithRetry(fn, retries - 1, isRateLimit ? baseDelay : baseDelay * 2); 
      }
    }
    throw error;
  }
}

// Common config for translation to avoid repetition and ensure consistency
const getTranslationConfig = (model: string) => {
  const config: any = {
    systemInstruction: MG_LUCK_SYSTEM_INSTRUCTION,
    temperature: 0.3, 
    maxOutputTokens: 8192,
    // Critical for movie subtitles: Loosen safety settings to prevent blocks on action/drama
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    ]
  };

  // Enable high thinking level for Gemini 3 models to support "multi-tasking" reasoning (Analysis -> Interpreting -> Translation)
  if (model.includes('gemini-3')) {
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
  }

  return config;
};

// Helper to generate the prompt with Few-Shot examples
const constructPrompt = (text: string, context: TranslationContext, detectedActor: string | null) => {
  let prompt = `
[INPUT]
${text}

[CONTEXT]
- Source: ${context.movieTitle || 'Unknown'}
- Spkr: ${context.speaker || (detectedActor || 'Unknown')}
- Listener: ${context.listener || 'Unknown'}
- Tone: ${context.tone}
- Scene: ${context.sceneDescription || 'None'}
- Glossary/Terms: ${context.glossary || 'None'}
`;

  // Inject Few-Shot Examples (Training Data)
  if (context.fewShotExamples && context.fewShotExamples.length > 0) {
    const examplesStr = context.fewShotExamples.map((ex, idx) => 
      `Input: ${ex.original}\nOutput: ${ex.translated}`
    ).join('\n---\n');
    
    prompt += `
[LEARNED PATTERNS (STRICTLY FOLLOW THIS STYLE)]
The user has provided previous corrections. Mimic this style exactly:
${examplesStr}
`;
  }

  prompt += `
[TASK]
Translate to Spoken Burmese (S-O-V) via "Mg Luck".
1. Meaning over Literal. Natural flow.
2. Terminology: "${context.movieTitle || 'this show'}".
3. Names: Keep English, Title Case.
4. Format: Maintain ASS tags. Remove italics. No punctuation.
`;

  return prompt;
};

// --- AI Auto Model Selector Logic ---
export const selectBestModel = (text: string, context: TranslationContext): string => {
  // If user has provided glossary or few-shot examples, we need high reasoning
  if (context.glossary || (context.fewShotExamples && context.fewShotExamples.length > 0)) {
    return 'gemini-3.1-pro-preview';
  }

  // If it's a long block of text or multiple lines
  if (text.length > 200 || text.includes('\n')) {
    return 'gemini-3.1-pro-preview';
  }

  // For simple, short lines, Flash 3.0 is excellent and fast
  return 'gemini-3-flash-preview';
};

export const translateTextStream = async function* (
  text: string, 
  context: TranslationContext,
  model: string = 'auto'
): AsyncGenerator<string, void, unknown> {
  const actualModel = model === 'auto' ? selectBestModel(text, context) : model;
  
  if (!process.env.API_KEY) {
    throw new Error("API Key not found.");
  }

  if (reservoir.remaining <= 0) {
    throw new Error("Daily Token Reservoir exhausted. Please try again tomorrow or reset monitor.");
  }

  if (!checkCircuit()) {
    throw new Error("System is in cooldown due to repeated failures. Please wait a minute.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const detectedActor = extractActorFromASS(text);
  const contextPrompt = constructPrompt(text, context, detectedActor);

  const startTime = Date.now();
  updateMetrics({ totalRequests: metrics.totalRequests + 1 });
  
  try {
    const responseStream = await ai.models.generateContentStream({
      model: actualModel,
      contents: contextPrompt,
      config: getTranslationConfig(actualModel),
    });

    for await (const chunk of responseStream) {
      yield chunk.text || '';
    }

    const latency = Date.now() - startTime;
    
    // Improved token estimation for stream
    const estimatedTokens = estimateTokens(contextPrompt, ''); 
    consumeTokens(estimatedTokens);

    updateMetrics({
      successfulRequests: metrics.successfulRequests + 1,
      lastLatencyMs: latency,
      avgLatencyMs: metrics.avgLatencyMs === 0 ? latency : (metrics.avgLatencyMs * 0.9) + (latency * 0.1),
      status: 'HEALTHY'
    });
    // Stream usage estimation: input length (prompt) / 4 + output length / 4 roughly
    // Exact token count is tricky with stream without aggregation, but we can do a rough estimate
    // or just rely on batch which is more accurate.

  } catch (err: any) {
    updateMetrics({
      failedRequests: metrics.failedRequests + 1,
      status: 'DOWN',
      lastError: err.message
    });
    throw err;
  }
};

export const translateText = async (
  text: string, 
  context: TranslationContext,
  model: string = 'auto'
): Promise<string> => {
  const actualModel = model === 'auto' ? selectBestModel(text, context) : model;
  const cacheKey = getCacheKey(text, context, actualModel);
  
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey)!;
  }

  if (!process.env.API_KEY) {
    throw new Error("API Key not found.");
  }

  if (reservoir.remaining <= 0) {
    throw new Error("Daily Token Reservoir exhausted. Please try again tomorrow.");
  }

  if (!checkCircuit()) {
    throw new Error("System is in cooldown. Please wait.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const detectedActor = extractActorFromASS(text);
  const contextPrompt = constructPrompt(text, context, detectedActor);

  return await callWithRetry(async () => {
    const response = await ai.models.generateContent({
      model: actualModel,
      contents: contextPrompt,
      config: getTranslationConfig(actualModel),
    });

    const resultText = response.text || "";
    if (response.usageMetadata?.totalTokenCount) {
        consumeTokens(response.usageMetadata.totalTokenCount);
    } else {
        consumeTokens(estimateTokens(contextPrompt, resultText));
    }

    const processedLines = processRawResponse(resultText, true);
    const finalResult = processedLines.join('\n').trim();
    
    // Cache the result
    translationCache.set(cacheKey, finalResult);
    return finalResult;
  });
};

export const translateBatchChunk = async (
  lines: string[], 
  context: TranslationContext,
  isAssFile: boolean,
  model: string = 'auto'
): Promise<string[]> => {
  if (!process.env.API_KEY) throw new Error("API Key missing.");
  if (lines.length === 0) return [];

  if (reservoir.remaining <= 0) {
    throw new Error("Daily Token Reservoir exhausted.");
  }

  if (!checkCircuit()) {
    throw new Error("System is in cooldown.");
  }

  // 1. Token Accumulation & Deduplication Strategy
  // Extract only the text content (strip ASS headers) and deduplicate to save massive tokens
  const lineData = lines.map((line, index) => {
    let header = '';
    let content = line;
    
    if (isAssFile && line.trim().startsWith('Dialogue:')) {
      const components = extractAssComponents(line);
      if (components) {
        header = components.header;
        content = components.content;
      }
    }
    return { index, header, content: content.trim(), original: line };
  });

  // Find unique sentences to translate
  const uniqueContents = Array.from(new Set(lineData.map(d => d.content).filter(c => c.length > 0)));
  
  // If nothing to translate (e.g., all empty), return originals
  if (uniqueContents.length === 0) {
    return lines;
  }

  const textBlock = uniqueContents.join('\n');
  const actualModel = model === 'auto' ? selectBestModel(textBlock, context) : model;
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Construct Batch Prompt with only unique contents
  let prompt = `[BATCH INPUT - ${uniqueContents.length} unique lines]\n${textBlock}\n\n`;
  
  // Inject Examples for Batch
  if (context.fewShotExamples && context.fewShotExamples.length > 0) {
      prompt += `[LEARNED STYLE REFERENCES]\n`;
      prompt += context.fewShotExamples.slice(-5).map(ex => 
          `Original: ${ex.original} -> Translated: ${ex.translated}`
      ).join('\n');
      prompt += `\n\n`;
  }

  prompt += `
[INSTRUCTIONS]
Translate to Spoken Burmese (S-O-V) for "Mg Luck".
- Source Material: ${context.movieTitle || 'General'}
- Context: ${context.tone}
- Scene: ${context.sceneDescription || 'General'}
- Glossary: ${context.glossary || 'None'}
- **CRITICAL**: Maintain strict line-by-line correspondence. Output exactly ${uniqueContents.length} lines.
- **NAMES**: Keep English Names. Force Title Case (e.g. "JOHN" -> "John").
- **FORMAT**: Keep formatting tags like {\\an8} or \\N in their relative positions.
- Clean italics/punctuation.
`;

  return callWithRetry(async () => {
    const response = await ai.models.generateContent({
      model: actualModel,
      contents: prompt,
      config: getTranslationConfig(actualModel),
    });

    if (response.usageMetadata?.totalTokenCount) {
        consumeTokens(response.usageMetadata.totalTokenCount);
    }

    const rawResult = response.text || "";
    let processedUniqueLines = processRawResponse(rawResult, false); // false because we stripped ASS headers

    if (processedUniqueLines.length !== uniqueContents.length) {
      throw new Error(`Batch alignment error: Sent ${uniqueContents.length} unique lines, got ${processedUniqueLines.length}. Retrying to ensure completeness...`);
    }

    // Map translations back to unique contents
    const translationMap = new Map<string, string>();
    uniqueContents.forEach((content, idx) => {
      translationMap.set(content, processedUniqueLines[idx] || content);
    });

    // Reconstruct the original lines with headers
    const finalLines = lineData.map(data => {
      if (data.content.length === 0) return data.original;
      const translatedContent = translationMap.get(data.content) || data.content;
      return data.header + translatedContent;
    });

    return finalLines;
  });
};