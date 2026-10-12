"use client";

import { WELCOME_MESSAGE } from "@/lib/welcome-message";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "state"; firstName: string | null; chips: string[]; closed: boolean }
  | { type: "error"; message: string }
  | { type: "done" };

async function createConversation(): Promise<string> {
  const response = await fetch("/api/conversations", { method: "POST" });
  const payload = (await response.json().catch(() => null)) as { id?: string } | null;
  if (!response.ok || !payload?.id) {
    throw new Error("Não foi possível iniciar a conversa.");
  }
  return payload.id;
}

const INPUT_MAX_HEIGHT_PX = 164;

function fitComposerHeight(element: HTMLTextAreaElement) {
  element.style.height = "0px";
  const contentHeight = element.scrollHeight;
  element.style.height = `${Math.min(contentHeight, INPUT_MAX_HEIGHT_PX)}px`;
  element.style.overflowY = contentHeight > INPUT_MAX_HEIGHT_PX ? "auto" : "hidden";
}

async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return;
    }
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const line = chunk.split("\n").find((item) => item.startsWith("data: "));
      if (line) {
        yield JSON.parse(line.slice(6)) as StreamEvent;
      }
    }
  }
}

export function ChatApp() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: WELCOME_MESSAGE },
  ]);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [chips, setChips] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const conversationIdRef = useRef<string | null>(null);
  const closedRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useLayoutEffect(() => {
    if (inputRef.current) {
      fitComposerHeight(inputRef.current);
    }
  }, [input]);

  useEffect(() => {
    if (!busy && !closed) {
      inputRef.current?.focus();
    }
  }, [busy, closed]);

  useEffect(() => {
    function reportAbandon() {
      const conversationId = conversationIdRef.current;
      if (conversationId && !closedRef.current) {
        navigator.sendBeacon(`/api/conversations/${encodeURIComponent(conversationId)}/abandon`);
      }
    }
    window.addEventListener("pagehide", reportAbandon);
    return () => window.removeEventListener("pagehide", reportAbandon);
  }, []);

  function applyEvent(event: StreamEvent, history: ChatMessage[], assistantSoFar: string): string {
    if (event.type === "text") {
      const assistant = assistantSoFar + event.delta;
      setMessages([...history, { role: "assistant", content: assistant }]);
      return assistant;
    }
    if (event.type === "state") {
      setFirstName(event.firstName);
      setChips(event.chips);
      closedRef.current = event.closed;
      setClosed(event.closed);
    }
    if (event.type === "error") {
      throw new Error(event.message);
    }
    return assistantSoFar;
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy || closed) {
      return;
    }

    setBusy(true);
    setError(null);
    setInput("");
    setChips([]);

    const history: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(history);

    try {
      conversationIdRef.current ??= await createConversation();
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversationIdRef.current, message: trimmed }),
      });
      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Não foi possível continuar o chat.");
      }

      let assistant = "";
      for await (const event of readEvents(response.body)) {
        assistant = applyEvent(event, history, assistant);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha inesperada.");
    } finally {
      setBusy(false);
    }
  }

  const waitingForReply = busy && messages.at(-1)?.role === "user";

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden text-ink">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_#edd9c0_0%,_transparent_50%),radial-gradient(ellipse_at_bottom_right,_#d7e4d6_0%,_transparent_46%)]"
      />
      <header className="relative mx-auto flex w-full max-w-xl items-center gap-3 px-5 pt-6 pb-4">
        <Avatar live={busy} />
        <div>
          <p className="font-[family-name:var(--font-fraunces)] text-2xl italic leading-none text-ink">
            Mureva
          </p>
          <p className="mt-1 text-sm text-muted">
            {firstName ? `Conversando com ${firstName}` : "Sua consultora de imóveis"}
          </p>
        </div>
      </header>

      <div
        ref={listRef}
        className="relative mx-auto flex w-full max-w-xl flex-1 flex-col gap-3 overflow-y-auto px-5 pb-4"
        aria-live="polite"
      >
        {messages
          .filter((message) => message.content.length > 0)
          .map((message, index) => (
            <Bubble key={`${message.role}-${index}`} message={message} />
          ))}
        {waitingForReply ? <Typing /> : null}
        {error ? (
          <p className="msg-in text-sm text-clay-deep" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <footer className="relative mx-auto w-full max-w-xl px-5 pb-6">
        {chips.length > 0 && !closed ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <button
                key={chip}
                type="button"
                disabled={busy}
                onClick={() => void send(chip)}
                className="rounded-full border border-ink/10 bg-paper px-3 py-1.5 text-sm text-ink transition hover:-translate-y-0.5 hover:border-clay hover:text-clay-deep disabled:opacity-50"
              >
                {chip}
              </button>
            ))}
          </div>
        ) : null}
        <form
          className="flex items-end gap-2 rounded-[1.75rem] border border-ink/10 bg-paper p-1.5 shadow-[0_10px_30px_-18px_rgba(28,22,18,0.45)]"
          onSubmit={(event) => {
            event.preventDefault();
            void send(input);
          }}
        >
          <label htmlFor="chat-input" className="sr-only">
            Sua resposta
          </label>
          <textarea
            id="chat-input"
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(input);
              }
            }}
            disabled={closed}
            maxLength={2000}
            autoFocus
            placeholder={closed ? "Conversa encerrada" : "Escreva aqui…"}
            className="min-h-11 flex-1 resize-none bg-transparent px-4 py-2.5 text-base leading-6 text-ink outline-none placeholder:text-muted/70"
          />
          <button
            type="submit"
            disabled={busy || closed || !input.trim()}
            className="h-11 rounded-full bg-clay px-5 text-sm text-paper transition hover:bg-clay-deep disabled:opacity-40"
          >
            Enviar
          </button>
        </form>
        <p className="mt-3 text-center text-xs text-muted">
          Usaremos seus dados, apenas para atendimento sobre a compra do imóvel.
        </p>
      </footer>
    </div>
  );
}

function Avatar({ live }: { live: boolean }) {
  return (
    <div
      className={`flex h-12 w-12 items-center justify-center rounded-full bg-clay text-paper ${live ? "avatar-live" : ""}`}
      aria-hidden
    >
      <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none">
        <path
          d="M6 18 L16 9 L26 18 V26 H6 Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M13 26 V20 H19 V26" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    </div>
  );
}

function Typing() {
  return (
    <div className="msg-in flex items-end gap-2">
      <div className="flex h-8 items-center gap-1 rounded-2xl rounded-bl-sm bg-paper px-3">
        <span className="dot h-1.5 w-1.5 rounded-full bg-clay" />
        <span className="dot h-1.5 w-1.5 rounded-full bg-clay" />
        <span className="dot h-1.5 w-1.5 rounded-full bg-clay" />
      </div>
      <span className="text-xs text-muted">Mureva está escrevendo</span>
    </div>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`msg-in flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap px-4 py-3 text-[17px] leading-relaxed ${
          isUser
            ? "rounded-2xl rounded-br-sm bg-moss text-paper"
            : "rounded-2xl rounded-bl-sm bg-paper text-ink"
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}
