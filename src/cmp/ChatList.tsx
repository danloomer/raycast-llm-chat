import { Action, Icon, List, ActionPanel } from '@raycast/api'
import {
  deleteSession,
  sendChat,
  setQuery,
  setSelectedModelId,
  startNewChat,
  switchSession,
  useChatState,
} from '../lib/chat-state'
import { stopRequest, getTextAndImagesFromParts, getTextFromParts } from '../lib/llm'
import { regenerateFromMessage } from '../lib/chat-state'
import { formatTimestamp } from '../lib/util'
import { ModelSubmenu } from './ModelSubmenu'
import { ChatSession } from '../types'
import { SessionDropdown } from './SessionDropDown'
import { PromptForm } from './PromptForm'
import { CopyAction } from './CopyAction'

interface Props {
  activeSession: ChatSession
}

export function ChatList({ activeSession }: Props) {
  const { isLoading, currentQuery, activeChatHistory, selectedItemId, selectedModelId, sessions } =
    useChatState()

  const sendMessageAction = currentQuery.trim() && (
    <Action title="Send Message" icon={Icon.SpeechBubble} onAction={sendChat} />
  )

  const commonActions = (
    <>
      <Action.Push
        title="Edit prompt in multiline field"
        icon={Icon.TextInput}
        target={<PromptForm editMode />}
        shortcut={{ modifiers: ['opt'], key: 'm' }}
      />
      <Action
        title="New Chat"
        icon={Icon.NewDocument}
        onAction={startNewChat}
        shortcut={{ modifiers: ['cmd'], key: 'n' }}
      />
      <Action
        title="Delete Chat"
        icon={Icon.Trash}
        style={Action.Style.Destructive}
        onAction={() => deleteSession(activeSession.id)}
        shortcut={{ modifiers: ['cmd', 'shift'], key: 'delete' }}
      />
      <CopyAction
        title="Copy Full Conversation"
        getText={() =>
          activeChatHistory
            .map(
              (msg) =>
                `${msg.role === 'user' ? 'User' : 'Gemini'}:\n${getTextFromParts(msg.parts)}`,
            )
            .join('\n\n')
        }
        shortcut={{ modifiers: ['cmd', 'shift'], key: 'c' }}
      />
      {isLoading && (
        <Action
          title="Cancel Request"
          icon={Icon.Stop}
          onAction={stopRequest}
          shortcut={{ modifiers: ['cmd', 'shift'], key: 'escape' }}
        />
      )}
    </>
  )

  const modelSubmenu = <ModelSubmenu value={selectedModelId} onChange={setSelectedModelId} />

  return (
    <List
      isShowingDetail
      isLoading={isLoading}
      searchText={currentQuery}
      onSearchTextChange={setQuery}
      selectedItemId={selectedItemId ?? undefined}
      navigationTitle={activeSession.title}
      actions={
        <ActionPanel>
          {sendMessageAction}
          {commonActions}
          {modelSubmenu}
        </ActionPanel>
      }
      searchBarPlaceholder="Enter your next prompt..."
      searchBarAccessory={
        <SessionDropdown
          type="list"
          selectedId={activeSession.id}
          sessions={sessions}
          onChange={switchSession}
        />
      }
    >
      {activeChatHistory.map((item) => {
        const fullMarkdown = getTextAndImagesFromParts(item.parts)
        const title = fullMarkdown.split('\n').at(0)?.slice(0, 23) ?? ''
        return (
          <List.Item
            key={item.id}
            id={item.id}
            title={title}
            icon={item.role === 'user' ? Icon.Person : Icon.ComputerChip}
            accessories={[{ text: formatTimestamp(item.date) }]}
            detail={<List.Item.Detail markdown={fullMarkdown} />}
            actions={
              <ActionPanel>
                {sendMessageAction}
                <CopyAction
                  title="Copy Message Text"
                  icon={Icon.CopyClipboard}
                  getText={() => getTextFromParts(item.parts)}
                  shortcut={{ modifiers: ['cmd'], key: 'c' }}
                />
                {item.role === 'user' && (
                  <Action.Push
                    title="Edit and Regenerate"
                    icon={Icon.Pencil}
                    target={<PromptForm editMode editMessageId={item.id} />}
                    shortcut={{ modifiers: ['cmd'], key: 'e' }}
                  />
                )}
                <Action
                  title={item.role === 'user' ? 'Regenerate response' : 'Regenerate'}
                  icon={Icon.Repeat}
                  onAction={() => regenerateFromMessage(item.id)}
                  shortcut={{ modifiers: ['cmd'], key: 'r' }}
                />
                {commonActions}
                {modelSubmenu}
              </ActionPanel>
            }
          />
        )
      })}
    </List>
  )
}
