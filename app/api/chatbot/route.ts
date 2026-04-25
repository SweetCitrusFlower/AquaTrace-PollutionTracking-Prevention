import { NextResponse } from 'next/server';
import { POLLUTION_POINTS } from '@/lib/mockData';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `You are DanubeGuard AI, an expert water-quality assistant for the DanubeGuard OS platform.

Capabilities:
- Explain current satellite-detected water anomalies (chlorophyll-a, turbidity, cyanobacteria).
- Interpret agricultural runoff and river safety indicators.
- Advise on safe water usage for irrigation, fishing, and recreation.
- Explain possible visual indicators from uploaded photos in a cautious, non-diagnostic way.

Hard rules:
1) Keep answers concise: maximum 2-4 short paragraphs unless user asks for more detail.
2) Safety first: if contamination is plausible, recommend caution and mention official authorities.
3) Stay on topic: water quality, agriculture, and Danube ecosystem only.
4) Mention data sources when possible: Copernicus Sentinel-2, Sencast, NGO IoT sensors, citizen reports.
5) Respond in the same language as the user.
6) Never claim certainty from a single photo. Use cautious wording like likely, possible, suggests.`;

const PREMIUM_KEYWORDS = [
  'long-term',
  'long term',
  'historical',
  'trend',
  'next month',
  'annual',
  'seasonal',
  'advanced analytics',
  '7 day',
  '7-day',
  'weekly forecast',
  'termen lung',
  'istoric',
  'tendinta',
  'tendinte',
  'saptamana',
  '7 zile',
  'analitica avansata',
];

type ChatHistoryItem = {
  role: 'user' | 'assistant';
  content: string;
};

type ChatRequestBody = {
  message?: unknown;
  userId?: unknown;
  isPremium?: unknown;
  imageDataUrl?: unknown;
  history?: unknown;
  reportContext?: unknown;
};

type ReportContext = {
  odor: string | null;
  color: string | null;
  flow: string | null;
  activity: string[];
};

type DbSignal = {
  name: string;
  severity: string;
  chlorophyll: number | null;
  nitrates: number | null;
  phosphates: number | null;
  heatAnomaly: number | null;
  reportedAt: string | null;
  notes: string | null;
};

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseHistory(input: unknown): ChatHistoryItem[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((entry): ChatHistoryItem | null => {
      if (!isObject(entry)) return null;
      const role = entry.role;
      const content = asString(entry.content);
      if ((role !== 'user' && role !== 'assistant') || !content) return null;
      return { role, content };
    })
    .filter((entry): entry is ChatHistoryItem => Boolean(entry))
    .slice(-8);
}

function parseReportContext(input: unknown): ReportContext | null {
  if (!isObject(input)) return null;

  const odor = asString(input.odor);
  const color = asString(input.color);
  const flow = asString(input.flow);
  const activityRaw = input.activity;
  const activity = Array.isArray(activityRaw)
    ? activityRaw
        .map(asString)
        .filter((value): value is string => Boolean(value))
        .slice(0, 8)
    : [];

  if (!odor && !color && !flow && activity.length === 0) return null;

  return {
    odor: odor ?? null,
    color: color ?? null,
    flow: flow ?? null,
    activity,
  };
}

function reportContextToText(ctx: ReportContext | null): string {
  if (!ctx) return 'No structured citizen report context was provided.';

  return [
    `Citizen report odor: ${ctx.odor ?? 'not provided'}`,
    `Citizen report color: ${ctx.color ?? 'not provided'}`,
    `Citizen report flow: ${ctx.flow ?? 'not provided'}`,
    `Nearby activities: ${ctx.activity.length ? ctx.activity.join(', ') : 'none reported'}`,
  ].join('\n');
}

function sanitizeImageDataUrl(input: unknown): string | null {
  const value = asString(input);
  if (!value) return null;
  if (!value.startsWith('data:image/')) return null;
  if (value.length > 3_200_000) return null;
  return value;
}

function asksForPremiumFeatures(message: string): boolean {
  const normalized = message.toLowerCase();
  return PREMIUM_KEYWORDS.some(keyword => normalized.includes(keyword));
}

