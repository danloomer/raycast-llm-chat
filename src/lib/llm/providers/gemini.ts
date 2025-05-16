import { HarmBlockThreshold, HarmCategory, GoogleGenAI, Modality } from '@google/genai'
import { getPreferenceValues } from '@raycast/api'
import { LLMProvider, LLMQueryProps } from '../types'
import {
  showResponseCompleteToast,
  prepareLastMessageForStreaming,
  getLastMessageText,
} from '../utils'

const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.5-flash-preview-04-17',
  'gemini-2.0-flash-exp-image-generation',
  'gemini-2.5-pro-exp-03-25',
  'gemini-1.5-pro',
] as const

export type GeminiModelId = (typeof GEMINI_MODELS)[number]

const THINKING_MODELS: GeminiModelId[] = [
  'gemini-2.5-pro-exp-03-25',
  'gemini-2.5-flash-preview-04-17',
]

const IMAGE_MODELS: GeminiModelId[] = ['gemini-2.0-flash-exp-image-generation']

const { geminiApiKey } = getPreferenceValues<Preferences>()
export const geminiClient = new GoogleGenAI({ apiKey: geminiApiKey })

export const geminiSafetySettings = [
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
]

async function queryGemini({
  modelId,
  curHistory,
  enableSearchTool,
  onHistoryChange,
  abortControllerRef,
}: LLMQueryProps): Promise<string | undefined> {
  const lastMessage = prepareLastMessageForStreaming(curHistory.at(-1))
  if (!lastMessage) return

  const contents = curHistory.slice(0, -1).map((m) => ({ role: m.role, parts: m.parts }))

  const result = await geminiClient.models.generateContentStream({
    model: modelId as any, // Cast to Gemini model type
    contents,
    config: {
      responseModalities: IMAGE_MODELS.includes(modelId as any)
        ? [Modality.TEXT, Modality.IMAGE]
        : undefined,
      thinkingConfig: THINKING_MODELS.includes(modelId as any)
        ? { includeThoughts: true }
        : undefined,
      abortSignal: abortControllerRef.current!.signal,
      safetySettings: geminiSafetySettings,
      tools:
        enableSearchTool && modelId !== 'gemini-2.0-flash-exp-image-generation'
          ? [{ googleSearch: {} }]
          : undefined,
    },
  })

  for await (const chunk of result) {
    if (abortControllerRef.current?.signal.aborted) break
    const parts = chunk.candidates?.at(0)?.content?.parts
    if (!parts) continue

    lastMessage.parts.push(...parts)
    onHistoryChange?.([...curHistory])
  }

  if (!abortControllerRef.current?.signal.aborted) {
    await showResponseCompleteToast()
  }

  return getLastMessageText(curHistory)
}

export const geminiProvider: LLMProvider<GeminiModelId> = {
  name: 'Google Gemini',
  models: GEMINI_MODELS,
  searchModels: GEMINI_MODELS,
  weakModel: 'gemini-2.0-flash',
  isModel: (modelId: string): boolean => GEMINI_MODELS.includes(modelId as any),
  query: queryGemini,
  generateText: async (prompt: string, { maxTokens } = {}): Promise<string | null> => {
    try {
      const result = await geminiClient.models.generateContent({
        model: geminiProvider.weakModel,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { safetySettings: geminiSafetySettings, maxOutputTokens: maxTokens },
      })

      return result.text?.trim() || null
    } catch (error: any) {
      console.error('Error generating text with Gemini:', error)
      return null
    }
  },
}
