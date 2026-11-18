"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useAssistantChat } from "./chat-context";

export function HeaderAssistantSearch() {
  const router = useRouter(), pathname = usePathname();
  const { ready, activeCount, sendQuestion } = useAssistantChat();
  const [text, setText] = useState(""), [notice, setNotice] = useState("");
  const field = useRef<HTMLInputElement>(null), submitted = useRef<string | null>(null);

  function open() {
    if (pathname !== "/assistant") router.push("/assistant");
    else document.getElementById("assistant-chat-draft")?.focus();
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready) return;
    const question = text.trim();
    if (!question) { open(); return; }
    if (submitted.current === question) return;
    if (activeCount >= 2 || !sendQuestion(question)) {
      setNotice("Дождитесь ответа на один из текущих вопросов.");
      return;
    }
    submitted.current = question;
    setText(""); setNotice("");
    if (pathname !== "/assistant") router.push("/assistant");
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (text) { setText(""); submitted.current = null; }
      else field.current?.blur();
      setNotice("");
    }
    if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
  }

  return (
    <form className="header-assistant-search" role="search" onSubmit={submit}>
      <button className="header-assistant-open" type="submit" aria-label={text.trim() ? "Отправить вопрос" : "Открыть чат с помощником"}><Search size={18} aria-hidden="true" /></button>
      <input
        ref={field}
        aria-label="Задайте вопрос помощнику"
        value={text}
        onChange={event => { setText(event.target.value); submitted.current = null; setNotice(""); }}
        onKeyDown={keyDown}
        placeholder="Задайте вопрос"
        maxLength={2_000}
        autoComplete="off"
        disabled={!ready}
      />
      {notice && <span className="header-assistant-notice" role="status">{notice}</span>}
    </form>
  );
}