async function resolvePremiumStatus(body: ChatRequestBody): Promise<boolean> {
  const userId = asString(body.userId);
  if (!userId) return false;

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const usersTable = process.env.SUPABASE_USERS_TABLE ?? 'users';

  if (!supabaseUrl || !serviceRoleKey) {
    return false;
  }

  try {
    const url = new URL(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/${usersTable}`);
    url.searchParams.set('select', 'is_premium');
    url.searchParams.set('id', `eq.${userId}`);
    url.searchParams.set('limit', '1');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return false;
    }

    const rows = (await response.json()) as Array<Record<string, unknown>>;
    const value = rows[0]?.is_premium;
    return typeof value === 'boolean' ? value : false;
  } catch {
    return false;
  }
}

function localSignals(): DbSignal[] {
  return POLLUTION_POINTS
    .slice()
    .sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime())
    .slice(0, 5)
    .map(point => ({
      name: point.name,
      severity: point.severity,
      chlorophyll: point.metrics.chlorophyll_mg_m3,
      nitrates: point.metrics.nitrates_mg_l,
      phosphates: point.metrics.phosphates_mg_l,
      heatAnomaly: point.metrics.heatAnomaly_C,
      reportedAt: point.reportedAt,
      notes: point.notes ?? null,
    }));
}

function mapDbRow(row: Record<string, unknown>): DbSignal {
  const metrics = isObject(row.metrics) ? row.metrics : null;

  return {
    name:
      asString(row.name) ??
      asString(row.location_name) ??
      asString(row.zone_name) ??
      asString(row.id) ??
      'Unnamed zone',
    severity: asString(row.severity) ?? 'unknown',
    chlorophyll:
      asNumber(row.chlorophyll_mg_m3) ??
      asNumber(row.chlorophyll) ??
      asNumber(metrics?.chlorophyll_mg_m3) ??
      null,
    nitrates:
      asNumber(row.nitrates_mg_l) ??
      asNumber(row.nitrates) ??
      asNumber(metrics?.nitrates_mg_l) ??
      null,
    phosphates:
      asNumber(row.phosphates_mg_l) ??
      asNumber(row.phosphates) ??
      asNumber(metrics?.phosphates_mg_l) ??
      null,
    heatAnomaly:
      asNumber(row.heatanomaly_c) ??
      asNumber(row.heat_anomaly_c) ??
      asNumber(row.heatAnomaly_C) ??
      asNumber(metrics?.heatAnomaly_C) ??
      null,
    reportedAt: asString(row.reported_at) ?? asString(row.reportedAt) ?? null,
    notes: asString(row.notes),
  };
}

async function loadSignalsFromDatabase(): Promise<{ source: 'supabase' | 'local'; signals: DbSignal[] }> {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const table = process.env.SUPABASE_SIGNALS_TABLE ?? 'pollution_points';

  if (!supabaseUrl || !serviceRoleKey) {
    return { source: 'local', signals: localSignals() };
  }

  try {
    const url = new URL(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/${table}`);
    url.searchParams.set('select', '*');
    url.searchParams.set('order', 'reported_at.desc.nullslast');
    url.searchParams.set('limit', '5');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return { source: 'local', signals: localSignals() };
    }

    const rows = (await response.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(rows) || rows.length === 0) {
      return { source: 'local', signals: localSignals() };
    }

    return {
      source: 'supabase',
      signals: rows.map(mapDbRow).slice(0, 5),
    };
  } catch {
    return { source: 'local', signals: localSignals() };
  }
}

function dbSignalsToText(signals: DbSignal[]): string {
  if (signals.length === 0) {
    return 'No recent water-quality rows were available.';
  }

  return signals
    .map((signal, index) => {
      const metrics = [
        signal.chlorophyll !== null ? `chlorophyll=${signal.chlorophyll} mg/m3` : null,
        signal.nitrates !== null ? `nitrates=${signal.nitrates} mg/L` : null,
        signal.phosphates !== null ? `phosphates=${signal.phosphates} mg/L` : null,
        signal.heatAnomaly !== null ? `heat_anomaly=${signal.heatAnomaly} C` : null,
      ]
        .filter((value): value is string => Boolean(value))
        .join(', ');

      return [
        `${index + 1}) ${signal.name}`,
        `severity=${signal.severity}`,
        signal.reportedAt ? `reported_at=${signal.reportedAt}` : null,
        metrics || 'metrics=not available',
        signal.notes ? `notes=${signal.notes}` : null,
      ]
        .filter((line): line is string => Boolean(line))
        .join(' | ');
    })
    .join('\n');
}

function buildPremiumGateMessage(): string {
  return (
    'Great question. Long-term predictions, historical trends, and advanced analytics are available with DanubeGuard Premium.\n\n' +
    'You can still unlock premium access for free by earning tokens from citizen-science photo contributions at monitoring points.'
  );
}

