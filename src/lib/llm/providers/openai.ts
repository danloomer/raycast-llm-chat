import OpenAI from 'openai'
import { getPreferenceValues } from '@raycast/api'
import { LLMProvider, LLMQueryProps } from '../types'
import {
  showMissingApiKeyToast,
  showResponseCompleteToast,
  prepareLastMessageForStreaming,
  getLastMessageText,
} from '../utils'

const OPENAI_MODELS = ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o'] as const

export type OpenAIModelId = (typeof OPENAI_MODELS)[number]

const { openaiApiKey } = getPreferenceValues<Preferences>()
export const openaiClient = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null

async function queryOpenAI({
  modelId,
  curHistory,
  onHistoryChange,
  abortControllerRef,
}: LLMQueryProps): Promise<string | undefined> {
  if (!openaiClient) {
    await showMissingApiKeyToast('OpenAI')
    return
  }

  const lastMessage = prepareLastMessageForStreaming(curHistory.at(-1))
  if (!lastMessage) return

  // Convert Gemini-style messages to OpenAI format
  const messages = curHistory.slice(0, -1).map((msg) => ({
    role: msg.role === 'user' ? ('user' as const) : ('assistant' as const),
    content: msg.parts.map((part) => part.text || '').join(''),
  }))

  const stream = await openaiClient.chat.completions.create({
    model: modelId,
    messages,
    stream: true,
  })

  for await (const chunk of stream) {
    if (abortControllerRef.current?.signal.aborted) break
    const content = chunk.choices[0]?.delta?.content

    if (content) {
      lastMessage.parts.push({ text: content })
      onHistoryChange?.([...curHistory])
    }
  }

  if (!abortControllerRef.current?.signal.aborted) {
    await showResponseCompleteToast()
  }

  return getLastMessageText(curHistory)
}

export const openaiProvider: LLMProvider<OpenAIModelId> = {
  name: 'OpenAI',
  models: OPENAI_MODELS,
  weakModel: 'gpt-4.1-mini',
  isModel: (modelId: string): boolean => OPENAI_MODELS.includes(modelId as any),
  query: queryOpenAI,
  generateText: async (prompt: string, options = {}): Promise<string | null> => {
    if (!openaiClient) {
      console.error('OpenAI API key is not set.')
      return null
    }

    try {
      const response = await openaiClient.chat.completions.create({
        model: openaiProvider.weakModel,
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: options.maxTokens,
      })

      return response.choices[0]?.message?.content?.trim() || null
    } catch (error: any) {
      console.error('Error generating text with OpenAI:', error)
      return null
    }
  },
}
