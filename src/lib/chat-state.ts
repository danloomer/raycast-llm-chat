import { useState, useEffect, useCallback, useMemo } from 'react'
import crypto from 'crypto'
import {
  queryGemini,
  stopRequest,
  generateChatTitle,
  ModelId,
  DEFAULT_MODEL_ID,
  isValidModelId,
} from './llm'
import { ChatSession } from '../types'
import { loadState, saveState, PersistentState } from './storage'
import { useLatestRef, useTimeout } from '../hooks'

export const NEW_CHAT_ID = 'new'

export function useChatState(initialQuery?: string) {
  const [isLoading, setIsLoading] = useState(true)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [currentQuery, setCurrentQuery] = useState<string>(initialQuery ?? '')
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<ModelId>(DEFAULT_MODEL_ID)

  const sessionsRef = useLatestRef(sessions)
  const selectedModelIdRef = useLatestRef(selectedModelId)

  const saveChatState = useCallback(
    (nextSessions: ChatSession[]): ChatSession[] => {
      const stateToSave: PersistentState = {
        sessions: nextSessions,
        selectedModelId: selectedModelIdRef.current,
      }
      return saveState(stateToSave)
    },
    [selectedModelIdRef],
  )

  const updateSession = useCallback(
    (sessionId: string, updates: Partial<ChatSession>) => {
      setSessions((prevSessions) => {
        const sessionIndex = prevSessions.findIndex((s) => s.id === sessionId)
        if (sessionIndex === -1) {
          console.warn(`Session ${sessionId} not found for update`)
          stopRequest()
          return prevSessions
        }

        const updatedSession = {
          ...prevSessions[sessionIndex],
          ...updates,
          updatedAt: Date.now(),
        }
        const nextSessions = [...prevSessions]
        nextSessions[sessionIndex] = updatedSession
        return saveChatState(nextSessions)
      })
    },
    [saveChatState],
  )

  const generateTitleForSession = useCallback(
    async (session: ChatSession) => {
      if (session.history.length < 2) return
      const [userMessage, modelMessage] = session.history
      if (!userMessage || !modelMessage) return

      const generatedTitle = await generateChatTitle(userMessage.parts, modelMessage.parts)

      if (generatedTitle) {
        updateSession(session.id, { title: generatedTitle })
      }
    },
    [updateSession],
  )

  const handleQuery = useCallback(
    async (input: string) => {
      if (!input.trim()) return

      let currentSessionId = activeSessionId
      let sessionToUpdate: ChatSession | null =
        sessionsRef.current.find((s) => s.id === currentSessionId) ?? null
      let isNewSession = false
      const modelToUse = selectedModelIdRef.current

      if (!currentSessionId || !sessionToUpdate) {
        isNewSession = true
        const initialTitle = input.substring(0, 50) || 'New Chat'
        const now = Date.now()
        const newSession: ChatSession = {
          id: crypto.randomUUID(),
          title: initialTitle,
          history: [],
          createdAt: now,
          updatedAt: now,
        }
        currentSessionId = newSession.id
        sessionToUpdate = newSession

        setSessions((prevSessions) => saveChatState([newSession, ...prevSessions]))
        setActiveSessionId(newSession.id)
      }

      if (!sessionToUpdate || !currentSessionId) {
        console.error('Error: No active session found for query.')
        return
      }

      const targetSessionId = currentSessionId

      await queryGemini({
        input,
        history: sessionToUpdate.history,
        modelId: modelToUse,
        onStart: (initialMessages) => {
          updateSession(targetSessionId, { history: initialMessages })
          setIsLoading(true)
          setCurrentQuery('')
          setSelectedItemId(initialMessages.at(-1)?.id ?? null)
        },
        onHistoryChange: (streamedHistory) => {
          updateSession(targetSessionId, { history: streamedHistory })
        },
      })

      setIsLoading(false)

      // Fetch the potentially updated session state for title generation
      const finalSessionState = sessionsRef.current.find((s) => s.id === targetSessionId)
      if (isNewSession && finalSessionState) {
        generateTitleForSession(finalSessionState)
      }
    },
    [activeSessionId, updateSession, generateTitleForSession, saveChatState],
  )

  // Initial Loading Effect
  useTimeout(
    50,
    () => {
      async function load() {
        setIsLoading(true)
        const loaded = await loadState()
        setSessions(loaded.sessions)
        if (isValidModelId(loaded.selectedModelId)) {
          setSelectedModelId(loaded.selectedModelId)
        } else {
          setSelectedModelId(DEFAULT_MODEL_ID)
          // Optionally save state here if loaded.selectedModelId was invalid but non-null
          if (loaded.selectedModelId !== null) {
            saveState({ sessions: loaded.sessions, selectedModelId: DEFAULT_MODEL_ID })
          }
        }

        setActiveSessionId(null)
        setSelectedItemId(null)

        if (initialQuery) {
          handleQuery(initialQuery)
        } else {
          setIsLoading(false)
        }
      }
      load()
    },
    [],
  )

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt)),
    [sessions],
  )

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId),
    [sessions, activeSessionId],
  )
  const activeChatHistory = useMemo(() => activeSession?.history ?? [], [activeSession])

  const startNewChat = useCallback(() => {
    stopRequest()
    setActiveSessionId(null)
    setCurrentQuery('')
    setSelectedItemId(null)
    setIsLoading(false)
  }, [])

  const handleDeleteSession = useCallback(
    async (sessionIdToDelete: string) => {
      stopRequest()
      setSessions((curSessions) => {
        const nextSessions = curSessions.filter((x) => x.id !== sessionIdToDelete)
        return saveChatState(nextSessions)
      })
      if (activeSessionId === sessionIdToDelete) {
        startNewChat()
      }
    },
    [activeSessionId, startNewChat, saveChatState],
  )

  const switchSession = useCallback(
    (newSessionId: string | null) => {
      stopRequest()
      if (newSessionId === null || newSessionId === NEW_CHAT_ID) {
        startNewChat()
      } else {
        setActiveSessionId(newSessionId)
        setSelectedItemId(
          sessionsRef.current.find((s) => s.id === newSessionId)?.history.at(-1)?.id ?? null,
        )
        setCurrentQuery('')
        setIsLoading(false)
      }
    },
    [sessionsRef, startNewChat],
  )

  // Effect to Save Model ID When Changed Directly
  useEffect(() => {
    if (!isLoading && selectedModelId !== selectedModelIdRef.current) {
      saveState({ sessions: sessionsRef.current, selectedModelId })
    }
  }, [selectedModelId, isLoading])

  // Cancel any ongoing request when component unmounts
  useEffect(() => () => stopRequest(), [])

  return {
    isLoading,
    sessions: sortedSessions,
    activeSessionId,
    activeSession,
    activeChatHistory,
    currentQuery,
    selectedItemId,
    selectedModelId,
    handleQuery,
    startNewChat,
    handleDeleteSession,
    switchSession,
    setCurrentQuery,
    setSelectedItemId,
    setSelectedModelId,
  }
}
