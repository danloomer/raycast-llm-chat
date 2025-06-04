import { useMemo, useLayoutEffect, useReducer } from 'react'
import merge, { MultipleTopLevelPatch } from 'mergerino'
import staterino from 'staterino'
import crypto from 'crypto'
import {
  queryLLM,
  stopRequest,
  generateChatTitle,
  ModelId,
  DEFAULT_MODEL_ID,
  isValidModelId,
  isModelWithSearchSupport,
  getTextFromParts,
} from './llm'
import { ChatSession } from '../types'
import { loadState, saveState, PersistentState } from './storage'
import { showToast, Toast } from '@raycast/api'

export const NEW_CHAT_ID = 'new'

export interface State {
  initializing: boolean
  loading: boolean
  query: string
  selectedMessageId: string | null
  activeSessionId: string | null
  persistentState: PersistentState
}

const initialState: State = {
  initializing: true,
  loading: false,
  query: '',
  activeSessionId: null,
  selectedMessageId: null,
  persistentState: {
    sessions: [],
    selectedModelId: DEFAULT_MODEL_ID,
    enableSearchTool: false,
  },
}

export const useStore = staterino<State>({
  hooks: { useLayoutEffect, useReducer },
  merge,
  state: initialState,
})

useStore.subscribe([(s) => s.persistentState, (s) => s.initializing], (nextState, init) => {
  if (!init) saveState(nextState)
})

export const useSortedSessions = () => {
  const sessions = useStore((s) => s.persistentState.sessions)

  return useMemo(
    () => [...sessions].sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt)),
    [sessions],
  )
}

export const isInitializing = () => useStore.get().initializing

export const getActiveSession = (s = useStore.get()) =>
  s.activeSessionId
    ? s.persistentState.sessions.find((sesh) => s.activeSessionId === sesh.id)
    : null
export const useActiveSession = () => useStore(getActiveSession)

export const getSelectedModelId = (s = useStore.get()) =>
  getActiveSession(s)?.modelId ?? s.persistentState.selectedModelId

const getUpdateSessionPatch = (
  sessionId: string,
  updates: Partial<Pick<ChatSession, 'title' | 'history' | 'modelId'>>,
): MultipleTopLevelPatch<State> => {
  const { sessions } = useStore.get().persistentState
  const sessionIndex = sessions.findIndex((s) => s.id === sessionId)
  if (sessionIndex === -1) {
    console.warn('updateSession: session not found', { sessionId, updates })
  }
  return {
    persistentState: { sessions: { [sessionIndex]: { ...updates, updatedAt: Date.now() } } },
  }
}

const setSession = (...args: Parameters<typeof getUpdateSessionPatch>) =>
  useStore.set(getUpdateSessionPatch(...args))

const generateTitleForSession = async (session: ChatSession) => {
  if (session.history.length < 2) return
  const [userMessage, modelMessage] = session.history
  if (!userMessage || !modelMessage) return

  const generatedTitle = await generateChatTitle(
    userMessage.parts,
    modelMessage.parts,
    session.modelId,
  )

  if (generatedTitle) {
    setSession(session.id, { title: generatedTitle })
  }
}

export const sendQuery = async (query: string, searchEnabled: boolean): Promise<boolean> => {
  if (!query.trim() || isInitializing()) return false

  let activeSession = getActiveSession()
  const isNewSession = !activeSession
  const modelToUse = getSelectedModelId()

  if (isNewSession) {
    const initialTitle = query.substring(0, 50) || 'New Chat'
    const now = Date.now()
    const newSession: ChatSession = {
      id: crypto.randomUUID(),
      title: initialTitle,
      history: [],
      createdAt: now,
      updatedAt: now,
      modelId: modelToUse,
    }
    activeSession = newSession
    useStore.set({
      activeSessionId: newSession.id,
      persistentState: { sessions: (x) => [newSession, ...x] },
    })
  }

  if (!activeSession) {
    console.error('Error: No active session found for query.')
    await showToast({
      style: Toast.Style.Failure,
      title: 'Error',
      message: 'Tried to submit prompt but session was not created.',
    })
    return false
  }

  await queryLLM({
    input: query,
    history: activeSession.history,
    modelId: modelToUse,
    enableSearchTool: searchEnabled,
    onStart: (initialMessages) => {
      useStore.set([
        getUpdateSessionPatch(activeSession.id, { history: initialMessages }),
        {
          loading: true,
          query: '',
          selectedMessageId: initialMessages.at(-1)?.id ?? null,
        },
      ])
    },
    onHistoryChange: (streamedHistory) => {
      setSession(activeSession.id, { history: streamedHistory })
    },
  })

  useStore.set({ loading: false })

  // Fetch the potentially updated session state for title generation
  if (!isNewSession) return true
  const finalSessionState = getActiveSession()
  if (finalSessionState) generateTitleForSession(finalSessionState)

  return true
}

