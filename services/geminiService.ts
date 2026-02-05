import { GoogleGenAI, Type } from "@google/genai";

// Helper to lazily get the AI client.
function getAiClient() {
  // @ts-ignore: process.env is assumed to be available via Vite define
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key 未配置。请确保在部署环境 (Vercel/Netlify) 中设置了 API_KEY 环境变量。");
  }
  return new GoogleGenAI({ apiKey });
}

const SYSTEM_INSTRUCTION = `
你是一个专业的数学 LaTeX 和 JSON 格式化专家。
你的任务是处理传入的 JSON 对象列表，对 "name" 和 "description" 字段进行最优化算法知识点的文本清洗和标准化。

严格遵守以下规则：
1. **数学符号补全**：识别文本中所有未包裹的数学变量（如 x, A, b, w, L, n, m, i 等）和表达式（如 Ax=b, f(x), x in X 等），并用美元符号 $ 包裹。
2. **公式合并**：将相邻的多个数学公式块合并为一个。例如，将 "$\\min$" "$f(x)$" 优化为 "$\\min f(x)$"，将 "$\\in$" "$\\mathbb{R}^n$" 优化为 "$\\in \\mathbb{R}^n$"。
3. **双斜杠转义（核心）**：所有的 LaTeX 指令必须使用双反斜杠以符合 JSON 字符串规范。例如：\\\\min, \\\\mathbb{R}, \\\\in, \\\\text{s.t.}, \\\\to, \\\\le 等。
4. **输出格式**：你必须严格遵循 JSON Schema 返回数据。
`;

// Define the Strict Schema to ensure valid JSON every time
const responseSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      _index: { type: Type.INTEGER },
      name: { type: Type.STRING },
      description: { type: Type.STRING },
    },
    required: ["_index", "name", "description"],
  },
};

/**
 * Sends a batch of simplified items to Gemini for processing.
 */
async function processBatch(items: any[]): Promise<any[]> {
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          role: 'user',
          parts: [
            { text: "请按照 System Instruction 处理以下数据：" },
            { text: JSON.stringify(items) }
          ]
        }
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: responseSchema, // Enforce strict schema
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("Empty response from Gemini");
    }

    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (error: any) {
    console.error("Batch processing error detail:", error);
    if (error.message && error.message.includes("429")) {
        throw new Error("RATE_LIMIT");
    }
    throw error;
  }
}

function findProcessableItems(data: any, items: any[] = []) {
  if (Array.isArray(data)) {
    data.forEach(item => findProcessableItems(item, items));
  } else if (typeof data === 'object' && data !== null) {
    if (typeof data.name === 'string' && typeof data.description === 'string') {
      items.push(data);
    }
    Object.values(data).forEach(value => findProcessableItems(value, items));
  }
  return items;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface ProcessResult {
  data: any;
  stats: {
    total: number;
    success: number;
    failed: number;
  };
}

/**
 * Main entry point for processing.
 */
export async function processJsonKnowledgeBase(
  originalData: any,
  onProgress: (current: number, total: number) => void
): Promise<ProcessResult> {
  const dataCopy = JSON.parse(JSON.stringify(originalData));
  
  const itemsToProcess = findProcessableItems(dataCopy);
  const total = itemsToProcess.length;
  
  console.log(`Found ${total} items to process.`);

  if (total === 0) {
    return { data: dataCopy, stats: { total: 0, success: 0, failed: 0 } };
  }

  // EXTREME CONSERVATIVE MODE
  // Batch size 3 to ensure fast processing per chunk and avoid token limits
  const BATCH_SIZE = 3; 
  let successCount = 0;
  let failedCount = 0;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = itemsToProcess.slice(i, i + BATCH_SIZE);
    
    const payload = batch.map((item, idx) => ({
      _index: idx,
      name: item.name,
      description: item.description
    }));

    let retries = 3;
    let batchSuccess = false;

    // Retry loop
    while (retries > 0 && !batchSuccess) {
      try {
        // Enforce a strict delay to respect rate limits
        if (i > 0) {
            await delay(2000); // Wait 2 seconds between every batch
        }

        const results = await processBatch(payload);
        
        results.forEach((result: any) => {
          if (typeof result._index === 'number' && batch[result._index]) {
            batch[result._index].name = result.name;
            batch[result._index].description = result.description;
          }
        });
        
        batchSuccess = true;
        successCount += batch.length;
      } catch (e: any) {
        retries--;
        const isRateLimit = e.message === "RATE_LIMIT" || (e.message && e.message.includes("429"));
        
        console.warn(`Batch failed at index ${i}, retries left: ${retries}. Reason: ${e.message}`);
        
        if (retries === 0) {
           // SOFT FAIL: Do NOT throw error. Just log and continue.
           // The original data remains unchanged for this batch.
           console.error(`Batch at index ${i} permanently failed. Skipping.`);
           failedCount += batch.length;
        } else {
            // Exponential backoff
            const waitTime = isRateLimit ? 5000 * (4 - retries) : 2000;
            await delay(waitTime); 
        }
      }
    }

    onProgress(Math.min(i + BATCH_SIZE, total), total);
  }

  return { 
    data: dataCopy, 
    stats: {
        total,
        success: successCount,
        failed: failedCount
    }
  };
}