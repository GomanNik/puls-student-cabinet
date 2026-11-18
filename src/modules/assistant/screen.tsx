"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowDown, Copy, LoaderCircle, RefreshCw, Send, Trash2 } from "lucide-react";
import { targetHref } from "@/shared/ui/academic";
import type { AssistantAnswer } from "@/shared/contracts/student-api";
import { Button } from "@/shared/ui/button";
import { PageHero } from "@/shared/ui/page-hero";
import { useAssistantChat, type AssistantChatMessage } from "./chat-context";

const messageTime = (createdAt: number) => new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(createdAt));
const suggestedQuestions = ["Где посмотреть расписание?", "Где найти учебные материалы?", "Где посмотреть сроки выполнения работ?"];

function targetKindLabel(kind: string) {
  switch (kind) {
    case "OFFERING": return "Дисциплина";
    case "WORK": return "Учебная работа";
    case "UNIT": return "Учебная единица";
    case "SCHEDULE": return "Занятие";
    case "MATERIAL": return "Материал";
    case "ATTESTATION": return "Аттестация";
    case "REQUEST": return "Заявление";
    case "APPEAL": return "Обращение";
    case "ANNOUNCEMENT": return "Объявление";
    default: return "Источник";
  }
}

function AssistantAnswerView({ answer }: { answer: AssistantAnswer }) {
  const searchLabels = answer.notice?.startsWith("Академический поиск:")
    ? answer.text.split("\n").filter(line => /^\d+\.\s/.test(line.trim())).map(line => line.trim().replace(/^\d+\.\s*/, ""))
    : [];
  return (
    <div className="assistant-message-content">
      <p className="assistant-answer-text">{answer.text}</p>
      {answer.targets.length > 0 && (
        <nav className="assistant-source-list" aria-label="Источники ответа">
          <span>Источники</span>
          {answer.targets.map((target, index) => (
            <Link href={targetHref(target)} key={`${target.kind}:${target.targetRef}`} prefetch={false}>
              {searchLabels[index] ?? `${targetKindLabel(target.kind)} ${index + 1}`}
            </Link>
          ))}
        </nav>
      )}

      {answer.notice && <p className="assistant-answer-notice">{answer.notice}</p>}
      {answer.completeness !== "COMPLETE" && <p className="assistant-incomplete">Часть источников недоступна. Отсутствие результата не подтверждает отсутствие сведений.</p>}
    </div>
  );
}

function AssistantMessage({ message, onRetry }: { message: Extract<AssistantChatMessage, { role: "assistant" }>; onRetry: (id: string) => void }) {
  const [copyError, setCopyError] = useState(false);
  const answer = message.answer;
  async function copy() {
    if (!answer) return;
    try { await navigator.clipboard.writeText(answer.text); setCopyError(false); }
    catch { setCopyError(true); }
  }

  return (
    <article className="assistant-chat-row assistant-chat-row-bot" aria-label="Ответ помощника">
      <div className="assistant-bubble assistant-bubble-bot">
        <div className="assistant-message-meta"><strong>ПУЛЬС</strong>{answer?.providerMode === "GIGACHAT" && <span>GigaChat</span>}{answer?.providerMode === "DEMO_MOCK" && <span>Демонстрационный ответ</span>}<time dateTime={new Date(message.createdAt).toISOString()}>{messageTime(message.createdAt)}</time></div>
        {message.status === "pending" && (
          <div className="assistant-pending" role="status" aria-label="Помощник готовит ответ"><LoaderCircle size={17} className="assistant-spinner" /></div>
        )}
        {message.status === "ready" && answer && <AssistantAnswerView answer={answer} />}
        {(message.status === "error" || message.status === "interrupted") && (
          <div className="assistant-error-state" role="alert">
            <p>{message.error ?? "Не удалось получить ответ."}</p>
            <Button variant="quiet" onClick={() => onRetry(message.id)}><RefreshCw size={16} />Повторить</Button>
          </div>
        )}
        {message.status === "ready" && answer && (
          <div className="assistant-message-actions">
            <Button variant="quiet" onClick={() => void copy()}>
              <Copy size={15} />Скопировать
            </Button>
            {copyError && <span role="alert">Не удалось скопировать. Выделите текст вручную.</span>}
          </div>
        )}
      </div>
    </article>
  );
}

