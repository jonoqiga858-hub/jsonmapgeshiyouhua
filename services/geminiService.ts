import { GoogleGenAI } from "@google/genai";
import { KnowledgeItem } from "../types";

// Helper to lazily get the AI client.
// This prevents the app from crashing on startup if the API key is missing or process.env is undefined.
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
4. **输出格式**：必须返回一个 JSON 数组。数组中的每个对象必须包含原输入的 "_index" 字段（用于匹配），以及处理后的 "name" 和 "description"。

示例输入：
[{"_index": 0, "name": "梯度下降", "description": "求解 min f(x) 的方法"}]

示例输出：
[{"_index": 0, "name": "梯度下降", "description": "求解 $\\min f(x)$ 的方法"}]
`;

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
            { text: "请处理以下 JSON 数组。直接返回 JSON 数组，不要使用 Markdown 格式。" },
            { text: JSON.stringify(items) }
          ]
        }
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("Empty response from Gemini");
    }

    // Clean up potential markdown formatting if the model adds it despite instructions
    const cleanText = text.replace(/```json\n?|\n?```/g, '').trim();
    
    const parsed = JSON.parse(cleanText);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (error) {
    console.error("Error processing batch:", error);
    throw error;
  }
}

/**
 * Traverses the JSON object to find all items that have name and description fields.
 * Returns an array of references to these objects.
 */
function findProcessableItems(data: any, items: any[] = []) {
  if (Array.isArray(data)) {
    data.forEach(item => findProcessableItems(item, items));
  } else if (typeof data === 'object' && data !== null) {
    // Check if this node is a target (has name and description strings)
    // We strictly check for strings to avoid processing metadata objects that might look different
    if (typeof data.name === 'string' && typeof data.description === 'string') {
      items.push(data);
    }
    // Continue recursion for all property values to find nested items (e.g. inside "knowledge_points")
    Object.values(data).forEach(value => findProcessableItems(value, items));
  }
  return items;
}

/**
 * Main entry point for processing.
 * 1. Deep clones the data.
 * 2. Finds all processable items recursively.
 * 3. Batches them and sends to AI.
 * 4. Updates the cloned data in place.
 */
export async function processJsonKnowledgeBase(
  originalData: any,
  onProgress: (current: number, total: number) => void
): Promise<any> {
  // Deep clone to avoid mutating original state
  const dataCopy = JSON.parse(JSON.stringify(originalData));
  
  // Find all items that need processing
  const itemsToProcess = findProcessableItems(dataCopy);
  const total = itemsToProcess.length;
  
  console.log(`Found ${total} items to process in the JSON structure.`);

  if (total === 0) {
    return dataCopy;
  }

  const BATCH_SIZE = 10; 

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = itemsToProcess.slice(i, i + BATCH_SIZE);
    
    // Create a lightweight payload for the AI
    const payload = batch.map((item, idx) => ({
      _index: idx, // Local index for mapping back results
      name: item.name,
      description: item.description
    }));

    let retries = 3;
    let success = false;

    while (retries > 0 && !success) {
      try {
        const results = await processBatch(payload);
        
        // Apply results back to the items in dataCopy (via references in batch)
        results.forEach((result: any) => {
          if (typeof result._index === 'number' && batch[result._index]) {
            batch[result._index].name = result.name;
            batch[result._index].description = result.description;
          }
        });
        
        success = true;
      } catch (e) {
        retries--;
        console.warn(`Batch processing failed, retrying... (${retries} attempts left)`, e);
        if (retries === 0) {
            // Optional: fail gracefully by skipping this batch or throwing?
            // For now, we throw to stop execution and alert user
            throw e; 
        }
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    onProgress(Math.min(i + BATCH_SIZE, total), total);
  }

  return dataCopy;
}