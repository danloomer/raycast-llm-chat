import Anthropic from '@anthropic-ai/sdk'
import { RawContentBlockStartEvent } from '@anthropic-ai/sdk/resources'
import { getPreferenceValues, showToast, Toast } from '@raycast/api'
import { LLMProvider, LLMQueryProps } from '../types'
import {
  showMissingApiKeyToast,
  showResponseCompleteToast,
  prepareLastMessageForStreaming,
  getLastMessageText,
} from '../utils'

const ANTHROPIC_MODELS = [
  'claude-3-7-sonnet-20250219',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
] as const

export type AnthropicModelId = (typeof ANTHROPIC_MODELS)[number]

const { anthropicApiKey } = getPreferenceValues<Preferences>()
export const anthropicClient = anthropicApiKey ? new Anthropic({ apiKey: anthropicApiKey }) : null

async function queryAnthropic({
  modelId,
  curHistory,
  onHistoryChange,
  abortControllerRef,
}: LLMQueryProps): Promise<string | undefined> {
  if (!anthropicClient) {
    await showMissingApiKeyToast('Anthropic')
    return
  }

  const lastMessage = prepareLastMessageForStreaming(curHistory.at(-1))
  if (!lastMessage) return

  // Convert Gemini-style messages to Anthropic format
  const messages = curHistory.slice(0, -1).map(
    (msg) =>
      ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.parts.map((part) => part.text || '').join(''),
      }) as const,
  )

  try {
    const stream = await anthropicClient.messages.create({
      model: modelId,
      messages,
      // create setting for thinking
      max_tokens: 4096,
      stream: true,
    })

    let first = true
    let currentBlock: null | RawContentBlockStartEvent['content_block']['type'] = null
    const getChunkText = (chunk: Anthropic.Messages.RawMessageStreamEvent) => {
      if (chunk.type === 'content_block_start') {
        const wasFirst = first
        first = false
        currentBlock = chunk.content_block.type
        if (wasFirst && currentBlock === 'text') return
        return `${wasFirst ? '' : '\n\n'}### \`${currentBlock}\`\n\n`
      }
      if (chunk.type !== 'content_block_delta') return
      const { delta } = chunk
      if (delta.type === 'text_delta') return delta.text
      if (delta.type === 'thinking_delta') return delta.thinking
      return
    }

    for await (const chunk of stream) {
      if (abortControllerRef.current?.signal.aborted) break
      const content = getChunkText(chunk)

      if (content) {
        lastMessage.parts.push({ text: content })
        onHistoryChange?.([...curHistory])
      }
    }

    if (!abortControllerRef.current?.signal.aborted) {
      await showResponseCompleteToast()
    }
  } catch (error: any) {
    console.error('Anthropic API error:', error)
    await showToast({
      style: Toast.Style.Failure,
      title: 'Anthropic API Error',
      message: error.message,
    })
  }

  return getLastMessageText(curHistory)
}

export const anthropicProvider: LLMProvider<AnthropicModelId> = {
  name: 'Anthropic',
  models: ANTHROPIC_MODELS,
  weakModel: 'claude-3-5-haiku-20241022',
  isModel: (modelId: string): boolean => ANTHROPIC_MODELS.includes(modelId as any),
  query: queryAnthropic,
  generateText: async (prompt: string, { maxTokens } = {}): Promise<string | null> => {
    if (!anthropicClient) {
      console.error('Anthropic API key is not set.')
      return null
    }

    try {
      const response = await anthropicClient.messages.create({
        model: anthropicProvider.weakModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens ?? 500,
      })

      const content = response.content.at(0)
      return content?.type === 'text' ? content.text : null
    } catch (error: any) {
      console.error('Error generating text with Anthropic:', error)
      return null
    }
  },
}
