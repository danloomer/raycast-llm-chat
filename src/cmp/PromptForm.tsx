import { Form, ActionPanel, Action, Icon, useNavigation } from '@raycast/api'
import { ModelId, getTextFromParts, providers } from '../lib/llm'
import {
  isInitializing,
  NEW_CHAT_ID,
  sendChat,
  setEnableSearchTool,
  setQuery,
  setSelectedModelId,
  switchSession,
  useChatState,
  useStore,
  regenerateFromEditedMessage,
} from '../lib/chat-state'
import { useEffect } from 'react'
import { ModelSubmenu } from './ModelSubmenu'
import { SessionDropdown } from './SessionDropDown'

interface Props {
  editMode?: boolean
  editMessageId?: string
}

export function PromptForm({ editMode, editMessageId }: Props) {
  const {
    isLoading,
    activeSession,
    currentQuery,
    supportsSearchTool,
    enableSearchTool,
    selectedModelId,
    sessions,
    activeChatHistory,
  } = useChatState()

  const { pop } = useNavigation()

  const isInit = useStore(isInitializing)

  useEffect(() => {
    if (editMessageId) {
      const messageToEdit = activeChatHistory.find((msg) => msg.id === editMessageId)
      if (messageToEdit?.role === 'user') {
        const text = getTextFromParts(messageToEdit.parts)
        // the timeout fixes weird raycast flickering textarea
        // seems to happen when query changes too soon after mount
        const id = setTimeout(() => setQuery(text), 50)
        return () => {
          clearTimeout(id)
          setQuery('')
        }
      } else {
        console.error('PromptForm: unable to load editMessageId, message not found in session')
        pop()
      }
    }
  }, [editMessageId, activeChatHistory])

  if (isInit) {
    return (
      <Form isLoading>
        <Form.Description text="Please wait while extension state loads." />
      </Form>
    )
  }

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={
              editMessageId ? 'Edit and Regenerate' : activeSession ? 'Send Message' : 'Start Chat'
            }
            onSubmit={async () => {
              if (editMode && activeSession) pop()
              if (editMessageId) {
                await regenerateFromEditedMessage(editMessageId, currentQuery)
              } else {
                await sendChat()
              }
            }}
            icon={editMessageId ? Icon.Repeat : Icon.SpeechBubble}
          />
          <ModelSubmenu value={selectedModelId} onChange={setSelectedModelId} />
        </ActionPanel>
      }
      navigationTitle={editMessageId ? 'Edit and Regenerate' : (activeSession?.title ?? 'New Chat')}
    >
      <Form.TextArea id="prompt" title="Prompt" value={currentQuery} onChange={setQuery} />
      {!activeSession && (
        <SessionDropdown
          type="form"
          selectedId={NEW_CHAT_ID}
          onChange={switchSession}
          sessions={sessions}
        />
      )}
      {supportsSearchTool && (
        <Form.Checkbox
          id="enableSearch"
          label="Enable Google Search Grounding"
          info="Allow the model to use Google Search to augment its responses."
          value={enableSearchTool}
          onChange={setEnableSearchTool}
        />
      )}
      <Form.Dropdown
        id="model-selector"
        title="Model"
        value={selectedModelId}
        onChange={(newValue) => setSelectedModelId(newValue as ModelId)}
      >
        {providers.map((provider) => (
          <Form.Dropdown.Section key={provider.name} title={provider.name}>
            {provider.models.map((model) => (
              <Form.Dropdown.Item key={model} title={model} value={model} />
            ))}
          </Form.Dropdown.Section>
        ))}
      </Form.Dropdown>
    </Form>
  )
}
