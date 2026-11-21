"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { api, safeClientMessage } from "@/shared/api/client";
import {
  AssistantAnswerSchema,
  AssistantResponseSchema,
  type AssistantAnswer,
} from "@/shared/contracts/student-api";

const STORAGE_PREFIX = "puls-assistant-chat-v1:";
const ACTIVE_SCOPE_KEY = "puls-assistant-chat-scope";
const MAX_MESSAGES = 40;
const MAX_STORAGE_LENGTH = 140_000;
const MAX_DRAFT_LENGTH = 2_000;
type UserMessage = {
  id: string;
  role: "user";
  text: string;
  createdAt: number;
};

type AssistantMessage = {
  id: string;
  role: "assistant";
  status: "pending" | "ready" | "error" | "interrupted";
  question: string;
  createdAt: number;
  answer?: AssistantAnswer;
  error?: string;
};

export type AssistantChatMessage = UserMessage | AssistantMessage;

type AssistantChatContextValue = {
  messages: AssistantChatMessage[];
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  ready: boolean;
  sending: boolean;
  activeCount: number;
  sendQuestion: (question: string) => boolean;
  retry: (assistantMessageId: string) => boolean;
  clearChat: () => void;
};

type StoredChat = {
  version: 1;
  messages: AssistantChatMessage[];
  draft: string;
  savedAt: number;
  validUntil: number;
};

const ChatContext = createContext<AssistantChatContextValue | null>(null);

function storageKey(scope: string) {
  return `${STORAGE_PREFIX}${scope}`;
}

export function clearAssistantChatStorage(scope: string | null | undefined) {
  if (!scope || typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(storageKey(scope));
    if (window.sessionStorage.getItem(ACTIVE_SCOPE_KEY) === scope) window.sessionStorage.removeItem(ACTIVE_SCOPE_KEY);
  } catch {
    // Недоступность браузерного хранилища не должна мешать выходу из аккаунта.
  }
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function trimMessages(messages: AssistantChatMessage[]) {
  const kept = [...messages];
  while (kept.length > MAX_MESSAGES) {
    const index = kept.findIndex((message, position) => {
      const next = kept[position + 1];
      return message.role === "user" && next?.role === "assistant" && next.status !== "pending";
    });
    if (index < 0) break;
    kept.splice(index, 2);
  }
  return kept;
}

function completedHistory(messages: AssistantChatMessage[], currentId: string) {
  const cutoff = messages.findIndex(message => message.id === currentId);
  const previous = cutoff < 0 ? messages : messages.slice(0, cutoff - 1);
  const turns: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (let index = 0; index + 1 < previous.length; index += 2) {
    const user = previous[index], assistant = previous[index + 1];
    if (user.role !== "user" || assistant.role !== "assistant" || assistant.status !== "ready" || !assistant.answer) continue;
    turns.push({ role: "user", content: user.text.slice(0, 700) }, { role: "assistant", content: assistant.answer.text.slice(0, 700) });
  }
  return turns.slice(-8);
}

function restoreMessage(value: unknown): AssistantChatMessage | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.createdAt !== "number" || !Number.isFinite(item.createdAt)) return null;

  if (item.role === "user" && typeof item.text === "string") {
    return {
      id: item.id,
      role: "user",
      text: item.text.slice(0, MAX_DRAFT_LENGTH),
      createdAt: item.createdAt,
    };
  }

  if (item.role !== "assistant" || typeof item.question !== "string") return null;
  const status = item.status;
  if (status !== "pending" && status !== "ready" && status !== "error" && status !== "interrupted") return null;
  const answer = AssistantAnswerSchema.safeParse(item.answer);
  const restoredStatus = status === "pending" || (status === "ready" && !answer.success) ? "interrupted" : status;
  return {
    id: item.id,
    role: "assistant",
    status: restoredStatus,
    question: item.question.slice(0, MAX_DRAFT_LENGTH),
    createdAt: item.createdAt,
    ...(answer.success && restoredStatus === "ready" ? { answer: answer.data } : {}),
    ...(typeof item.error === "string" && restoredStatus === "error" ? { error: item.error.slice(0, 500) } : {}),
    ...(restoredStatus === "interrupted" ? { error: "Ответ не был завершён. Вы можете повторить вопрос." } : {}),
  };
}

