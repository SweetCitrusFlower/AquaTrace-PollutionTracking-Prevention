'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Send, Bot, User as UserIcon, ImagePlus, Loader2, X } from 'lucide-react';
import { buildChatbotGreeting, chatbotContext } from '@/lib/mockData';
import { useAuth } from '@/lib/authStore';

type Msg = { role: 'bot' | 'user'; text: string };
type ApiHistoryItem = { role: 'user' | 'assistant'; content: string };

const DEFAULT_IMAGE_PROMPT = 'Analizeaza poza atasata si spune-mi ce riscuri observi pentru apa.';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = reader.result;
      if (typeof value === 'string') {
        resolve(value);
        return;
      }
      reject(new Error('Could not read image file.'));
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

function compressImage(dataUrl: string, maxSide = 960): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const ratio = Math.min(maxSide / image.width, maxSide / image.height, 1);
      const width = Math.max(1, Math.round(image.width * ratio));
      const height = Math.max(1, Math.round(image.height * ratio));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Could not process image.'));
        return;
      }

      context.drawImage(image, 0, 0, width, height);

      // Keep payload small for API route JSON body limits.
      let quality = 0.8;
      let output = canvas.toDataURL('image/jpeg', quality);
      while (output.length > 900_000 && quality > 0.45) {
        quality -= 0.1;
        output = canvas.toDataURL('image/jpeg', quality);
      }

      resolve(output);
    };
    image.onerror = () => reject(new Error('Invalid image file.'));
    image.src = dataUrl;
  });
}

export default function ChatbotPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [activeImageLabel, setActiveImageLabel] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Mount: read context from chatbotContext (populated by camera flow) and greet accordingly.
  useEffect(() => {
    setMessages([{ role: 'bot', text: buildChatbotGreeting() }]);

    const latestPhoto = chatbotContext.lastReport?.photoDataUrl;
    if (latestPhoto) {
      setActiveImage(latestPhoto);
      setActiveImageLabel('Latest citizen report photo');
    }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const canSend = useMemo(() => Boolean(input.trim() || activeImage) && !busy && !uploadingImage, [
    input,
    activeImage,
    busy,
    uploadingImage,
  ]);

  const onPickImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploadingImage(true);
      const rawDataUrl = await readFileAsDataUrl(file);
      const compressed = await compressImage(rawDataUrl);
      setActiveImage(compressed);
      setActiveImageLabel(file.name || 'Uploaded image');
    } catch (error) {
      console.error(error);
      setMessages(prev => [
        ...prev,
        {
          role: 'bot',
          text: 'I could not read that image. Please upload another photo.',
        },
      ]);
    } finally {
      setUploadingImage(false);
      event.target.value = '';
    }
  };

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed && !activeImage) return;

    const userText = trimmed || DEFAULT_IMAGE_PROMPT;
    const userBubble = trimmed || 'Image attached for analysis.';

    setMessages(m => [...m, { role: 'user', text: userBubble }]);
    setInput('');

    const history: ApiHistoryItem[] = messages
      .slice(1)
      .map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.text,
      }))
      .slice(-8);

    try {
      setBusy(true);

      const response = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          userId: user?.id,
          imageDataUrl: activeImage,
          history,
          reportContext: chatbotContext.lastReport
            ? {
                odor: chatbotContext.lastReport.odor,
                color: chatbotContext.lastReport.color,
                flow: chatbotContext.lastReport.flow,
                activity: chatbotContext.lastReport.activity,
              }
            : null,
        }),
      });

      const payload = (await response.json()) as { reply?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Chatbot request failed.');
      }

      setMessages(m => [
        ...m,
        {
          role: 'bot',
          text: payload.reply || 'I could not generate a response right now.',
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown chatbot error.';
      setMessages(m => [
        ...m,
        {
          role: 'bot',
          text: `Error: ${message}`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)] md:h-[calc(100vh-6rem)] max-w-2xl mx-auto">
      {/* Chatbot header — uses dusk per brand spec */}
      <div className="bg-dusk text-sand-light px-5 py-4 md:rounded-t-3xl flex items-center gap-3 shadow-soft">
        <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center">
          <Bot className="w-5 h-5" />
        </div>
        <div>
          <p className="font-display font-bold">DanubeGuard AI</p>
          <p className="text-xs opacity-75">Context-aware water-quality assistant</p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-sand-light px-4 py-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'bot' && (
              <div className="w-7 h-7 rounded-full bg-dusk/20 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-dusk" />
              </div>
            )}
            <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
              m.role === 'user'
                ? 'bg-dusk text-sand-light rounded-br-sm'
                : 'bg-white text-dusk-dark rounded-bl-sm shadow-soft'
            }`}>
              <p className="whitespace-pre-wrap">{m.text}</p>
            </div>
            {m.role === 'user' && (
              <div className="w-7 h-7 rounded-full bg-grass/60 flex items-center justify-center flex-shrink-0">
                <UserIcon className="w-4 h-4 text-dusk-dark" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="bg-sand-light p-3 md:rounded-b-3xl border-t border-grass/40 space-y-2">
        {activeImage && (
          <div className="relative rounded-2xl overflow-hidden border border-grass/50 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={activeImage} alt="Active chatbot upload" className="w-full h-36 object-cover" />
            <button
              onClick={() => {
                setActiveImage(null);
                setActiveImageLabel('');
              }}
              aria-label="Remove image"
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="absolute left-2 bottom-2 bg-black/60 text-white text-xs px-2 py-1 rounded-lg max-w-[85%] truncate">
              {activeImageLabel || 'Image attached'}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onPickImage}
            className="hidden"
          />

          <button
            onClick={() => fileRef.current?.click()}
            aria-label="Upload image"
            className="w-12 h-12 rounded-2xl bg-white border border-grass/40 text-dusk-dark flex items-center justify-center"
          >
            {uploadingImage ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
          </button>

          <input
            value={input}
            disabled={busy}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Ask about water quality, satellites, your report..."
            className="flex-1 bg-white rounded-2xl px-4 py-3 text-sm outline-none border border-grass/40 focus:border-water-dark disabled:opacity-60"
          />

          <button
            onClick={() => void send()}
            aria-label="Send"
            disabled={!canSend}
            className="w-12 h-12 rounded-2xl bg-dusk hover:bg-dusk-dark text-sand-light flex items-center justify-center shadow-soft active:scale-95 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>

        <p className="text-[11px] text-dusk/70 px-1">
          Upload a water photo, then ask the chatbot what indicators it sees and whether conditions look safe.
        </p>
      </div>
    </div>
  );
}