export const sendChat = () => {
  const {
    query,
    persistentState: { enableSearchTool },
  } = useStore.get()
  return sendQuery(query, enableSearchTool)
}

export const regenerateFromMessage = async (messageId: string) => {
  const activeSession = getActiveSession()
  if (!activeSession) return false

  const messageIndex = activeSession.history.findIndex((msg) => msg.id === messageId)
  if (messageIndex === -1) return false

  const targetMessage = activeSession.history.at(messageIndex)
  if (!targetMessage) return false

  const truncateOffset = targetMessage.role === 'model' ? -1 : 0
  const userMessage = activeSession.history.at(messageIndex + truncateOffset)
  if (!userMessage || userMessage.role !== 'user') return false
  const userQuery = getTextFromParts(userMessage.parts)
  if (!userQuery) return false

  stopRequest()

  const truncatedHistory = activeSession.history.slice(0, messageIndex + truncateOffset)
  setSession(activeSession.id, { history: truncatedHistory })

  return sendQuery(userQuery, useStore.get().persistentState.enableSearchTool)
}

export const regenerateFromEditedMessage = async (messageId: string, editedContent: string) => {
  const activeSession = getActiveSession()
  if (!activeSession) return false

  const messageIndex = activeSession.history.findIndex((msg) => msg.id === messageId)
  if (messageIndex === -1) return false

  const targetMessage = activeSession.history.at(messageIndex)
  if (!targetMessage || targetMessage.role !== 'user') return false

  stopRequest()

  // Truncate history up to the message we're editing
  const truncatedHistory = activeSession.history.slice(0, messageIndex)
  setSession(activeSession.id, { history: truncatedHistory })

  // Send the edited query
  return sendQuery(editedContent, useStore.get().persistentState.enableSearchTool)
}

export const startNewChat = () => {
  stopRequest()
  useStore.set({ activeSessionId: null, query: '', selectedMessageId: null })
}

export const deleteSession = async (sessionIdToDelete: string) => {
  stopRequest()
  const isCurrentSession = getActiveSession()?.id === sessionIdToDelete
  useStore.set({
    persistentState: {
      sessions: (sessions) => sessions.filter((x) => x.id !== sessionIdToDelete),
    },
  })
  if (isCurrentSession) {
    startNewChat()
  }
}

export const switchSession = (newSessionId: string | null) => {
  const activeSession = getActiveSession()
  const unChanged = activeSession ? activeSession.id === newSessionId : newSessionId === NEW_CHAT_ID
  if (unChanged) return
  stopRequest()
  if (newSessionId === null || newSessionId === NEW_CHAT_ID) {
    startNewChat()
  } else {
    const lastMessageId =
      useStore
        .get()
        .persistentState.sessions.find((s) => s.id === newSessionId)
        ?.history.at(-1)?.id ?? null
    useStore.set({ activeSessionId: newSessionId, selectedMessageId: lastMessageId, query: '' })
  }
}

export const setSelectedModelId = (modelId: ModelId) => {
  const selectedModelId = getSelectedModelId()
  if (modelId === selectedModelId || isInitializing()) return
  const activeSession = getActiveSession()
  if (activeSession?.id) {
    setSession(activeSession.id, { modelId })
  } else {
    useStore.set({ persistentState: { selectedModelId: modelId } })
  }
}

export const setEnableSearchTool = (value: boolean) =>
  useStore.set({ persistentState: { enableSearchTool: value } })

export const setQuery = (query: string) => useStore.set({ query })

async function load() {
  useStore.set({ loading: true })
  const loaded = await loadState()
  
  useStore.set({
    persistentState: loaded,
    initializing: false,
    activeSessionId: null,
    selectedMessageId: null,
    loading: false,
  })
}

console.log('Loading app state.')
load().then(() => console.log('App state loaded.'))

export function useChatState() {
  const activeSession = useActiveSession()
  const sortedSessions = useSortedSessions()

  const selectedModelId = useStore(getSelectedModelId)
  const activeChatHistory = useMemo(() => activeSession?.history ?? [], [activeSession])

  const [isLoading, currentQuery, selectedItemId, enableSearchTool] = useStore([
    (s) => s.loading,
    (s) => s.query,
    (s) => s.selectedMessageId,
    (s) => s.persistentState.enableSearchTool,
  ])

  return {
    isLoading,
    sessions: sortedSessions,
    activeSession,
    activeChatHistory,
    currentQuery,
    selectedItemId,
    selectedModelId,
    enableSearchTool,
    supportsSearchTool: isModelWithSearchSupport(selectedModelId),
  }
}
