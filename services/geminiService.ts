import { GoogleGenAI, Chat } from "@google/genai";
import { GroundingChunk } from "../types";
import { getCategories } from "./storageService";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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
 * Generates an interview answer using Gemini with Google Search grounding.
 */
export const generateInterviewAnswer = async (question: string): Promise<GenerateResult> => {
  try {
    const categories = getCategories();
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are an expert career coach. 
      1. Provide a professional, concise answer to the question.
      2. ${getCategoryPromptPart()}
      
      Question: ${question}`,
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: `Always start your response with the category in brackets, like [Category Name], followed by the answer. The Category Name MUST be one of: ${categories.join(', ')}.`
      },
    });

    // Directly access text property from the response
    const fullText = response.text || "";
    let category = "Other";
    let answer = fullText;

    const categoryMatch = fullText.match(/^\[(.*?)\]/);
    if (categoryMatch) {
      category = categoryMatch[1].trim();
      answer = fullText.replace(categoryMatch[0], "").trim();
    }
    
    // Extract grounding URLs from search tool metadata
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const validSources = chunks
      .filter((chunk: any) => chunk.web?.uri && chunk.web?.title)
      .map((chunk: any) => ({
        web: {
          uri: chunk.web.uri,
          title: chunk.web.title
        }
      })) as GroundingChunk[];

    return {
      answer,
      category,
      sources: validSources,
    };
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("Failed to generate answer.");
  }
};

/**
 * Initializes a new chat session for refining interview answers.
 */
export const createAiChatSession = (question: string, currentAnswer: string): Chat => {
  return ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      tools: [{ googleSearch: {} }],
      systemInstruction: `You are a helpful interview preparation assistant. 
      The user is currently editing an answer for the interview question: "${question}".
      The current answer is: "${currentAnswer}".
      Help the user refine, expand, or correct this answer based on the latest industry standards and web search.
      Keep your responses professional and helpful.`,
    },
  });
};

/**
 * Categorizes a question based on its content using the Gemini model.
 */
export const autoCategorize = async (question: string): Promise<string> => {
  try {
    const categories = getCategories();
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Classify this interview question into exactly one category from this list: ${categories.join(', ')}.
      Return ONLY the category name.
      
      Question: ${question}`,
      config: {
        responseMimeType: "text/plain"
      }
    });
    return response.text?.trim() || "Other";
  } catch (e) {
    return "Other";
  }
};