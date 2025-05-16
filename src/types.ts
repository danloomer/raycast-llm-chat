import { Part } from '@google/genai'
import { ModelId } from './lib/llm'

export interface ChatMessage {
  id: string
  date: number
  role: 'user' | 'model'
  parts: ChatPart[]
}

export type ChatPart = Part

export interface ChatSession {
  id: string
  title: string
  history: ChatMessage[]
  createdAt: number
  updatedAt: number
  modelId: ModelId
}
