'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, Bot, User as UserIcon, Crown, Loader2 } from 'lucide-react';
import { buildChatbotGreeting, chatbotContext } from '@/lib/mockData';
import { useAuth } from '@/lib/authStore';
import { useT } from '@/lib/useT';

type Msg = { role: 'bot' | 'user'; text: string };

export default function ChatbotPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy]   = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const t = useT();

  useEffect(() => {
    setMessages([{ role: 'bot', text: buildChatbotGreeting() }]);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed || busy) return;

    setMessages(m => [...m, { role: 'user', text: trimmed }]);
    setInput('');
    setBusy(true);

    // Attach camera report context only on the FIRST real user message
    const r = chatbotContext.lastReport;
    let payload = trimmed;
    if (r && messages.length <= 1) {
      payload = `[Recent citizen report: odor=${r.odor ?? '—'}, color=${r.color ?? '—'}, flow=${r.flow ?? '—'}]\n\n${trimmed}`;
    }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: payload, user_id: user?.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setIsPremium(data.is_premium);
      setMessages(m => [...m, { role: 'bot', text: data.reply }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setMessages(m => [...m, { role: 'bot', text: `⚠️ ${msg}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)] md:h-[calc(100vh-6rem)] max-w-2xl mx-auto">
      {/* Header */}
      <div className="bg-dusk text-white px-5 py-4 md:rounded-t-3xl flex items-center gap-3 shadow-soft">
        <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center">
          <Bot className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold">AquaTrace AI</p>
          <p className="text-xs opacity-75">Context-aware water-quality assistant</p>
        </div>
        {isPremium && (
          <span className="bg-white/20 px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1">
            <Crown className="w-3 h-3" /> Premium
          </span>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef}
           className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#111827] px-4 py-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'bot' && (
              <div className="w-7 h-7 rounded-full bg-dusk/15 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-dusk" />
              </div>
            )}
            <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-dusk text-white rounded-br-sm'
                : 'bg-white dark:bg-[#1f2937] text-gray-800 dark:text-gray-200 rounded-bl-sm shadow-soft'
            }`}>
              {m.text}
            </div>
            {m.role === 'user' && (
              <div className="w-7 h-7 rounded-full bg-grass/40 flex items-center justify-center flex-shrink-0">
                <UserIcon className="w-4 h-4 text-dusk-dark" />
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="flex gap-2 justify-start">
            <div className="w-7 h-7 rounded-full bg-dusk/15 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-dusk" />
            </div>
            <div className="bg-white dark:bg-[#1f2937] rounded-2xl rounded-bl-sm px-4 py-3 shadow-soft inline-flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-dusk" />
              <span className="text-xs text-gray-400">Thinking…</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="bg-white dark:bg-[#1f2937] p-3 md:rounded-b-3xl
                      border-t border-grass/30 dark:border-[#374151] flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          disabled={busy}
          placeholder={t('chat.placeholder')}
          className="flex-1 bg-gray-50 dark:bg-[#374151] text-gray-900 dark:text-gray-100
                     placeholder:text-gray-400 dark:placeholder:text-gray-500
                     rounded-2xl px-4 py-3 text-sm outline-none
                     border border-grass/30 dark:border-[#4b5563]
                     focus:border-dusk dark:focus:border-dusk-light transition disabled:opacity-60"
        />
        <button onClick={send} disabled={busy || !input.trim()} aria-label="Send"
          className="w-12 h-12 rounded-2xl bg-dusk hover:bg-dusk-dark text-white
                     flex items-center justify-center shadow-soft active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed">
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
