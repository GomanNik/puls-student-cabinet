"use client";
import { Button } from "@/shared/ui/button";
export default function ErrorPage() {
  return <main className="state-panel"><h1>Сервис временно недоступен</h1><p>Сейчас не удаётся получить данные. Попробуйте ещё раз.</p><Button onClick={() => window.location.reload()}>Повторить</Button></main>;
}
