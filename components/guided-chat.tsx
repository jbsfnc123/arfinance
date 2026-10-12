"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ACTION, CHAT_TEXT, findTopic, followUps, generalTopics, menuName, searchTopics, topicsFor, type Topic,
} from "@/lib/help/guided-chat";

// Chat terarah AR Helpdesk: jawaban template per menu, diproses di browser tanpa Agent AI (lib/help/guided-chat.ts).
// Percakapan disimpan di sessionStorage per akun (hilang saat tab ditutup); teks dirender sebagai teks biasa.

type Msg = { id: number; from: "bot" | "me"; lines: string[]; go?: string; divider?: boolean };
type Choice =
  | { t: "topic"; id: string; label: string }
  | { t: "done" | "confused" | "back" | "general" | "other" | "ai"; label: string };
type Saved = { msgs: Msg[]; path: string; choices: Choice[] };

const MAX_MSGS = 60;
const storeKey = (accountId: string) => `ar-helpdesk:guided:${accountId || "anon"}`;

function load(key: string): Saved | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as Saved;
    return Array.isArray(v.msgs) && Array.isArray(v.choices) && typeof v.path === "string" ? v : null;
  } catch { return null; }
}

/** `**tebal**` → <strong>; sisanya teks biasa. */
function rich(line: string): ReactNode {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <Fragment key={i}>{part}</Fragment>);
}

const topicChoice = (t: Topic): Choice => ({ t: "topic", id: t.id, label: t.q });

function menuChoices(p: string): Choice[] {
  const own = topicsFor(p).map(topicChoice);
  const base = own.length ? own : generalTopics().map(topicChoice);
  return [...base, ...(own.length ? [{ t: "general", label: ACTION.general } as Choice] : []), { t: "other", label: ACTION.other }];
}

/** Tambah pesan dengan id berurutan; simpan maks. MAX_MSGS terakhir. */
function append(prev: Msg[], list: Omit<Msg, "id">[]): Msg[] {
  let id = prev.length ? prev[prev.length - 1].id : 0;
  return [...prev, ...list.map((m) => ({ ...m, id: ++id }))].slice(-MAX_MSGS);
}

/** Lanjutkan percakapan tab ini (sessionStorage) atau mulai sesi baru dengan sapaan. */
function initial(key: string, path: string, accountName: string): { msgs: Msg[]; choices: Choice[] } {
  const menu = menuName(path);
  const saved = load(key);
  if (saved && saved.msgs.length) {
    if (saved.path === path) return { msgs: saved.msgs, choices: saved.choices };
    return { msgs: append(saved.msgs, [{ from: "bot", lines: [CHAT_TEXT.switched(menu)], divider: true }]), choices: menuChoices(path) };
  }
  return { msgs: append([], [{ from: "bot", lines: [CHAT_TEXT.greet(accountName), CHAT_TEXT.ask(menu)] }]), choices: menuChoices(path) };
}

