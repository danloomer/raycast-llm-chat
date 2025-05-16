import { showToast, Toast } from '@raycast/api'
import { ChatMessage } from '../../types'

/**
 * Shows a toast notification for missing API key
 */
export async function showMissingApiKeyToast(providerName: string): Promise<void> {
  await showToast({
    style: Toast.Style.Failure,
    title: 'Error',
    message: `${providerName} API key is not set.`,
  })
}

/**
 * Shows a toast notification for completed response
 */
export async function showResponseCompleteToast(): Promise<void> {
  await showToast({
    style: Toast.Style.Success,
    title: 'Response Complete',
  })
}

/**
 * Prepares the last message for streaming by removing placeholder text
 */
export function prepareLastMessageForStreaming(
  lastMessage: ChatMessage | undefined,
): ChatMessage | undefined {
  if (lastMessage?.parts.at(0)?.text === '...') {
    lastMessage.parts.shift()
  }
  return lastMessage
}

/**
 * Extracts text from the last message in history
 */
export function getLastMessageText(curHistory: ChatMessage[]): string | undefined {
  return curHistory
    .at(-1)
    ?.parts.map((p) => p.text ?? '')
    .join('')
}
