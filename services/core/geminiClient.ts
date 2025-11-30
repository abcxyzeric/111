

import { GoogleGenAI, HarmCategory, HarmBlockThreshold, type SafetySetting } from "@google/genai";
import { getSettings } from '../settingsService';
import { AiPerformanceSettings, SafetySettingsConfig } from '../../types';
import { DEFAULT_AI_PERFORMANCE_SETTINGS } from '../../constants';
import { processNarration } from '../../utils/textProcessing';

const DEBUG_MODE = true; // Bật/tắt chế độ debug chi tiết trong Console (F12)

// --- REQUEST TRACKING SYSTEM (NEW) ---
let currentDebugContext = 'Unknown Source';
const requestStats: Record<string, number> = {};
const totalSessionRequests = { count: 0 };

export const setDebugContext = (context: string) => {
    currentDebugContext = context;
};

export const resetRequestStats = () => {
    for (const key in requestStats) delete requestStats[key];
};

const incrementRequestCount = (model: string) => {
    if (!DEBUG_MODE) return;
    const key = `[${currentDebugContext}] ${model}`;
    requestStats[key] = (requestStats[key] || 0) + 1;
    totalSessionRequests.count++;
};

export const printRequestStats = (actionName: string) => {
    if (!DEBUG_MODE) return;
    const totalTurnRequests = Object.values(requestStats).reduce((a, b) => a + b, 0);
    console.group(`📊 [DEBUG STATS] Báo cáo tài nguyên cho: ${actionName}`);
    if (totalTurnRequests === 0) {
        console.log('%c✅ Không tốn request nào.', 'color: #4ade80; font-weight: bold;');
    } else {
        console.table(requestStats);
        console.log(`%cTổng request lượt này: ${totalTurnRequests}`, 'color: #fbbf24; font-weight: bold;');
    }
    console.log(`%cTổng request toàn phiên chơi: ${totalSessionRequests.count}`, 'color: #60a5fa;');
    console.groupEnd();
};
// -------------------------------------

let ai: GoogleGenAI | null = null;
let currentApiKey: string | null = null;
let keyIndex = 0;

