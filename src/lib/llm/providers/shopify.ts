import OpenAI from 'openai'
import { LLMProvider, LLMQueryProps } from '../types'
import {
  showMissingApiKeyToast,
  showResponseCompleteToast,
  prepareLastMessageForStreaming,
  getLastMessageText,
} from '../utils'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

const SHOPIFY_MODELS = [
  'gpt-4.1',
  'o3',
  'anthropic:claude-3-7-sonnet',
  'google:gemini-2.5-pro-preview-05-06',
  'gpt-4o',
  'anthropic:claude-3-5-sonnet',
  'google:gemini-2.5-flash-preview-05-20',
  'o3-mini',
  'gpt-4.1-mini',
  'google:gemini-2.0-flash',
] as const

export type ShopifyModelId = (typeof SHOPIFY_MODELS)[number]

async function getShopifyApiKey(): Promise<string> {
  try {
    const { stdout } = await execAsync('/opt/dev/bin/dev llm-gateway print-token --key', {
      env: {
        ...process.env,
        PATH: '/opt/dev/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
      },
    })
    return stdout.trim()
  } catch (error) {
    throw new Error(`Failed to fetch Shopify API key: ${error}`)
  }
}

async function getShopifyClient(): Promise<OpenAI> {
  return new OpenAI({
    apiKey: await getShopifyApiKey(),
    baseURL: 'https://proxy.shopify.ai/v1',
  })
}

async function queryShopify({
  modelId,
  curHistory,
  onHistoryChange,
  abortControllerRef,
}: LLMQueryProps): Promise<string | undefined> {
  const openaiClient = await getShopifyClient()
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
    const openaiClient = await getShopifyClient()

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
