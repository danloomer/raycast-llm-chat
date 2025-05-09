export interface ChatMessage {
  id: string;
  date: number;
  role: "user" | "assistant" | "system";
  parts: ChatPart[];
}

export type ChatPart = ChatCompletionMessageParam;

export interface ChatSession {
  id: string;
  title: string;
  history: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}