const UNRESTRICTED_SAFETY_SETTINGS: SafetySetting[] = [
    {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
];

function getAiInstance(): GoogleGenAI {
  const { apiKeyConfig } = getSettings();
  const keys = apiKeyConfig.keys.filter(Boolean);

  if (keys.length === 0) {
    throw new Error('Không tìm thấy API Key nào. Vui lòng thêm API Key trong phần Cài đặt.');
  }
  
  if (keyIndex >= keys.length) {
    keyIndex = 0;
  }
  const apiKey = keys[keyIndex];
  
  if (ai && currentApiKey === apiKey) {
    keyIndex++;
    return ai;
  }

  ai = new GoogleGenAI({ apiKey });
  currentApiKey = apiKey;
  keyIndex++;
  return ai;
}

function handleApiError(error: unknown, safetySettings: SafetySettingsConfig): Error {
    const rawMessage = error instanceof Error ? error.message : String(error);
    console.error('Gemini API Error:', error);

    try {
        const errorJson = JSON.parse(rawMessage);
        if (errorJson.error && (errorJson.error.code === 429 || errorJson.error.status === 'RESOURCE_EXHAUSTED')) {
            return new Error(
                'Bạn đã vượt quá hạn mức yêu cầu API (Lỗi 429/RESOURCE_EXHAUSTED). Vui lòng đợi một lát rồi thử lại.'
            );
        }
    } catch (e) {
        // Not a JSON error message, proceed with other checks
    }

    const isSafetyBlock = /safety/i.test(rawMessage) || /blocked/i.test(rawMessage);
    if (safetySettings.enabled && isSafetyBlock) {
        return new Error("Nội dung của bạn có thể đã bị chặn bởi bộ lọc an toàn. Vui lòng thử lại với nội dung khác hoặc tắt bộ lọc an toàn trong mục Cài Đặt để tạo nội dung tự do hơn.");
    }

    return new Error(`Lỗi từ Gemini API: ${rawMessage}`);
}

function createDetailedErrorFromResponse(candidate: any, safetySettings: SafetySettingsConfig, isJson: boolean): Error {
    const responseType = isJson ? "JSON" : "";

    // Xử lý trường hợp không có "candidate" nào được trả về.
    // Đây là trường hợp lỗi nghiêm trọng, thường do prompt bị chặn hoàn toàn ở cấp độ đầu vào do vi phạm chính sách nghiêm trọng.
    if (!candidate) {
        console.error(`Gemini API returned no candidates. The prompt was likely blocked entirely before generation.`);
        if (!safetySettings.enabled) {
             return new Error(`Phản hồi ${responseType} từ AI trống hoàn toàn (không có "candidate"). Yêu cầu của bạn có thể đã bị chặn bởi bộ lọc an toàn nội bộ của Google do chứa nội dung vi phạm chính sách nghiêm trọng. Hãy thử diễn đạt lại hành động của bạn một cách "văn học" hơn.`);
        }
        return new Error(`Phản hồi ${responseType} từ AI trống hoàn toàn (không có "candidate"). Yêu cầu của bạn có thể đã bị chặn bởi bộ lọc an toàn. Vui lòng kiểm tra lại nội dung hoặc điều chỉnh cài đặt an toàn.`);
    }

    const finishReason = candidate?.finishReason;
    const safetyRatings = candidate?.safetyRatings;

    switch (finishReason) {
        case 'SAFETY':
            console.warn(`Gemini API ${responseType} response blocked due to safety settings.`, { finishReason, safetyRatings });
            let blockDetails = "Lý do: Bộ lọc an toàn.";
            if (safetyRatings && safetyRatings.length > 0) {
                const blockedCategories = safetyRatings.filter((r: any) => r.blocked).map((r: any) => r.category).join(', ');
                if (blockedCategories) {
                    blockDetails += ` Các danh mục bị chặn: ${blockedCategories}.`;
                }
            }
            if (safetySettings.enabled) {
                return new Error(`Phản hồi ${responseType} từ AI đã bị chặn bởi bộ lọc an toàn. Vui lòng thử lại với nội dung khác hoặc tắt bộ lọc an toàn trong mục Cài Đặt. ${blockDetails}`);
            } else {
                return new Error(`Phản hồi ${responseType} từ AI đã bị chặn vì lý do an toàn nội bộ của mô hình, ngay cả khi bộ lọc đã tắt. Điều này có thể xảy ra với nội dung cực kỳ nhạy cảm. Vui lòng điều chỉnh lại hành động. ${blockDetails}`);
            }
        
        case 'MAX_TOKENS':
            return new Error("Phản hồi từ AI đã bị cắt ngắn vì đạt đến giới hạn token tối đa (Max Output Tokens). Bạn có thể tăng giá trị này trong 'Cài đặt > Cài đặt Hiệu suất AI' để nhận được phản hồi dài hơn.");
            
        case 'RECITATION':
             return new Error("Phản hồi từ AI đã bị dừng vì có dấu hiệu lặp lại nội dung từ các nguồn khác. Vui lòng thử lại với một hành động khác để thay đổi hướng câu chuyện.");

        case 'STOP':
            // THÊM: Xử lý trường hợp "Từ chối im lặng" khi phản hồi trống nhưng lý do là STOP
            console.error(`Gemini API returned no text but finish reason was STOP. This might be due to a malformed prompt (e.g., bad obfuscation).`, candidate);
            return new Error(`Phản hồi từ AI trống không mong muốn. Điều này có thể do lỗi xử lý văn bản đầu vào. Vui lòng thử lại. Nếu sự cố vẫn tiếp diễn, hãy báo cáo lỗi.`);

        case 'OTHER':
        default:
            // Xử lý rõ ràng trường hợp `finishReason` là `undefined`
            const reason = finishReason || 'Không rõ lý do';
            console.error(`Gemini API returned no text. Finish reason: ${reason}`, candidate);
            if (!safetySettings.enabled) {
                return new Error(`Phản hồi ${responseType} từ AI trống. Lý do: ${reason}. Điều này có thể do bộ lọc an toàn nội bộ của mô hình. Nếu bạn đã bật nội dung 18+, hãy thử diễn đạt lại hành động của mình một cách "văn học" hơn để vượt qua bộ lọc.`);
            } else {
                return new Error(`Phản hồi ${responseType} từ AI trống. Lý do kết thúc: ${reason}.`);
            }
    }
}


export async function generate(prompt: string, systemInstruction?: string, retryCount: number = 0): Promise<string> {
    const { safetySettings, aiPerformanceSettings } = getSettings();
    const activeSafetySettings = safetySettings.enabled ? safetySettings.settings : UNRESTRICTED_SAFETY_SETTINGS;
    const perfSettings = aiPerformanceSettings || DEFAULT_AI_PERFORMANCE_SETTINGS;
    const selectedModel = perfSettings.selectedModel || 'gemini-2.5-flash';
    
    // Mặc định là 0 (không thử lại) nếu không được chỉ định, tối đa là retryCount + 1 lần chạy
    const maxAttempts = 1 + retryCount;
    let lastError: Error | null = null;
  
    const finalContents = systemInstruction ? `${systemInstruction}\n\n---\n\n${prompt}` : prompt;

    incrementRequestCount(`${selectedModel} (Text)`); // TRACKING

    if (DEBUG_MODE) {
        console.groupCollapsed(`🚀 [DEBUG] Gemini Request (${currentDebugContext})`);
        console.log('%c[PAYLOAD]', 'color: cyan; font-weight: bold;', {
            model: selectedModel,
            context: currentDebugContext, // Log context
            contents: '...', // Omitted for brevity, see preview
            config: {
                safetySettings: activeSafetySettings,
                maxOutputTokens: perfSettings.maxOutputTokens,
                thinkingConfig: { thinkingBudget: perfSettings.thinkingBudget }
            },
            retries: retryCount
        });
        console.log('%c[PROMPT PREVIEW]', 'color: lightblue;', finalContents);
        console.groupEnd();
    }

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const aiInstance = getAiInstance();
  
        const response = await aiInstance.models.generateContent({
            model: selectedModel,
            contents: finalContents,
            config: {
                safetySettings: activeSafetySettings as unknown as SafetySetting[],
                maxOutputTokens: perfSettings.maxOutputTokens,
                thinkingConfig: { thinkingBudget: perfSettings.thinkingBudget }
            }
        });
        
        const candidate = response.candidates?.[0];

        if (DEBUG_MODE) {
            console.groupCollapsed(`✅ [DEBUG] Gemini Response (${currentDebugContext}) - Attempt ${i+1}`);
            console.log('%c[TOKEN USAGE]', 'color: yellow;', response.usageMetadata);
            console.log('%c[FINISH REASON]', 'color: yellow;', candidate?.finishReason);
            console.log('%c[SAFETY RATINGS]', 'color: orange;', candidate?.safetyRatings);
            console.log('%c[RAW TEXT]', 'color: lightgreen;', response.text);
            console.groupEnd();
        }
  
        if (!response.text) {
            lastError = createDetailedErrorFromResponse(candidate, safetySettings, false);
            console.warn(`Gemini API returned no text on attempt ${i + 1}.`, { finishReason: candidate?.finishReason, safetyRatings: candidate?.safetyRatings });
            continue;
        }
  
        return response.text.trim();
  
      } catch (error) {
        console.error(`Error in generate attempt ${i + 1}:`, error);
        lastError = handleApiError(error, safetySettings);
        
        if (i < maxAttempts - 1) {
            const rawMessage = lastError.message.toLowerCase();
            if (/429|rate limit|resource_exhausted|503/.test(rawMessage)) {
                const delay = 1500 * Math.pow(2, i);
                console.warn(`Rate limit/server error on attempt ${i + 1}. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.warn(`Error on attempt ${i + 1}. Trying next key immediately...`);
            }
            continue;
        }
      }
    }
  
    throw lastError || new Error(`AI không thể tạo phản hồi sau ${maxAttempts} lần thử. Vui lòng kiểm tra lại API key và thử lại.`);
}

export async function generateJson<T>(prompt: string, schema: any, systemInstruction?: string, model: 'gemini-2.5-flash' | 'gemini-2.5-pro' = 'gemini-2.5-flash', overrideConfig?: Partial<AiPerformanceSettings>, retryCount: number = 0): Promise<T> {
    const { safetySettings, aiPerformanceSettings } = getSettings();
    const activeSafetySettings = safetySettings.enabled ? safetySettings.settings : UNRESTRICTED_SAFETY_SETTINGS;
    const perfSettings = aiPerformanceSettings || DEFAULT_AI_PERFORMANCE_SETTINGS;
  
    // Mặc định là 0 (không thử lại) nếu không được chỉ định
    const maxAttempts = 1 + retryCount;
    let lastError: Error | null = null;
  
    const finalContents = systemInstruction ? `${systemInstruction}\n\n---\n\n${prompt}` : prompt;

    incrementRequestCount(`${model} (JSON)`); // TRACKING

    if (DEBUG_MODE) {
        console.groupCollapsed(`🚀 [DEBUG] Gemini Request (generateJson - ${currentDebugContext})`);
        console.log('%c[PAYLOAD]', 'color: cyan; font-weight: bold;', {
            model: model,
            context: currentDebugContext, // Log context
            contents: '...', // Omitted for brevity, see preview
            config: {
                responseMimeType: "application/json",
                responseSchema: schema,
                safetySettings: activeSafetySettings,
                maxOutputTokens: overrideConfig?.maxOutputTokens ?? perfSettings.maxOutputTokens,
                thinkingConfig: { thinkingBudget: overrideConfig?.thinkingBudget ?? perfSettings.thinkingBudget }
            },
            retries: retryCount
        });
        console.log('%c[PROMPT PREVIEW]', 'color: lightblue;', finalContents);
        console.groupEnd();
    }

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const aiInstance = getAiInstance();
        
        const response = await aiInstance.models.generateContent({
            model: model,
            contents: finalContents,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema,
                safetySettings: activeSafetySettings as unknown as SafetySetting[],
                maxOutputTokens: overrideConfig?.maxOutputTokens ?? perfSettings.maxOutputTokens,
                thinkingConfig: { thinkingBudget: overrideConfig?.thinkingBudget ?? perfSettings.thinkingBudget }
            }
         });
  
        const candidate = response.candidates?.[0];
        const jsonString = response.text;

        if (DEBUG_MODE) {
            console.groupCollapsed(`✅ [DEBUG] Gemini Response (generateJson - ${currentDebugContext}) - Attempt ${i+1}`);
            console.log('%c[TOKEN USAGE]', 'color: yellow;', response.usageMetadata);
            console.log('%c[FINISH REASON]', 'color: yellow;', candidate?.finishReason);
            console.log('%c[SAFETY RATINGS]', 'color: orange;', candidate?.safetyRatings);
            console.log('%c[RAW JSON TEXT]', 'color: lightgreen;', jsonString);
            console.groupEnd();
        }
  
        if (!jsonString) {
            lastError = createDetailedErrorFromResponse(candidate, safetySettings, true);
            console.warn(`Gemini API returned no JSON text on attempt ${i + 1}.`, { finishReason: candidate?.finishReason, safetyRatings: candidate?.safetyRatings });
            continue;
        }
        
        try {
          const parsedJson = JSON.parse(jsonString) as T;
          
          // ÁP DỤNG HÀM LÀM SẠCH VĂN BẢN
          // Nếu đối tượng JSON có chứa trường 'narration', hãy xử lý nó.
          if (typeof parsedJson === 'object' && parsedJson !== null && 'narration' in parsedJson && typeof (parsedJson as any).narration === 'string') {
              (parsedJson as any).narration = processNarration((parsedJson as any).narration);
          }
      
          return parsedJson;
        } catch (e) {
            if (e instanceof SyntaxError) {
              console.error(`JSON Parsing Error on attempt ${i + 1}:`, e);
              console.error('Malformed JSON string from AI:', jsonString);
              lastError = new Error(`Lỗi phân tích JSON từ AI: ${e.message}. Chuỗi nhận được: "${jsonString.substring(0, 100)}..."`);
              continue;
            }
            throw e;
        }
  
      } catch (error) {
        console.error(`Error in generateJson attempt ${i + 1}:`, error);
        lastError = handleApiError(error, safetySettings);
        
        if (i < maxAttempts - 1) {
            const rawMessage = lastError.message.toLowerCase();
            if (/429|rate limit|resource_exhausted|503/.test(rawMessage)) {
                const delay = 1500 * Math.pow(2, i);
                console.warn(`Rate limit/server error on attempt ${i + 1}. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.warn(`Error on attempt ${i + 1}. Trying next key immediately...`);
            }
            continue;
        }
      }
    }
  
    throw lastError || new Error(`AI không thể tạo phản hồi JSON sau ${maxAttempts} lần thử. Vui lòng kiểm tra lại API key và thử lại.`);
}