export function GuidedChat({ path, accountName = "", accountId = "", onAskAi }: {
  path: string; accountName?: string; accountId?: string; onAskAi?: () => void;
}) {
  const key = storeKey(accountId);
  const [init] = useState(() => initial(key, path, accountName));
  const [msgs, setMsgs] = useState<Msg[]>(init.msgs);
  const [choices, setChoices] = useState<Choice[]>(init.choices);
  const [text, setText] = useState("");
  const [seenPath, setSeenPath] = useState(path);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // Pindah menu saat chat terbuka = sesi baru untuk menu itu.
  if (seenPath !== path) {
    setSeenPath(path);
    setMsgs((prev) => append(prev, [{ from: "bot", lines: [CHAT_TEXT.switched(menuName(path))], divider: true }]));
    setChoices(menuChoices(path));
  }

  const fallbackChoices = (): Choice[] => [
    ...generalTopics().slice(0, 4).map(topicChoice),
    ...(onAskAi ? [{ t: "ai", label: "Tanya Asisten AI" } as Choice] : []),
    { t: "back", label: ACTION.back },
  ];

  function add(list: Omit<Msg, "id">[]) {
    setMsgs((prev) => append(prev, list));
  }

  useEffect(() => {
    if (!msgs.length) return;
    try { sessionStorage.setItem(key, JSON.stringify({ msgs, path, choices } satisfies Saved)); } catch { /* storage diblokir */ }
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, choices, key, path]);

  function answer(topic: Topic, asked: string) {
    add([
      { from: "me", lines: [asked] },
      { from: "bot", lines: [...topic.a, CHAT_TEXT.confirm], go: topic.go && topic.go !== path ? topic.go : undefined },
    ]);
    setChoices([
      { t: "done", label: ACTION.done },
      ...followUps(topic, path).map(topicChoice),
      { t: "confused", label: ACTION.confused },
    ]);
  }

  function choose(c: Choice) {
    switch (c.t) {
      case "topic": {
        const topic = findTopic(c.id, path);
        if (topic) answer(topic, c.label);
        return;
      }
      case "done":
        add([{ from: "me", lines: [c.label] }, { from: "bot", lines: [CHAT_TEXT.thanks] }]);
        setChoices(menuChoices(path));
        return;
      case "confused":
        add([{ from: "me", lines: [c.label] }, { from: "bot", lines: [CHAT_TEXT.stillConfused] }]);
        setChoices(fallbackChoices());
        return;
      case "back":
        add([{ from: "me", lines: [c.label] }, { from: "bot", lines: [CHAT_TEXT.ask(menuName(path))] }]);
        setChoices(menuChoices(path));
        return;
      case "general":
        add([{ from: "me", lines: [c.label] }, { from: "bot", lines: [CHAT_TEXT.allTopics] }]);
        setChoices([...generalTopics().map(topicChoice), { t: "back", label: ACTION.back }]);
        return;
      case "other":
        add([{ from: "me", lines: [c.label] }, { from: "bot", lines: [CHAT_TEXT.otherPrompt] }]);
        setChoices([{ t: "back", label: ACTION.back }]);
        input.current?.focus();
        return;
      case "ai":
        onAskAi?.();
        return;
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = text.trim().slice(0, 200);
    if (!q) return;
    setText("");
    const hits = searchTopics(q, path);
    if (hits.length === 1) return answer(hits[0], q);
    if (hits.length) {
      add([{ from: "me", lines: [q] }, { from: "bot", lines: [CHAT_TEXT.found] }]);
      setChoices([...hits.map(topicChoice), { t: "back", label: ACTION.back }]);
      return;
    }
    add([{ from: "me", lines: [q] }, { from: "bot", lines: [CHAT_TEXT.notFound] }]);
    setChoices(fallbackChoices());
  }

  function reset() {
    try { sessionStorage.removeItem(key); } catch { /* abaikan */ }
    setMsgs(append([], [{ from: "bot", lines: [CHAT_TEXT.greet(accountName), CHAT_TEXT.ask(menuName(path))] }]));
    setChoices(menuChoices(path));
  }

  return <div className="flex min-h-0 flex-1 flex-col bg-bg">
    <div ref={scroller} role="log" aria-live="polite" aria-label="Riwayat percakapan" className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
      {msgs.map((m) => m.divider
        ? <div key={m.id} className="pt-2">
            <div className="mb-2 flex items-center gap-2 text-[11px] text-fg-2"><span className="h-px flex-1 bg-line" />sesi baru<span className="h-px flex-1 bg-line" /></div>
            <Bubble from="bot" lines={m.lines} />
          </div>
        : <Bubble key={m.id} from={m.from} lines={m.lines} go={m.go} />)}
    </div>
    {choices.length > 0 && <div aria-label="Pilihan pertanyaan" role="group" className="flex max-h-[40%] shrink-0 flex-wrap gap-1.5 overflow-y-auto border-t border-line px-3 py-2">
      {choices.map((c, i) => <button key={`${c.t}-${i}`} type="button" onClick={() => choose(c)}
        className={`rounded-full border px-3 py-1.5 text-left text-xs transition focus-visible:outline-2 focus-visible:outline-accent ${c.t === "topic"
          ? "border-accent/40 bg-accent/5 text-fg hover:bg-accent/10" : "border-line bg-surface text-fg-2 hover:bg-fg/5"}`}>
        {c.label}
      </button>)}
    </div>}
    <form onSubmit={submit} className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-2">
      <input ref={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={200}
        placeholder="Ketik kendala singkat…" aria-label="Ketik kendala"
        className="min-w-0 flex-1 rounded-full border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent" />
      <button type="submit" aria-label="Kirim" disabled={!text.trim()} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#25d366] text-white disabled:opacity-40">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </button>
      <button type="button" onClick={reset} aria-label="Mulai ulang percakapan" title="Mulai ulang" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-fg-2 hover:bg-fg/5">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" /></svg>
      </button>
    </form>
  </div>;
}

function Bubble({ from, lines, go }: { from: "bot" | "me"; lines: string[]; go?: string }) {
  const me = from === "me";
  const list = !me && lines.length > 2; // jawaban berisi langkah → daftar poin
  return <div className={`flex ${me ? "justify-end" : "justify-start"}`}>
    <div className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-snug shadow-sm ${me ? "rounded-br-sm bg-[#d9fdd3] text-[#111b21]" : "rounded-bl-sm border border-line bg-surface text-fg"}`}>
      {list
        ? <>
            <ul className="list-disc space-y-1 pl-4">{lines.slice(0, -1).map((l, i) => <li key={i}>{rich(l)}</li>)}</ul>
            <p className="mt-1.5">{rich(lines[lines.length - 1])}</p>
          </>
        : lines.map((l, i) => <p key={i} className={i ? "mt-1" : undefined}>{rich(l)}</p>)}
      {go && <Link href={go} className="mt-2 inline-block text-xs font-medium text-accent underline underline-offset-2">Buka menu {menuName(go)} →</Link>}
    </div>
  </div>;
}
