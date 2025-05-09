import {
  Form,
  List,
  ActionPanel,
  Action,
  Icon,
  LaunchProps,
} from "@raycast/api";
import { NEW_CHAT_ID, useChatState } from "./lib/chat-state";
import {
  getTextFromParts,
  stopRequest,
  AVAILABLE_MODELS,
  ModelId,
} from "./lib/llm";
import { formatTimestamp } from "./lib/util";
import { useMemo } from "react";

type Props = LaunchProps<{ arguments?: Arguments.Index }>;

export default function Command(props: Props) {
  const {
    isLoading,
    sessions,
    activeSessionId,
    activeSession,
    activeChatHistory,
    currentQuery,
    selectedItemId,
    handleQuery,
    startNewChat,
    handleDeleteSession,
    switchSession,
    setCurrentQuery,
    selectedModelId,
    setSelectedModelId,
  } = useChatState(props.arguments?.query);

  const fullChatConversation = useMemo(
    () =>
      activeChatHistory
        .map(
          (msg) =>
            `${msg.role === "user" ? "User" : "Gemini"}:\n${getTextFromParts(
              msg.parts
            )}`
        )
        .join("\n\n"),
    [activeChatHistory]
  );

  const navigationDropdown = (
    DropdownType: typeof List.Dropdown | typeof Form.Dropdown
  ) => (
    <DropdownType
      id="session-selector"
      title="Chat selection"
      tooltip="Switch Chat"
      value={activeSessionId ?? NEW_CHAT_ID}
      onChange={switchSession}
    >
      <DropdownType.Item
        title="New Chat"
        value={NEW_CHAT_ID}
        icon={Icon.NewDocument}
      />
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
  );

  const modelSelectorDropdown = (
    DropdownType: typeof List.Dropdown | typeof Form.Dropdown
  ) => (
    <DropdownType
      id="model-selector"
      title="Model"
      tooltip="Select LLM Model"
      value={selectedModelId}
      onChange={(newValue) => setSelectedModelId(newValue as ModelId)}
    >
      <DropdownType.Section title="Available Models">
        {AVAILABLE_MODELS.map((model) => (
          <DropdownType.Item key={model} title={model} value={model} />
        ))}
      </DropdownType.Section>
    </DropdownType>
  );

  const modelSelectorSubmenu = (
    <ActionPanel.Submenu
      title={`Change Model (${selectedModelId})`}
      icon={Icon.ComputerChip}
      shortcut={{ modifiers: ["cmd"], key: "m" }}
    >
      {AVAILABLE_MODELS.map((model) => (
        <Action
          key={model}
          title={model}
          icon={selectedModelId === model ? Icon.Checkmark : Icon.Circle}
          onAction={() => setSelectedModelId(model)}
        />
      ))}
    </ActionPanel.Submenu>
  );

  if (activeSession) {
    const sendMessageAction = currentQuery.trim() && (
      <Action
        title="Send Message"
        icon={Icon.SpeechBubble}
        onAction={() => handleQuery(currentQuery)}
      />
    );

    const commonActions = (
      <>
        <Action
          title="New Chat"
          icon={Icon.NewDocument}
          onAction={startNewChat}
          shortcut={{ modifiers: ["cmd"], key: "n" }}
        />
        <Action
          title="Delete Chat"
          icon={Icon.Trash}
          style={Action.Style.Destructive}
          onAction={() => handleDeleteSession(activeSession.id)}
          shortcut={{ modifiers: ["cmd", "shift"], key: "delete" }}
        />
        <Action.CopyToClipboard
          title="Copy Full Conversation"
          content={fullChatConversation}
          shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
        />
        {isLoading && (
          <Action
            title="Cancel Request"
            icon={Icon.Stop}
            onAction={stopRequest}
            shortcut={{ modifiers: ["cmd", "shift"], key: "escape" }}
          />
        )}
      </>
    );

    return (
      <List
        isShowingDetail
        isLoading={isLoading}
        searchText={currentQuery}
        onSearchTextChange={setCurrentQuery}
        selectedItemId={selectedItemId ?? undefined}
        navigationTitle={activeSession.title}
        actions={
          <ActionPanel>
            {sendMessageAction}
            {commonActions}
            {modelSelectorSubmenu}
          </ActionPanel>
        }
        searchBarPlaceholder="Enter your next prompt..."
        searchBarAccessory={navigationDropdown(List.Dropdown)}
      >
        {activeChatHistory.map((item) => {
          const fullText = getTextFromParts(item.parts);
          const title = fullText.split("\n").at(0)?.slice(0, 23) ?? "";
          return (
            <List.Item
              key={item.id}
              id={item.id}
              title={title}
              icon={item.role === "user" ? Icon.Person : Icon.ComputerChip}
              accessories={[{ text: formatTimestamp(item.date) }]}
              detail={<List.Item.Detail markdown={fullText} />}
              actions={
                <ActionPanel>
                  {sendMessageAction}
                  <Action.CopyToClipboard
                    title="Copy Message Text"
                    content={fullText}
                    shortcut={{ modifiers: ["cmd"], key: "c" }}
                  />
                  {commonActions}
                  {modelSelectorSubmenu}
                </ActionPanel>
              }
            />
          );
        })}
      </List>
    );
  }

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Start Chat"
            onSubmit={(values) => handleQuery(values.prompt)}
            icon={Icon.SpeechBubble}
          />
          {modelSelectorSubmenu}
        </ActionPanel>
      }
      navigationTitle="New Chat"
    >
      <Form.TextArea
        id="prompt"
        title="Initial Prompt"
        placeholder="Enter your question or prompt here to start a new chat..."
        value={currentQuery}
        onChange={setCurrentQuery}
      />
      {navigationDropdown(Form.Dropdown)}
      {modelSelectorDropdown(Form.Dropdown)}
    </Form>
  );
}
