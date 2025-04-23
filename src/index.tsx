import {
  Form,
  List,
  ActionPanel,
  Action,
  Icon,
  showToast,
  Toast,
  getPreferenceValues,
  LaunchProps,
} from '@raycast/api'
import { useState, useEffect, useRef } from 'react'
import OpenAI from 'openai'

interface Preferences {
  shopifyApiKey: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface CommandArgs {
  arguments?: {
    query?: string
  }
}

export default function Command(props: LaunchProps<CommandArgs>) {
  const { shopifyApiKey } = getPreferenceValues<Preferences>()
  const [isLoading, setIsLoading] = useState(false)
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const [currentQuery, setCurrentQuery] = useState<string>('')
  const abortControllerRef = useRef<AbortController | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)

  const queryPrefill = props.arguments?.query
  useEffect(() => {
    // if we have query on mount fire right away
    if (queryPrefill) {
      resetChat()
      const id = setTimeout(() => queryShopifyAI(queryPrefill), 100)
      return () => clearTimeout(id)
    }
  }, [])

  async function queryShopifyAI(input: string) {
    if (!shopifyApiKey) {
      await showToast({
        style: Toast.Style.Failure,
        title: 'API Key Missing',
        message: 'Please add your Shopify AI API key in extension preferences',
      })
      return
    }

    if (!input.trim()) {
      await showToast({
        style: Toast.Style.Failure,
        title: 'Empty Query',
        message: 'Please enter a prompt',
      })
      return
    }

    setIsLoading(true)
    setCurrentQuery('')

    const randId = (prefix: string) =>
      [prefix, Date.now(), Math.random().toString(32).slice(2)].join('-')

    const userMessage: ChatMessage = {
      id: randId('user'),
      role: 'user',
      content: input,
    }
    const modelPlaceholder: ChatMessage = {
      id: randId('assistant'),
      role: 'assistant',
      content: '...',
    }
    setChatHistory((prevHistory) => [...prevHistory, userMessage, modelPlaceholder])
    setSelectedItemId(modelPlaceholder.id)

    try {
      stopRequest()
      abortControllerRef.current = new AbortController()

      const openai = new OpenAI({
        apiKey: shopifyApiKey,
        baseURL: 'https://proxy.shopify.ai/v1/',
      })

      // exclude the current input and model placeholder messages
      const cleanHistory = chatHistory.map(message => ({
        role: message.role,
        content: message.content,
      }))

      const stream = await openai.chat.completions.create({
        model: 'google:gemini-2.0-flash',
        messages: [
          ...cleanHistory,
          { role: 'user', content: input }
        ],
        stream: true
      }, {
        signal: abortControllerRef.current.signal
      })

      let streamedResponse = ''
      for await (const chunk of stream) {
        if (abortControllerRef.current?.signal.aborted) break
        const chunkText = chunk.choices[0]?.delta?.content || ''
        streamedResponse += chunkText
        setChatHistory((prevHistory) => {
          const updatedHistory = [...prevHistory]
          const lastMessage = updatedHistory.at(-1)
          if (lastMessage?.id === modelPlaceholder.id) {
            lastMessage.content = streamedResponse
          } else {
            abortControllerRef.current?.abort('model message is no longer the last')
          }
          return updatedHistory
        })
      }
      if (!abortControllerRef.current?.signal.aborted) {
        await showToast({
          style: Toast.Style.Success,
          title: 'Response Complete',
        })
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        await showToast({
          style: Toast.Style.Failure,
          title: 'Request Cancelled',
        })
      } else {
        console.error('Error querying OpenAI:', error)
        await showToast({
          style: Toast.Style.Failure,
          title: 'Error Querying OpenAI',
          message: error.message,
        })
      }
    } finally {
      setIsLoading(false)
      abortControllerRef.current = null
    }
  }

  const stopRequest = () => abortControllerRef.current?.abort()

  // Cancel any ongoing request when component unmounts
  useEffect(() => () => stopRequest(), [])

  const resetChat = () => {
    stopRequest()
    setChatHistory([])
    setCurrentQuery('')
    setSelectedItemId(null)
    setIsLoading(false)
  }

  if (selectedItemId && chatHistory.length > 0) {
    return (
      <List
        isShowingDetail
        isLoading={isLoading}
        searchText={currentQuery}
        onSearchTextChange={setCurrentQuery}
        selectedItemId={selectedItemId}
        navigationTitle="Chat with Shopify AI"
        searchBarPlaceholder="Enter your next prompt..."
      >
        {chatHistory.map((item) => (
          <List.Item
            key={item.id}
            id={item.id}
            title={item.content.split('\n')[0] || (item.role === 'user' ? 'User' : 'Shopify AI')}
            subtitle={item.role === 'user' ? 'You' : 'Shopify AI'}
            icon={item.role === 'user' ? Icon.Person : Icon.ComputerChip}
            detail={<List.Item.Detail markdown={item.content} />}
            actions={
              <ActionPanel>
                {currentQuery.trim() && (
                  <Action
                    title="Send Message"
                    icon={Icon.SpeechBubble}
                    onAction={() => queryShopifyAI(currentQuery)}
                  />
                )}
                <Action.CopyToClipboard
                  title="Copy Message Text"
                  content={item.content}
                  shortcut={{ modifiers: ['cmd'], key: 'c' }}
                />
                <Action
                  title="New Chat"
                  icon={Icon.NewDocument}
                  onAction={resetChat}
                  shortcut={{ modifiers: ['cmd'], key: 'n' }}
                />
                <Action.CopyToClipboard
                  title="Copy Full Conversation"
                  content={chatHistory
                    .map(
                      (msg) => `${msg.role === 'user' ? 'User' : 'Shopify AI'}:\n${msg.content}`,
                    )
                    .join('\n\n')}
                  shortcut={{ modifiers: ['cmd', 'shift'], key: 'c' }}
                />
                {isLoading && item.id === chatHistory[chatHistory.length - 1].id && (
                  <Action
                    title="Cancel Request"
                    icon={Icon.Stop}
                    onAction={stopRequest}
                    shortcut={{ modifiers: ['cmd', 'shift'], key: 'escape' }}
                  />
                )}
              </ActionPanel>
            }
          />
        ))}
      </List>
    )
  }

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Ask Shopify AI"
            onSubmit={(values) => queryShopifyAI(values.prompt)}
            icon={Icon.SpeechBubble}
          />
        </ActionPanel>
      }
      navigationTitle="Ask Shopify AI"
    >
      <Form.TextArea
        id="prompt"
        title="Prompt"
        placeholder="Enter your question or prompt here..."
        value={currentQuery}
        onChange={setCurrentQuery}
      />
      <Form.Description text="Enter your initial prompt for Shopify AI. Use Enter for new lines. Press Cmd+Enter to submit." />
    </Form>
  )
}