function readStoredChat(scope: string, absoluteExpiry: number): StoredChat {
  try {
    const raw = window.sessionStorage.getItem(storageKey(scope));
    const empty = { version: 1 as const, messages: [], draft: "", savedAt: Date.now(), validUntil: absoluteExpiry };
    if (!raw) return empty;
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (value.version !== 1 || !Array.isArray(value.messages)) {
      clearAssistantChatStorage(scope);
      return empty;
    }
    const now = Date.now();
    if (typeof value.savedAt !== "number" || typeof value.validUntil !== "number" ||
        value.savedAt > now + 60_000 || value.savedAt < now - 24 * 60 * 60_000 ||
        value.validUntil <= now || absoluteExpiry <= now) {
      clearAssistantChatStorage(scope); return empty;
    }
    const restored = value.messages
      .map(restoreMessage)
      .filter((message): message is AssistantChatMessage => message !== null);
    const messages: AssistantChatMessage[] = [];
    const ids = new Set<string>();
    for (let index = 0; index + 1 < restored.length; index += 2) {
      const user = restored[index], assistant = restored[index + 1];
      if (user.role !== "user" || assistant.role !== "assistant" || assistant.question !== user.text || ids.has(user.id) || ids.has(assistant.id)) continue;
      ids.add(user.id); ids.add(assistant.id);
      messages.push(user, assistant);
    }
    const draft = typeof value.draft === "string" ? value.draft.slice(0, MAX_DRAFT_LENGTH) : "";
    return { version: 1, messages: trimMessages(messages), draft, savedAt: now, validUntil: Math.min(absoluteExpiry, value.validUntil) };
  } catch {
    clearAssistantChatStorage(scope);
    return { version: 1, messages: [], draft: "", savedAt: Date.now(), validUntil: absoluteExpiry };
  }
}

function writeStoredChat(scope: string, messages: AssistantChatMessage[], draft: string, absoluteExpiry: number) {
  if (absoluteExpiry <= Date.now()) { clearAssistantChatStorage(scope); return; }
  const stored: StoredChat = {
    version: 1,
    messages: trimMessages(messages),
    draft: draft.slice(0, MAX_DRAFT_LENGTH),
    savedAt: Date.now(),
    validUntil: Math.min(absoluteExpiry, Date.now() + 24 * 60 * 60_000),
  };
  try {
    let serialized = JSON.stringify(stored);
    while (serialized.length > MAX_STORAGE_LENGTH && stored.messages.length > 0) {
      stored.messages = stored.messages.slice(2);
      serialized = JSON.stringify(stored);
    }
    window.sessionStorage.setItem(storageKey(scope), serialized);
  } catch {
    // Если браузер запретил хранение, чат продолжает работать в памяти вкладки.
  }
}