function mockReply(args: {
  userMessage: string;
  hasImage: boolean;
  isPremium: boolean;
  dbSignals: DbSignal[];
}): string {
  const { userMessage, hasImage, isPremium, dbSignals } = args;

  if (!isPremium && asksForPremiumFeatures(userMessage)) {
    return `[MOCK] ${buildPremiumGateMessage()}`;
  }

  const topSignal = dbSignals[0];
  const topSignalText = topSignal
    ? `${topSignal.name} is currently marked ${topSignal.severity} severity based on recent records.`
    : 'No recent database rows were available, so use caution and check local authorities.';

  if (hasImage) {
    return (
      `[MOCK] I reviewed your uploaded photo together with recent Danube records. ` +
      `The image suggests possible turbidity or organic load, but a photo alone cannot confirm contamination. ${topSignalText}\n\n` +
      `For safety, avoid drinking untreated water and verify with local environmental authorities if odors, foam, or discoloration persist.`
    );
  }

  return (
    `[MOCK] Based on current Danube monitoring context, ${topSignalText} ` +
    `I can also compare this with your location report and provide irrigation/fishing safety guidance.`
  );
}

type CompletionPayload = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

function extractReply(payload: CompletionPayload): string | null {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    const trimmed = content.trim();
    return trimmed.length ? trimmed : null;
  }

  if (Array.isArray(content)) {
    const text = content
      .map(part => (part?.type === 'text' ? part.text?.trim() ?? '' : ''))
      .filter(Boolean)
      .join('\n')
      .trim();
    return text.length ? text : null;
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ChatRequestBody;

    const message = asString(body.message) ?? '';
    const imageDataUrl = sanitizeImageDataUrl(body.imageDataUrl);

    if (!message && !imageDataUrl) {
      return NextResponse.json({ error: 'Missing message or image in request body.' }, { status: 400 });
    }

    const userMessage = message || 'Please analyze this uploaded water photo and summarize possible risks.';
    const reportContext = parseReportContext(body.reportContext);
    const history = parseHistory(body.history);
    const isPremium = await resolvePremiumStatus(body);

    if (!isPremium && asksForPremiumFeatures(userMessage)) {
      return NextResponse.json(
        {
          reply: buildPremiumGateMessage(),
          isPremium,
          dataSource: 'gating',
        },
        { status: 200 }
      );
    }

    const dbResult = await loadSignalsFromDatabase();
    const dbContextText = dbSignalsToText(dbResult.signals);

    const isGemini = !!process.env.GEMINI_API_KEY;
    const apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
    const model = process.env.GEMINI_MODEL || process.env.LLM_MODEL || (isGemini ? 'gemini-1.5-flash' : 'gpt-4o-mini');

    if (!apiKey) {
      return NextResponse.json(
        {
          reply: mockReply({
            userMessage,
            hasImage: Boolean(imageDataUrl),
            isPremium,
            dbSignals: dbResult.signals,
          }),
          isPremium,
          dataSource: dbResult.source,
          usedMock: true,
        },
        { status: 200 }
      );
    }

    const messages: Array<Record<string, unknown>> = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'system',
        content: isPremium
          ? 'The current user IS Premium. Full analytics are allowed.'
          : 'The current user is FREE tier. Keep long-term/historical analytics gated.',
      },
      {
        role: 'system',
        content: `Latest database context (${dbResult.source}):\n${dbContextText}`,
      },
      {
        role: 'system',
        content: `Citizen report context:\n${reportContextToText(reportContext)}`,
      },
    ];

    history.forEach(item => {
      messages.push({ role: item.role, content: item.content });
    });

    if (imageDataUrl) {
      messages.push({
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              `User question: ${userMessage}\n` +
              'Analyze the uploaded image, then relate findings to the provided database context.',
          },
          {
            type: 'image_url',
            image_url: { url: imageDataUrl },
          },
        ],
      });
    } else {
      messages.push({ role: 'user', content: userMessage });
    }

    const apiUrl = isGemini 
      ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';

    const completionResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 900,
        temperature: 0.4,
      }),
    });

    if (!completionResponse.ok) {
      const errorText = await completionResponse.text();
      console.error('Chat completion failed:', errorText);
      return NextResponse.json({ error: 'Failed to generate chatbot response.' }, { status: 502 });
    }

    const completion = (await completionResponse.json()) as CompletionPayload;
    const reply = extractReply(completion);

    if (!reply) {
      return NextResponse.json({ error: 'No response text returned by the LLM.' }, { status: 502 });
    }

    return NextResponse.json(
      {
        reply,
        isPremium,
        dataSource: dbResult.source,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Chatbot route error:', error);
    return NextResponse.json({ error: 'Chatbot service is temporarily unavailable.' }, { status: 500 });
  }
}
