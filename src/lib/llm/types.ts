import { RefObject } from 'react'
import { ChatMessage } from '../../types'

export interface LLMProvider<T extends string = string> {
  name: string
  models: readonly T[]
  searchModels?: readonly T[]
  weakModel: T
  isModel: (modelId: string) => boolean
  query: (props: LLMQueryProps) => Promise<string | undefined>
  generateText: (prompt: string, options: LLMGenerateTextOptions) => Promise<string | null>
}

export interface LLMQueryProps {
  modelId: string
  curHistory: ChatMessage[]
  enableSearchTool: boolean
  onHistoryChange?(newHistory: ChatMessage[]): void
  abortControllerRef: RefObject<AbortController | null>
}

export interface LLMGenerateTextOptions {
  maxTokens?: number
}
