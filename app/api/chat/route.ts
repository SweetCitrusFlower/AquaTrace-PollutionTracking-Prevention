// app/api/chat/route.ts
// Self-contained mock chatbot — no Flask backend needed for hackathon demo.
// Logic ported from Omar's _mock_llm_response() in chatbot.py (Flask).
// To swap with a real LLM later: replace mockReply() with a fetch to your backend.

import { NextRequest, NextResponse } from 'next/server';

interface ChatBody {
  message?: string;
  user_id?: string;
  is_premium?: boolean; // demo: client can hint premium status
}

function mockReply(message: string, isPremium: boolean): string {
  const m = message.toLowerCase();

  // ── Premium-gated topics ─────────────────────────────────────────────
  const premiumKeywords = [
    'long-term', 'long term', 'historical', 'trend', 'next month',
    'prediction', 'forecast week', 'annual', 'seasonal', 'advanced analytics',
    '7 day', '7-day', 'week ahead', 'next week',
  ];
  if (premiumKeywords.some(kw => m.includes(kw)) && !isPremium) {
    return [
      "🔒 Great question! Long-term predictions and historical trend analysis",
      "are available with **AquaTrace Premium**.",
      '',
      "💡 Tip: You can earn premium tokens for free by contributing",
      "citizen-science photos at designated water monitoring points.",
      "Open the Camera tab to get started!",
    ].join('\n');
  }

  // ── Water quality / safety ───────────────────────────────────────────
  if (['safe', 'drink', 'quality', 'clean', 'pollution'].some(kw => m.includes(kw))) {
    return [
      "Based on the latest Sentinel-2 satellite pass and NGO IoT sensor readings,",
      "water quality in your area is currently within **acceptable limits** for",
      "irrigation. However, chlorophyll-a levels are slightly elevated near",
      "agricultural discharge zones.",
      '',
      "⚠️ I recommend **not** using this water for drinking without treatment.",
      "Keep notifications enabled for real-time alerts.",
    ].join('\n');
  }

  // ── Fishing ──────────────────────────────────────────────────────────
  if (['fish', 'fishing', 'angl'].some(kw => m.includes(kw))) {
    return [
      "🎣 Current satellite data shows acceptable dissolved oxygen levels in",
      "your area. Fishing should be safe, but avoid sectors marked with red",
      "anomaly indicators on the map — these show elevated chlorophyll-a",
      "which may indicate algal blooms.",
      '',
      "Check the 48h forecast on the Map tab for upcoming conditions.",
    ].join('\n');
  }

  // ── Sulfur / rotten eggs (camera context handoff) ───────────────────
  if (m.includes('sulfur') || m.includes('rotten') || m.includes('egg smell')) {
    return [
      "A sulfur / rotten-egg smell typically indicates **hydrogen sulfide (H₂S)**,",
      "produced by anaerobic decomposition of organic matter.",
      '',
      "Common causes near the Danube:",
      "• Stagnant water with low dissolved oxygen",
      "• Decomposing algal blooms",
      "• Sewage discharge from upstream",
      '',
      "I recommend reporting it via the Camera tab so we can correlate it",
      "with satellite chlorophyll readings in your zone.",
    ].join('\n');
  }

  // ── Algae / chlorophyll ──────────────────────────────────────────────
  if (['algae', 'algal', 'bloom', 'chlorophyll', 'green'].some(kw => m.includes(kw))) {
    return [
      "🌿 Algal blooms are detected via Sentinel-3 OLCI chlorophyll-a readings.",
      "Healthy rivers show < 10 mg/m³; bloom risk starts around 20 mg/m³;",
      "critical levels exceed 40 mg/m³.",
      '',
      "Current hotspots on the Danube:",
      "• Călărași industrial outflow — 51.7 mg/m³ (critical)",
      "• Dâmbovița confluence — 38.2 mg/m³ (high)",
      '',
      "Tap any red marker on the Map for full metrics.",
    ].join('\n');
  }

  // ── Agriculture / irrigation ─────────────────────────────────────────
  if (['agric', 'irrigat', 'crop', 'farm', 'fertiliz'].some(kw => m.includes(kw))) {
    return [
      "🌾 For irrigation, look at the nitrate (NO₃⁻) and phosphate (PO₄³⁻)",
      "readings on the Map. Levels above:",
      "• Nitrates > 50 mg/L → reduce drip irrigation, plants may absorb excess",
      "• Phosphates > 2 mg/L → algal bloom risk in downstream reservoirs",
      '',
      "If you're a fish breeder or farmer, the Premium plan adds 7-day",
      "agricultural runoff forecasts based on rainfall + soil saturation models.",
    ].join('\n');
  }

  // ── Tulcea water quality (DEMO HARDCODED) ───────────────────────────
  if (m.includes('tulcea')) {
    return [
      "📍 **Tulcea Region Water Quality Report**",
      '',
      "Current satellite readings (Sentinel-2 pass 14:32 UTC):",
      "• **Chlorophyll-a**: 12.4 mg/m³ (healthy range)",
      "• **Turbidity**: 3.2 NTU (clear water)",
      "• **Dissolved Oxygen**: 8.7 mg/L (excellent)",
      "• **Water Temp**: 16.8°C",
      '',
      "✅ Water is **safe for fishing** today. NGO sensors near Ceatalchioi",
      "report normal flow and no odor anomalies.",
      '',
      "⚠️ **Note**: Upriver near Călărași, chlorophyll levels are elevated",
      "(47.2 mg/m³) due to agricultural discharge. This affects water",
      "downstream in 3-4 days. Best to fish in the upper Danube now.",
    ].join('\n');
  }

  // ── Greeting / capabilities ──────────────────────────────────────────
  if (['hello', 'hi ', 'hey', 'salut', 'help', 'what can'].some(kw => m.includes(kw)) || m.length < 6) {
    return [
      "Hi! I'm **AquaTrace AI**, your water quality assistant. I can help with:",
      '',
      "• Current water quality status in your zone",
      "• 48-hour pollution forecasts",
      "• Agricultural runoff & irrigation safety",
      "• Fishing advisories",
      "• Interpreting satellite anomalies (chlorophyll, heat, turbidity)",
      '',
      "What would you like to know?",
    ].join('\n');
  }

  // ── Default fallback ─────────────────────────────────────────────────
  return [
    "I focus on water quality, the Danube ecosystem, and Copernicus satellite data.",
    "Try asking about:",
    "• \"Is the water safe near Tulcea?\"",
    "• \"Can I fish today?\"",
    "• \"What's the chlorophyll level around Călărași?\"",
    "• \"How will agricultural runoff affect my crops this week?\"",
  ].join('\n');
}

export async function POST(req: NextRequest) {
  let body: ChatBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const message = (body.message ?? '').trim();
  if (!message) {
    return NextResponse.json({ error: "Missing 'message'" }, { status: 400 });
  }

  // Demo: any user_id starting with "premium_" is treated as premium.
  // Real implementation would check Supabase here.
  const isPremium = body.is_premium === true || (body.user_id?.startsWith('premium_') ?? false);

  // Simulate latency for realistic UX (longer for demo visibility)
  await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));

  return NextResponse.json({
    reply: mockReply(message, isPremium),
    is_premium: isPremium,
  });
}
