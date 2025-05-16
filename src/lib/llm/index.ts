import { showToast, Toast } from '@raycast/api'
import { RefObject } from 'react'
import { ChatMessage, ChatPart } from '../../types'
import crypto from 'crypto'
import { base64ToMarkdownImage } from '../util'
import { geminiProvider } from './providers/gemini'
import { openaiProvider } from './providers/openai'
import { anthropicProvider } from './providers/anthropic'

export const providers = [geminiProvider, openaiProvider, anthropicProvider]

export const AVAILABLE_MODELS = providers.flatMap((p) => p.models)

export type ModelId = (typeof AVAILABLE_MODELS)[number]

export const DEFAULT_MODEL_ID: ModelId = 'gemini-2.5-flash-preview-04-17'

export function isValidModelId(id: string | null | undefined): id is ModelId {
  return Boolean(id && AVAILABLE_MODELS.includes(id as ModelId))
}

export function isModelWithSearchSupport(modelId: ModelId): boolean {
  return providers.some((p) => p.searchModels?.includes(modelId as never))
}

interface QueryProps {
  input: string
  history: ChatMessage[]
  modelId: ModelId
  enableSearchTool: boolean
  onStart?(initialHistory: ChatMessage[]): void
  onHistoryChange?(newHistory: ChatMessage[]): void
}

let abortControllerRef: RefObject<AbortController | null> = { current: null }

export const stopRequest = () => abortControllerRef.current?.abort()

export async function queryLLM({
  input,
  history,
  modelId,
  enableSearchTool,
  onStart,
  onHistoryChange,
}: QueryProps): Promise<string | undefined> {
  if (!input.trim()) {
    await showToast({
      style: Toast.Style.Failure,
      title: 'Empty Query',
      message: 'Please enter a prompt',
    })
    return
  }

  const now = Date.now()

  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    date: now,
    parts: [{ text: input }],
  }
  const modelPlaceholder: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'model',
    date: now,
    parts: [{ text: '...' }],
  }

  let curHistory = [...history, userMessage, modelPlaceholder]
  onStart?.(curHistory)
  onHistoryChange?.(curHistory)

  try {
    stopRequest()
    abortControllerRef.current = new AbortController()

    const provider = providers.find((p) => p.isModel(modelId))

    if (provider) {
      return await provider.query({
        modelId,
        curHistory,
        enableSearchTool,
        onHistoryChange,
        abortControllerRef,
      })
    } else {
      throw new Error(`Unsupported model: ${modelId}`)
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      await showToast({
        style: Toast.Style.Failure,
        title: 'Request Cancelled',
      })
    } else {
      console.error('Error querying LLM:', error)
      await showToast({
        style: Toast.Style.Failure,
        title: 'Error Querying LLM',
        message: error.message,
      })
    }
  } finally {
    abortControllerRef.current = null
  }

  return getTextFromParts(curHistory.at(-1)?.parts ?? [])
}

export async function generateChatTitle(
  userPromptParts: ChatPart[],
  modelResponseParts: ChatPart[],
  modelId?: ModelId,
): Promise<string | null> {
  const userPrompt = getTextFromParts(userPromptParts).trim()
  const modelResponse = getTextFromParts(modelResponseParts).trim()
  if (!userPrompt || !modelResponse) {
    console.error('Unable to generate chat title with empty messages.')
    return null
  }

  const titlePrompt = `Based on the following exchange, suggest a very short title (3-5 words) for the chat session. Only return the title text, nothing else:\n\nUser: ${userPrompt}\nModel: ${modelResponse}\nTitle:`

  try {
    const selectedProvider =
      (modelId != null && providers.find((p) => p.isModel(modelId))) || geminiProvider

    return await selectedProvider.generateText(titlePrompt, { maxTokens: 20 })
  } catch (error: any) {
    console.error('Error generating chat title:', error)
    return null
  }
}

export function getTextFromParts(parts: ChatPart[]) {
  return parts.map((p) => p.text ?? '').join('')
}

export function getTextAndImagesFromParts(parts: ChatPart[]) {
  return parts.reduce(
    (acc, p) =>
      p.inlineData?.data && p.inlineData.mimeType
        ? `${acc}${p.text ?? ''}\n${base64ToMarkdownImage(p.inlineData.data, p.inlineData.mimeType)}\n`
        : acc + (p.text ?? ''),
    '',
  )
}
