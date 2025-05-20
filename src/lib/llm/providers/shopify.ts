import OpenAI from 'openai'
import { LLMProvider, LLMQueryProps } from '../types'
import {
  showMissingApiKeyToast,
  showResponseCompleteToast,
  prepareLastMessageForStreaming,
  getLastMessageText,
} from '../utils'
import { execSync } from 'child_process'

const SHOPIFY_MODELS = [
  'gpt-4.1',
  'gpt-4.5-preview',
  'o3',
  'o3-mini',
  'gpt-4.1-mini',
  'anthropic:claude-3-5-sonnet',
  'anthropic:claude-3-7-sonnet',
  'gpt-4o',
] as const

export type ShopifyModelId = (typeof SHOPIFY_MODELS)[number]

function getShopifyApiKey(): string {
  try {
    return execSync('/opt/dev/bin/dev llm-gateway print-token --key', {
      env: {
        ...process.env,
        PATH: '/opt/dev/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
      },
    })
      .toString()
      .trim()
  } catch (error) {
    throw new Error(`Failed to fetch Shopify API key: ${error}`)
  }
}

function getShopifyClient(): OpenAI {
  return new OpenAI({
    apiKey: getShopifyApiKey(),
    baseURL: 'https://proxy.shopify.ai/v1',
  })
}

async function queryShopify({
  modelId,
  curHistory,
  onHistoryChange,
  abortControllerRef,
}: LLMQueryProps): Promise<string | undefined> {
  const openaiClient = getShopifyClient()
  if (!openaiClient) {
    await showMissingApiKeyToast('Shopify')
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

export const shopifyProvider: LLMProvider<ShopifyModelId> = {
  name: 'Shopify',
  models: SHOPIFY_MODELS,
  weakModel: 'gpt-4.1-mini',
  isModel: (modelId: string): boolean => SHOPIFY_MODELS.includes(modelId as any),
  query: queryShopify,
  generateText: async (prompt: string, options = {}): Promise<string | null> => {
    const openaiClient = getShopifyClient()

    try {
      const response = await openaiClient.chat.completions.create({
        model: shopifyProvider.weakModel,
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: options.maxTokens,
      })

      return response.choices[0]?.message?.content?.trim() || null
    } catch (error: any) {
      console.error('Error generating text with Shopify:', error)
      return null
    }
  },
}
