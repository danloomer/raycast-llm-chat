import OpenAI from 'openai'
import { LLMProvider, LLMQueryProps, LLMGenerateTextOptions } from '../types'
import {
  showMissingApiKeyToast,
  showResponseCompleteToast,
  prepareLastMessageForStreaming,
  getLastMessageText,
} from '../utils'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// Cache models
let cachedShopifyModels: string[] | null = null
let modelsLoadingPromise: Promise<string[]> | null = null

async function getCachedShopifyModels(): Promise<string[]> {
  if (cachedShopifyModels) return cachedShopifyModels
  if (modelsLoadingPromise) return modelsLoadingPromise

  modelsLoadingPromise = getShopifyModels().then((models) => {
    cachedShopifyModels = models
    modelsLoadingPromise = null
    return models
  })
  return modelsLoadingPromise
}

// Simple cache for the API key
let cachedApiKey: string | null = null
let isRefreshing = false
let authRetryCount = 0
const MAX_AUTH_RETRIES = 1

function handleAuthError(error: any): boolean {
  const isAuthError =
    error?.status === 401 ||
    error?.message?.includes('unauthorized') ||
    error?.message?.includes('authentication')

  if (isAuthError && authRetryCount < MAX_AUTH_RETRIES) {
    cachedApiKey = null
    authRetryCount++
    return true
  }

  authRetryCount = 0
  return false
}

async function fetchShopifyApiKey(): Promise<string> {
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

async function getShopifyApiKey(): Promise<string> {
  // If we already have a cached key, return it
  if (cachedApiKey) {
    return cachedApiKey
  }

  // If a refresh is already in progress, wait for it
  if (isRefreshing) {
    while (isRefreshing) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    if (cachedApiKey) {
      return cachedApiKey
    }
  }

  // Otherwise fetch a new key
  isRefreshing = true
  try {
    const key = await fetchShopifyApiKey()
    cachedApiKey = key
    return key
  } finally {
    isRefreshing = false
  }
}

async function getShopifyClient(): Promise<OpenAI> {
  return new OpenAI({
    apiKey: await getShopifyApiKey(),
    baseURL: 'https://proxy.shopify.ai/v1',
  })
}

async function getShopifyModels(retries = 0): Promise<string[]> {
  try {
    const openaiClient = await getShopifyClient()

    if (!openaiClient) {
      console.error('Shopify client is not available')
      return []
    }

    const response = await openaiClient.models.list()

    const models = response.data.map((model) => model.id)

    const filteredModels = models.filter((model) => {
      if (!model || model === '') return false
      // Exclude models with a suffix (e.g. "-preview", "-dev", "-20240101") if a base model exists
      const baseModel = model.replace(
        /-((\d{4}-\d{2}-\d{2})|\d{6,}|\d{8,}|preview|dev|test|beta|alpha)$/i,
        '',
      )
      if (baseModel !== model && models.includes(baseModel)) return false

      // Exclude models with a suffix (e.g. "-foo") if a base model exists
      if (/-\w+$/.test(model) && models.includes(model.replace(/-\w+$/, ''))) return false

      // Exclude models with "@" in the name if a base model exists
      if (model.includes('@') && models.includes(baseModel)) return false

      // Exclude prefixed models if a non-prefixed version exists
      const nonPrefixed = model.replace(/^(openai:|google:|anthropic:)/i, '')
      if (nonPrefixed !== model && models.includes(nonPrefixed)) return false
      if (!nonPrefixed || nonPrefixed.trim() === '') return false

      return true
    })

    const uniqueModels = Array.from(new Set(filteredModels))

    return uniqueModels.length > 0 ? uniqueModels : models
  } catch (error: any) {
    if (handleAuthError(error) && retries < 3) {
      return getShopifyModels(retries + 1)
    }
    console.error('Error fetching Shopify models:', error)
    return []
  }
}

async function queryShopify(props: LLMQueryProps): Promise<string | undefined> {
  const { modelId, curHistory, onHistoryChange, abortControllerRef } = props
  try {
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
  } catch (error: any) {
    if (handleAuthError(error)) {
      return queryShopify(props)
    }

    throw error
  }
}

async function generateShopifyText(
  prompt: string,
  options: LLMGenerateTextOptions,
): Promise<string | null> {
  try {
    const openaiClient = await getShopifyClient()
    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4.1-mini', // Using weakModel directly here
      messages: [{ role: 'user', content: prompt }],
      max_completion_tokens: options.maxTokens,
    })

    return response.choices[0]?.message?.content?.trim() || null
  } catch (error: any) {
    if (handleAuthError(error)) {
      return generateShopifyText(prompt, options)
    }

    console.error('Error generating text with Shopify:', error)
    return null
  }
}

async function checkIsModel(modelId: string): Promise<boolean> {
  const models = await getCachedShopifyModels()
  return models.includes(modelId)
}

export const shopifyProvider: LLMProvider<string> = {
  name: 'Shopify',
  weakModel: 'gpt-4.1-mini',
  models: cachedShopifyModels,
  isModel: async (modelId: string): Promise<boolean> => checkIsModel(modelId),
  getModels: getCachedShopifyModels,
  query: queryShopify,
  generateText: generateShopifyText,
}
