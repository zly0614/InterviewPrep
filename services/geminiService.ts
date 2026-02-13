
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { GroundingChunk } from "../types";
import { getCategories } from "./storageService";

export interface GenerateResult {
  answer: string;
  category: string;
  sources: GroundingChunk[];
}

const getCategoryPromptPart = () => {
  const categories = getCategories();
  return `Classify the question into one of these categories: ${categories.join(', ')}.`;
};

/**
 * 核心：生成面试题答案（带联网搜索）
 */
export const generateInterviewAnswer = async (question: string): Promise<GenerateResult> => {
  // Initialize GoogleGenAI with named apiKey parameter as per latest SDK guidelines
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const categories = getCategories();
    // Using gemini-3-pro-preview for complex reasoning, coding, and mathematical derivation tasks
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: `你是一名资深的面试官和技术专家。
      1. 请针对以下问题提供专业、深度且简洁的回答。如果是算法或数学题，请提供详细的推导过程，公式使用 LaTeX ($...$) 格式。
      2. ${getCategoryPromptPart()}
      
      问题: ${question}`,
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: `回复必须以括号形式的分类开头，例如 [分类名称]，随后是详细答案。分类名称必须是以下之一: ${categories.join(', ')}。`
      },
    });

    const fullText = response.text || "";
    let category = "Other";
    let answer = fullText;

    const categoryMatch = fullText.match(/^\[(.*?)\]/);
    if (categoryMatch) {
      category = categoryMatch[1].trim();
      answer = fullText.replace(categoryMatch[0], "").trim();
    }
    
    // Extract grounding chunks for search sources display
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const validSources = chunks
      .filter((chunk: any) => chunk.web?.uri && chunk.web?.title)
      .map((chunk: any) => ({
        web: {
          uri: chunk.web.uri,
          title: chunk.web.title
        }
      })) as GroundingChunk[];

    return { answer, category, sources: validSources };
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

/**
 * 核心：创建一个支持联网搜索的对话会话
 */
export const createAiChatSession = (question: string, currentAnswer: string, history: any[] = []): Chat => {
  // Always create a fresh instance of GoogleGenAI before setting up a session
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  // gemini-3-pro-preview is selected for its superior reasoning in technical discussions
  return ai.chats.create({
    model: 'gemini-3-pro-preview',
    config: {
      tools: [{ googleSearch: {} }],
      systemInstruction: `你是一个面试准备助手。
      当前正在讨论的题目是: "${question}"。
      当前的参考答案是: "${currentAnswer}"。
      请通过联网搜索最新的行业标准、论文或技术文档，帮助用户深入探讨该题目的原理、边界情况或实际应用。
      如果涉及数学推导，请务必使用 LaTeX。`,
    },
  });
};

/**
 * 自动分类
 */
export const autoCategorize = async (question: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const categories = getCategories();
    // gemini-3-flash-preview is sufficient for the basic classification task
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `将此面试题归入以下分类之一: ${categories.join(', ')}。仅返回分类名称。\n\n问题: ${question}`,
      config: { responseMimeType: "text/plain" }
    });
    return response.text?.trim() || "Other";
  } catch (e) {
    return "Other";
  }
};
