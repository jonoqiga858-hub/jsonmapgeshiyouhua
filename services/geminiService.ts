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

    // With responseSchema, the text is guaranteed to be a valid JSON string conforming to the schema
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (error: any) {
    console.error("Batch processing error detail:", error);
    // Throw a more descriptive error if possible
    if (error.message && error.message.includes("429")) {
        throw new Error("请求过于频繁 (Rate Limit Exceeded)。正在重试...");
    }
    throw error;
  }
}

/**
 * Traverses the JSON object to find all items that have name and description fields.
 */
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

/**
 * Helper to pause execution
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Main entry point for processing.
 */
export async function processJsonKnowledgeBase(
  originalData: any,
  onProgress: (current: number, total: number) => void
): Promise<any> {
  const dataCopy = JSON.parse(JSON.stringify(originalData));
  
  const itemsToProcess = findProcessableItems(dataCopy);
  const total = itemsToProcess.length;
  
  console.log(`Found ${total} items to process.`);

  if (total === 0) {
    return dataCopy;
  }

  // REDUCED BATCH SIZE for stability with large files
  const BATCH_SIZE = 5; 

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = itemsToProcess.slice(i, i + BATCH_SIZE);
    
    const payload = batch.map((item, idx) => ({
      _index: idx,
      name: item.name,
      description: item.description
    }));

    let retries = 3;
    let success = false;

    while (retries > 0 && !success) {
      try {
        // Add a small delay between batches to avoid 429 Rate Limit errors
        if (i > 0) {
            await delay(1000); // Wait 1 second between requests
        }

        const results = await processBatch(payload);
        
        results.forEach((result: any) => {
          if (typeof result._index === 'number' && batch[result._index]) {
            batch[result._index].name = result.name;
            batch[result._index].description = result.description;
          }
        });
        
        success = true;
      } catch (e) {
        retries--;
        console.warn(`Batch failed at index ${i}, retries left: ${retries}`, e);
        
        if (retries === 0) {
            throw new Error(`处理第 ${i + 1} 到 ${i + BATCH_SIZE} 条数据时失败。请检查网络或稍后重试。`);
        }
        // Exponential backoff: wait longer if it failed (2s, 4s, etc.)
        await delay(2000 * (3 - retries)); 
      }
    }

    onProgress(Math.min(i + BATCH_SIZE, total), total);
  }

  return dataCopy;
}