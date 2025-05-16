import { Form, List, Icon } from '@raycast/api'
import { NEW_CHAT_ID } from '../lib/chat-state'
import { ChatSession } from '../types'

interface Props {
  type: 'form' | 'list'
  selectedId: string
  onChange(newSessionId: string): void
  sessions: ChatSession[]
}

export function SessionDropdown({ type, selectedId, onChange, sessions }: Props) {
  const DropdownType = type === 'form' ? Form.Dropdown : List.Dropdown
  return (
    <DropdownType
      id="session-selector"
      title="Chat selection"
      tooltip="Switch Chat"
      value={selectedId}
      onChange={onChange}
    >
      <DropdownType.Item title="New Chat" value={NEW_CHAT_ID} icon={Icon.NewDocument} />
      <DropdownType.Section title="Saved Chats">
        {sessions.map((session) => (
          <DropdownType.Item
            key={session.id}
            title={session.title}
            value={session.id}
            icon={Icon.Bubble}
          />
        ))}
      </DropdownType.Section>
    </DropdownType>
  )
}
