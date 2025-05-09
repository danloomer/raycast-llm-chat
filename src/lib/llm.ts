import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
  GenerateContentRequest,
} from "@google/generative-ai";
import { getPreferenceValues, showToast, Toast } from "@raycast/api";
import { RefObject } from "react";
import { ChatMessage, ChatPart } from "../types";
import crypto from "crypto";

export const AVAILABLE_MODELS = [
  "gemini-2.0-flash",
  "gemini-2.5-flash-preview-04-17",
  "gemini-2.5-pro-preview-03-25",
  "gemini-1.5-pro",
] as const;

export type ModelId = (typeof AVAILABLE_MODELS)[number];

export const DEFAULT_MODEL_ID: ModelId = "gemini-2.0-flash";

export function isValidModelId(id: string | null | undefined): id is ModelId {
  return Boolean(id && AVAILABLE_MODELS.includes(id as ModelId));
}

interface QueryProps {
  input: string;
  history: ChatMessage[];
  modelId: ModelId;
  onStart?(initialHistory: ChatMessage[]): void;
  onHistoryChange?(newHistory: ChatMessage[]): void;
}

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

let abortControllerRef: RefObject<AbortController | null> = { current: null };

export const stopRequest = () => abortControllerRef.current?.abort();

export async function queryGemini({
  input,
  history,
  modelId,
  onStart,
  onHistoryChange,
}: QueryProps): Promise<string | undefined> {
  const { shopifyApiKey } = getPreferenceValues<Preferences>();
  if (!shopifyApiKey) {
    await showToast({
      style: Toast.Style.Failure,
      title: "API Key Missing",
      message:
        "Please add your Shopify AI Proxy API key in extension preferences",
    });
    return;
  }

  if (!input.trim()) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Empty Query",
      message: "Please enter a prompt",
    });
    return;
  }

  const now = Date.now();

  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    date: now,
    parts: [{ text: input }],
  };
  const modelPlaceholder: ChatMessage = {
    id: crypto.randomUUID(),
    role: "assistant",
    date: now,
    parts: [{ text: "..." }],
  };

  let curHistory = [...history, userMessage, modelPlaceholder];
  onStart?.(curHistory);
  onHistoryChange?.(curHistory);

  try {
    stopRequest();
    abortControllerRef.current = new AbortController();

    const genAI = new GoogleGenerativeAI(shopifyApiKey);
    const model = genAI.getGenerativeModel({
      model: modelId,
      safetySettings,
    });

    const cleanHistory = history.map((m) => ({ role: m.role, parts: m.parts }));

    const chat = model.startChat({ history: cleanHistory });

    const result = await chat.sendMessageStream(input, {
      signal: abortControllerRef.current.signal,
    });

    let streamedResponse = "";
    for await (const chunk of result.stream) {
      if (abortControllerRef.current?.signal.aborted) break;
      const chunkText = chunk.text();
      streamedResponse += chunkText;
      const lastMessage = curHistory.at(-1);
      if (lastMessage?.id === modelPlaceholder.id) {
        lastMessage.parts[0].text = streamedResponse;
      } else {
        // Abort if the placeholder message is somehow removed during streaming
        abortControllerRef.current?.abort(
          "model message is no longer the last"
        );
        break;
      }
      onHistoryChange?.([...curHistory]);
    }
    if (!abortControllerRef.current?.signal.aborted) {
      await showToast({
        style: Toast.Style.Success,
        title: "Response Complete",
      });
    }
  } catch (error: any) {
    if (error.name === "AbortError") {
      await showToast({
        style: Toast.Style.Failure,
        title: "Request Cancelled",
      });
    } else {
      console.error("Error querying Gemini:", error);
      await showToast({
        style: Toast.Style.Failure,
        title: "Error Querying Gemini",
        message: error.message,
      });
    }
  } finally {
    abortControllerRef.current = null;
  }

  return getTextFromParts(curHistory.at(-1)?.parts ?? []);
}

export async function generateChatTitle(
  userPromptParts: ChatPart[],
  modelResponseParts: ChatPart[]
): Promise<string | null> {
  const { geminiApiKey } = getPreferenceValues<Preferences>();
  if (!geminiApiKey) {
    console.warn("Cannot generate title: API Key Missing");
    return null;
  }

  const userPrompt = getTextFromParts(userPromptParts);
  const modelResponse = getTextFromParts(modelResponseParts);
  if (!userPrompt.length || !modelResponse.length) {
    console.error("Unable to generate chat title with empty messages.");
    return null;
  }

  const titlePrompt = `Based on the following exchange, suggest a very short title (3-5 words) for the chat session. Only return the title text, nothing else:\n\nUser: ${userPrompt}\nModel: ${modelResponse}\nTitle:`;

  try {
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({
      model: DEFAULT_MODEL_ID, // Use default (e.g., flash) for titles
      safetySettings,
    });

    const request: GenerateContentRequest = {
      contents: [{ role: "user", parts: [{ text: titlePrompt }] }],
    };

    const result = await model.generateContent(request);
    const response = result.response;
    const title = response.text().trim();

    if (!title) {
      console.warn("Title generation returned empty.");
      return null;
    }

    return title;
  } catch (error: any) {
    console.error("Error generating chat title:", error);
    return null;
  }
}

export function getTextFromParts(parts: ChatPart[]) {
  return parts.map((p) => p.text ?? "").join("");
}
