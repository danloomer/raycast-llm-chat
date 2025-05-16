import { LocalStorage } from '@raycast/api'
import { ChatSession } from '../types'
import { throttle } from './util'
import { DEFAULT_MODEL_ID, ModelId } from './llm'

const STATE_KEY = 'geminiChatState'
//const STATE_KEY = 'geminiChatState_test'

export interface PersistentState {
  sessions: ChatSession[]
  selectedModelId: ModelId
  enableSearchTool: boolean
}

const persistState = async (state: PersistentState) => {
  try {
    await LocalStorage.setItem(STATE_KEY, JSON.stringify(state))
  } catch (error) {
    console.error('Failed to save state:', error)
  }
}

const throttledPersistState = throttle(persistState, 500)

export function saveState(state: PersistentState): PersistentState {
  throttledPersistState(state)
  return state
}

export async function loadState(): Promise<PersistentState> {
  const defaultState: PersistentState = {
    sessions: [],
    selectedModelId: DEFAULT_MODEL_ID,
    enableSearchTool: false,
  }

  try {
    const stateJson = await LocalStorage.getItem<string>(STATE_KEY)
    if (stateJson) {
      const loadedState = JSON.parse(stateJson) as Partial<PersistentState>

      // Ensure all sessions have a modelId
      const sessions = (loadedState.sessions ?? []).map((session) => ({
        ...session,
        modelId: session.modelId || loadedState.selectedModelId || DEFAULT_MODEL_ID,
      }))

      return {
        sessions,
        selectedModelId: loadedState.selectedModelId ?? DEFAULT_MODEL_ID,
        enableSearchTool: loadedState.enableSearchTool ?? false,
      }
    }

    return defaultState
  } catch (error) {
    console.error('Failed to load state:', error)
    return defaultState
  }
}
