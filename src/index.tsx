import { useActiveSession } from './lib/chat-state'
import { PromptForm } from './cmp/PromptForm'
import { ChatList } from './cmp/ChatList'
import { useEffect } from 'react'
import { stopRequest } from './lib/llm'

export default function Command() {
  const activeSession = useActiveSession()

  // Cancel any ongoing request when component unmounts
  useEffect(() => () => stopRequest(), [])

  if (activeSession) {
    return <ChatList activeSession={activeSession} />
  }

  return <PromptForm />
}