export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    const { apiKeyConfig } = getSettings();
    const keys = apiKeyConfig.keys.filter(Boolean);
    if (keys.length === 0) {
        throw new Error('Không có API Key nào được cấu hình để tạo embeddings.');
    }
    const MAX_RETRIES = 2; // Giới hạn cứng số lần thử lại là 2
    let lastError: Error | null = null;
    
    incrementRequestCount('text-embedding-004 (Batch)'); // TRACKING

    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            const aiInstance = getAiInstance(); // Rotates key
            const result = await aiInstance.models.embedContent({
                model: "text-embedding-004",
                contents: texts,
            });
            const embeddings = result.embeddings;
            if (embeddings && embeddings.length === texts.length && embeddings.every(e => e.values)) {
                if (DEBUG_MODE) {
                    console.log(`✅ [DEBUG] Successfully generated ${embeddings.length} embeddings (${currentDebugContext}).`);
                }
                return embeddings.map(e => e.values);
            }
            throw new Error("API không trả về embeddings hợp lệ cho batch.");
        } catch (error) {
            console.error(`Error in generateEmbeddingsBatch attempt ${i + 1}:`, error);
            lastError = handleApiError(error, getSettings().safetySettings);
            
            if (i < MAX_RETRIES - 1) {
                const rawMessage = lastError.message.toLowerCase();
                if (/429|rate limit|resource_exhausted|503/.test(rawMessage)) {
                    const delay = 1500 * Math.pow(2, i);
                    console.warn(`Embedding batch rate limit/server error on attempt ${i + 1}. Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
                continue;
            } else {
                throw lastError;
            }
        }
    }
    throw lastError || new Error("Không thể tạo embeddings cho batch sau nhiều lần thử.");
}