export function AssistantScreen() {
  const { messages, draft, setDraft, ready, activeCount, sendQuestion, retry, clearChat } = useAssistantChat();
  const logRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const nearBottom = useRef(true);
  const initialScroll = useRef(false), lastUserId = useRef<string | null>(null), submitted = useRef<string | null>(null);
  const [showLatest, setShowLatest] = useState(false), [limitNotice, setLimitNotice] = useState(false);
  const scrollBehavior = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" as const : "smooth" as const;

  useEffect(() => {
    if (ready && window.matchMedia("(min-width: 600px)").matches) composerRef.current?.focus({ preventScroll: true });
  }, [ready]);

  useEffect(() => {
    const field = composerRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 160)}px`;
  }, [draft]);

  useEffect(() => {
    if (!ready) { initialScroll.current = false; lastUserId.current = null; return; }
    const log = logRef.current;
    if (!log) return;
    const latestQuestion = [...messages].reverse().find(message => message.role === "user");
    if (!initialScroll.current) {
      log.scrollTop = log.scrollHeight;
      initialScroll.current = true;
      lastUserId.current = latestQuestion?.id ?? null;
    } else if (latestQuestion && latestQuestion.id !== lastUserId.current) {
      lastUserId.current = latestQuestion.id;
      nearBottom.current = true;
      document.getElementById(`assistant-question-${latestQuestion.id}`)?.scrollIntoView({ behavior: scrollBehavior(), block: "end" });
      setShowLatest(false);
    } else if (nearBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "end" });
      setShowLatest(false);
    } else {
      setShowLatest(true);
    }
  }, [messages, ready]);

  function handleScroll() {
    const element = logRef.current;
    if (!element) return;
    nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
    if (nearBottom.current) setShowLatest(false);
  }

  function submit() {
    const question = draft.trim();
    if (!question || !ready || submitted.current === question) return;
    if (activeCount >= 2 || !sendQuestion(question)) { setLimitNotice(true); return; }
    submitted.current = question;
    setLimitNotice(false);
    nearBottom.current = true;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  function handleClear() {
    if (!messages.length && !draft) return;
    if (window.confirm("Очистить переписку и черновик в этой вкладке?")) { clearChat(); initialScroll.current = false; setShowLatest(false); }
  }

  return (
    <main id="main" className="assistant-chat">
      <PageHero
        className="assistant-page-hero"
        image="assistant-ai.jpg"
        priority
        title="ИИ-помощник"
        description="Задайте вопрос о расписании, учёбе и материалах"
        action={(messages.length > 0 || draft.length > 0)
          ? <Button variant="quiet" className="assistant-clear-button" onClick={handleClear}><Trash2 size={16} />Очистить</Button>
          : undefined}
      />
      <div className="assistant-chat-log" ref={logRef} onScroll={handleScroll} role="log" aria-label="Переписка с помощником ПУЛЬС" aria-live="polite" aria-relevant="additions text">
        {!ready && <div className="assistant-chat-loading" role="status"><LoaderCircle className="assistant-spinner" size={20} />Восстанавливаем переписку…</div>}
        {ready && messages.length === 0 && (
          <div className="assistant-welcome">
            <p>Здравствуйте! Я помощник ПУЛЬС. Помогу разобраться с возможностями личного кабинета</p>
            <div className="assistant-suggestions" aria-label="Примеры вопросов">{suggestedQuestions.map(question => <button key={question} type="button" onClick={() => { if (!sendQuestion(question)) setLimitNotice(true); }}>{question}</button>)}</div>
          </div>
        )}
        {messages.map(message => message.role === "user" ? (
          <article id={`assistant-question-${message.id}`} className="assistant-chat-row assistant-chat-row-user" key={message.id} aria-label="Ваш вопрос">
            <div className="assistant-bubble assistant-bubble-user">
              <div className="assistant-message-meta"><strong>Вы</strong><time dateTime={new Date(message.createdAt).toISOString()}>{messageTime(message.createdAt)}</time></div>
              <p className="preserve-text">{message.text}</p>
            </div>
          </article>
        ) : <AssistantMessage key={message.id} message={message} onRetry={id => { if (!retry(id)) setLimitNotice(true); }} />)}
        <div ref={bottomRef} />
      </div>

      {showLatest && <div className="assistant-latest-wrap"><Button variant="secondary" className="assistant-latest-button" onClick={() => { nearBottom.current = true; bottomRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "end" }); setShowLatest(false); }}><ArrowDown size={16} />К новым сообщениям</Button></div>}

      <form className="assistant-composer" onSubmit={event => { event.preventDefault(); submit(); }}>
        <label className="sr-only" htmlFor="assistant-chat-draft">Ваш вопрос</label>
        <textarea
          ref={composerRef}
          id="assistant-chat-draft"
          value={draft}
          onChange={event => { setDraft(event.target.value.slice(0, 2_000)); submitted.current = null; setLimitNotice(false); }}
          onKeyDown={handleKeyDown}
          maxLength={2_000}
          rows={1}
          placeholder="Напишите сообщение"
          disabled={!ready}
        />
        <Button type="submit" disabled={!ready || activeCount >= 2 || !draft.trim()} aria-label="Отправить сообщение">
          <Send size={19} /><span>Отправить</span>
        </Button>
        {limitNotice && <p className="assistant-composer-notice" role="status">Дождитесь ответа на один из текущих вопросов.</p>}
        <div className="assistant-composer-foot"><span>Не отправляйте пароли и личные данные</span><span>{draft.length} / 2 000</span></div>
      </form>
    </main>
  );
}
