import { LocalStorage } from "@raycast/api";
import { ChatSession } from "../types";
import { throttle } from "./util";
import { DEFAULT_MODEL_ID } from "./llm";

const STATE_KEY = "chatState";

export interface PersistentState {
  sessions: ChatSession[];
  selectedModelId: string | null;
}

const persistState = async (state: PersistentState) => {
  try {
    await LocalStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Failed to save state:", error);
  }
};

const throttledPersistState = throttle(persistState, 500);

export function saveState(state: PersistentState): ChatSession[] {
  throttledPersistState(state);
  return state.sessions;
}

export async function loadState(): Promise<PersistentState> {
  const defaultState: PersistentState = {
    sessions: [],
    selectedModelId: DEFAULT_MODEL_ID,
  };

  try {
    const stateJson = await LocalStorage.getItem<string>(STATE_KEY);
    if (stateJson) {
      const loadedState = JSON.parse(stateJson) as Partial<PersistentState>;
      return {
        sessions: loadedState.sessions ?? [],
        selectedModelId: loadedState.selectedModelId ?? null,
      };
    }

    return defaultState;
  } catch (error) {
    console.error("Failed to load state:", error);
    await LocalStorage.removeItem(STATE_KEY);
    return defaultState;
  }
}
