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
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai'

interface Preferences {
  geminiApiKey: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'model'
  parts: [{ text: string }]
}

interface CommandArgs {
  arguments?: {
    query?: string
  }
}

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
]

export default function Command(props: LaunchProps<CommandArgs>) {
  const { geminiApiKey } = getPreferenceValues<Preferences>()
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
      queryGemini(queryPrefill)
    }
  }, [])

  async function queryGemini(input: string) {
    if (!geminiApiKey) {
      await showToast({
        style: Toast.Style.Failure,
        title: 'API Key Missing',
        message: 'Please add your Gemini API key in extension preferences',
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
      parts: [{ text: input }],
    }
    const modelPlaceholder: ChatMessage = {
      id: randId('model'),
      role: 'model',
      parts: [{ text: '...' }],
    }
    setChatHistory((prevHistory) => [...prevHistory, userMessage, modelPlaceholder])
    setSelectedItemId(modelPlaceholder.id)

    try {
      stopRequest()
      abortControllerRef.current = new AbortController()

      const genAI = new GoogleGenerativeAI(geminiApiKey)
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        safetySettings,
      })

      // exclude input and model placeholder, also normalize input shape
      const cleanHistory = chatHistory.map((message) => ({
        role: message.role,
        parts: message.parts.map((part) => ({ text: part.text })),
      }))

      const chat = model.startChat({ history: cleanHistory })

      const result = await chat.sendMessageStream(input, {
        signal: abortControllerRef.current.signal,
      })

      let streamedResponse = ''
      for await (const chunk of result.stream) {
        if (abortControllerRef.current?.signal.aborted) break
        const chunkText = chunk.text()
        streamedResponse += chunkText
        setChatHistory((prevHistory) => {
          const updatedHistory = [...prevHistory]
          const lastMessage = updatedHistory.at(-1)
          if (lastMessage?.id === modelPlaceholder.id) {
            lastMessage.parts[0].text = streamedResponse
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
        console.error('Error querying Gemini:', error)
        await showToast({
          style: Toast.Style.Failure,
          title: 'Error Querying Gemini',
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
        navigationTitle="Chat with Gemini"
        searchBarPlaceholder="Enter your next prompt..."
      >
        {chatHistory.map((item) => (
          <List.Item
            key={item.id}
            id={item.id}
            title={item.parts[0].text.split('\n')[0] || (item.role === 'user' ? 'User' : 'Gemini')}
            subtitle={item.role === 'user' ? 'You' : 'Gemini'}
            icon={item.role === 'user' ? Icon.Person : Icon.ComputerChip}
            detail={<List.Item.Detail markdown={item.parts[0].text} />}
            actions={
              <ActionPanel>
                {currentQuery.trim() && (
                  <Action
                    title="Send Message"
                    icon={Icon.SpeechBubble}
                    onAction={() => queryGemini(currentQuery)}
                  />
                )}
                <Action.CopyToClipboard
                  title="Copy Message Text"
                  content={item.parts[0].text}
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
                      (msg) => `${msg.role === 'user' ? 'User' : 'Gemini'}:\n${msg.parts[0].text}`,
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
            title="Ask Gemini"
            onSubmit={(values) => queryGemini(values.prompt)}
            icon={Icon.SpeechBubble}
          />
        </ActionPanel>
      }
      navigationTitle="Ask Gemini"
    >
      <Form.TextArea
        id="prompt"
        title="Prompt"
        placeholder="Enter your question or prompt here..."
        value={currentQuery}
        onChange={setCurrentQuery}
      />
      <Form.Description text="Enter your initial prompt for Gemini. Use Enter for new lines. Press Cmd+Enter to submit." />
    </Form>
  )
}