export function AssistantChatProvider({ scope, absoluteExpiresAt, children }: { scope: string | null; absoluteExpiresAt: string | null; children: ReactNode }) {
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const [activeCount, setActiveCount] = useState(0);
  const scopeRef = useRef<string | null>(scope);
  const loadedScopeRef = useRef<string | null>(null);
  const previousScopeRef = useRef<string | null>(null);
  const messagesRef = useRef<AssistantChatMessage[]>([]);
  const draftRef = useRef(draft);
  const requestsRef = useRef(new Map<string, AbortController>());
  const epochRef = useRef(0);

  scopeRef.current = scope;
  loadedScopeRef.current = loadedScope;
  messagesRef.current = messages;
  draftRef.current = draft;

  useEffect(() => {
    const previousScope = previousScopeRef.current;
    if (previousScope && scope && previousScope !== scope) clearAssistantChatStorage(previousScope);
    previousScopeRef.current = scope;

    epochRef.current++;
    for (const request of requestsRef.current.values()) request.abort();
    requestsRef.current.clear(); setActiveCount(0);
    setMessages([]);
    setDraft("");
    setLoadedScope(null);
    loadedScopeRef.current = null;

    if (!scope) return;
    try {
      const previousStoredScope = window.sessionStorage.getItem(ACTIVE_SCOPE_KEY);
      if (previousStoredScope && previousStoredScope !== scope) clearAssistantChatStorage(previousStoredScope);
    } catch { /* Чат остаётся доступен в памяти вкладки. */ }
    const expiry = Date.parse(absoluteExpiresAt ?? "");
    const restored = readStoredChat(scope, Number.isFinite(expiry) ? expiry : Date.now() + 8 * 60 * 60_000);
    try { window.sessionStorage.setItem(ACTIVE_SCOPE_KEY, scope); } catch { /* Чат остаётся доступен в памяти вкладки. */ }
    setMessages(restored.messages);
    setDraft(restored.draft);
    messagesRef.current = restored.messages;
    setLoadedScope(scope);
    loadedScopeRef.current = scope;
  }, [scope, absoluteExpiresAt]);

  useEffect(() => {
    if (!scope || loadedScope !== scope) return;
    const expiry = Date.parse(absoluteExpiresAt ?? "");
    writeStoredChat(scope, messages, draft, Number.isFinite(expiry) ? expiry : Date.now() + 8 * 60 * 60_000);
  }, [scope, loadedScope, messages, draft, absoluteExpiresAt]);

  useEffect(() => () => { epochRef.current++; for (const request of requestsRef.current.values()) request.abort(); requestsRef.current.clear(); }, []);

  const performRequest = useCallback(async (
    question: string,
    assistantMessageId: string,
    requestScope: string,
  ): Promise<void> => {
    const controller = new AbortController();
    const epoch = epochRef.current;
    requestsRef.current.set(assistantMessageId, controller);
    setActiveCount(requestsRef.current.size);
    try {
      const result: AssistantAnswer = (await api("/assistant/ask", AssistantResponseSchema, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, contextHint: "GENERAL", history: completedHistory(messagesRef.current, assistantMessageId) }),
        signal: controller.signal,
      })).data;
      if (controller.signal.aborted || scopeRef.current !== requestScope || epochRef.current !== epoch) return;
      setMessages(current => current.map(message => message.id === assistantMessageId && message.role === "assistant"
        ? { ...message, status: "ready" as const, answer: result, error: undefined }
        : message));
    } catch (failure) {
      if (controller.signal.aborted || scopeRef.current !== requestScope || epochRef.current !== epoch) return;
      setMessages(current => current.map(message => message.id === assistantMessageId && message.role === "assistant"
        ? { ...message, status: "error" as const, error: safeClientMessage(failure), answer: undefined }
        : message));
    } finally {
      if (requestsRef.current.get(assistantMessageId) === controller) {
        requestsRef.current.delete(assistantMessageId);
        if (scopeRef.current === requestScope && epochRef.current === epoch) setActiveCount(requestsRef.current.size);
      }
    }
  }, []);

  const sendQuestion = useCallback((rawQuestion: string): boolean => {
    const question = rawQuestion.trim();
    const requestScope = scopeRef.current;
    if (!question || question.length > MAX_DRAFT_LENGTH || !requestScope || loadedScopeRef.current !== requestScope || requestsRef.current.size >= 2) return false;

    if (draftRef.current.trim() === question) { draftRef.current = ""; setDraft(""); }
    const userMessageId = createId();
    const assistantMessageId = createId();
    const now = Date.now();
    const userMessage: UserMessage = { id: userMessageId, role: "user", text: question, createdAt: now };
    const assistantMessage: AssistantMessage = { id: assistantMessageId, role: "assistant", status: "pending", question, createdAt: now + 1 };
    setMessages(current => trimMessages([
      ...current,
      userMessage,
      assistantMessage,
    ]));
    void performRequest(question, assistantMessageId, requestScope);
    return true;
  }, [performRequest]);

  const retry = useCallback((assistantMessageId: string): boolean => {
    const requestScope = scopeRef.current;
    if (!requestScope || loadedScopeRef.current !== requestScope || requestsRef.current.size >= 2 || requestsRef.current.has(assistantMessageId)) return false;
    const current = messagesRef.current;
    const index = current.findIndex(message => message.id === assistantMessageId && message.role === "assistant");
    if (index < 1) return false;
    const assistantMessage = current[index];
    const previous = current[index - 1];
    if (assistantMessage.role !== "assistant" || (assistantMessage.status !== "error" && assistantMessage.status !== "interrupted")) return false;
    if (previous.role !== "user" || previous.text !== assistantMessage.question) return false;

    setMessages(items => items.map(message => message.id === assistantMessageId && message.role === "assistant"
      ? { ...message, status: "pending" as const, error: undefined, answer: undefined }
      : message));
    void performRequest(assistantMessage.question, assistantMessageId, requestScope);
    return true;
  }, [performRequest]);

  const clearChat = useCallback(() => {
    const currentScope = scopeRef.current;
    epochRef.current++;
    for (const request of requestsRef.current.values()) request.abort();
    requestsRef.current.clear(); setActiveCount(0);
    if (currentScope) clearAssistantChatStorage(currentScope);
    setMessages([]);
    setDraft("");
  }, []);

  const value = useMemo<AssistantChatContextValue>(() => ({
    messages,
    draft,
    setDraft,
    ready: Boolean(scope && loadedScope === scope),
    sending: activeCount > 0,
    activeCount,
    sendQuestion,
    retry,
    clearChat,
  }), [messages, draft, scope, loadedScope, activeCount, sendQuestion, retry, clearChat]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useAssistantChat() {
  const context = useContext(ChatContext);
  if (!context) throw new Error("Чат ПУЛЬС должен находиться внутри AssistantChatProvider.");
  return context;
}
