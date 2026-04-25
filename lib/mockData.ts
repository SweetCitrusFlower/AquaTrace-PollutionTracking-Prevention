// lib/mockData.ts
// Hackathon mock data — replace with real Copernicus + NGO API calls post-demo.

export type PollutionSource = "satellite" | "ngo-sensor" | "citizen";
export type Severity = "low" | "moderate" | "high" | "critical";

export interface PollutionPoint {
  id: string;
  coords: [number, number]; // [lat, lng]
  name: string;
  source: PollutionSource;
  severity: Severity;
  metrics: {
    chlorophyll_mg_m3: number; // Sentinel-3 OLCI proxy
    nitrates_mg_l: number;
    phosphates_mg_l: number;
    heatAnomaly_C: number; // Sentinel-3 SLSTR thermal
  };
  reportedAt: string; // ISO
  notes?: string;
}

// Real-ish points along the Danube — Bucharest area, Iron Gates, Delta, etc.
export const POLLUTION_POINTS: PollutionPoint[] = [];

// Danube regions for satellite analysis
export interface DanubeRegion {
  id: string;
  name: string;
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  center: [number, number]; // [lat, lng]
}

export const DANUBE_REGIONS: DanubeRegion[] = [
  {
    id: "iron-gates",
    name: "Iron Gates",
    bbox: [22.4, 44.5, 22.8, 44.8],
    center: [44.6228, 22.675],
  },
  {
    id: "tulcea-delta",
    name: "Tulcea / Delta",
    bbox: [28.6, 45.0, 29.0, 45.4],
    center: [45.2157, 28.7969],
  },
  {
    id: "giurgiu",
    name: "Giurgiu / Ruse",
    bbox: [25.9, 43.8, 26.3, 44.1],
    center: [43.9333, 25.9667],
  },
  {
    id: "smirdan",
    name: "Smârdan / Galați",
    bbox: [28.0, 45.4, 28.5, 45.8],
    center: [45.5667, 28.1],
  },
  {
    id: "corabia",
    name: "Corabia",
    bbox: [24.4, 43.7, 24.8, 44.0],
    center: [43.7833, 24.5333],
  },
  {
    id: "portile-fier",
    name: "Portile de Fier",
    bbox: [21.8, 44.4, 22.2, 44.7],
    center: [44.5447, 21.9667],
  },
];

export interface NGO {
  id: string;
  name: string;
  region: string;
  description: string;
  sensorCount: number;
  // Subset of points belonging to this NGO — for the home-page mini map
  pointIds: string[];
  accent: "water" | "grass" | "dusk";
}

export const NGOS: NGO[] = [
  {
    id: "ngo-1",
    name: "Asociația Salvați Dunărea",
    region: "Lower Danube · RO",
    description:
      "Field sensors and water-sampling teams across the Romanian stretch.",
    sensorCount: 24,
    pointIds: ["p-003", "p-004"],
    accent: "water",
  },
  {
    id: "ngo-2",
    name: "Danube Delta Watch",
    region: "Tulcea · RO",
    description:
      "Biodiversity & water-quality monitoring inside the Biosphere Reserve.",
    sensorCount: 11,
    pointIds: ["p-003"],
    accent: "grass",
  },
  {
    id: "ngo-3",
    name: "Iron Gates Coalition",
    region: "RO/RS border",
    description:
      "Cross-border pollution alerts, focus on heavy industry runoff.",
    sensorCount: 8,
    pointIds: ["p-002"],
    accent: "dusk",
  },
];

// Citizen-Science form schema — drives the camera-flow questionnaire
export const ODOR_OPTIONS = [
  "Odorless",
  "Chemical",
  "Rotten Eggs / Sulfur",
  "Sewage",
  "Fishy",
] as const;
export const COLOR_OPTIONS = [
  "Clear",
  "Brown",
  "Greenish",
  "Reddish",
  "Black",
  "Foamy White",
] as const;
export const FLOW_OPTIONS = ["Low", "Normal", "High", "Flood"] as const;
export const ACTIVITY_OPTIONS = [
  "Factory nearby",
  "Agriculture/Farm runoff",
  "Boats/Marina",
  "Construction",
  "None visible",
] as const;

export type CitizenReport = {
  photoDataUrl?: string;
  odor: (typeof ODOR_OPTIONS)[number] | null;
  color: (typeof COLOR_OPTIONS)[number] | null;
  flow: (typeof FLOW_OPTIONS)[number] | null;
  activity: (typeof ACTIVITY_OPTIONS)[number][];
  submittedAt?: string;
};

// --- Chatbot context (mock state, swap for Zustand) ---
// The camera flow writes the most recent report here; the chatbot reads it on mount.
export const chatbotContext: { lastReport: CitizenReport | null } = {
  lastReport: null,
};

export function buildChatbotGreeting(): string {
  const r = chatbotContext.lastReport;
  if (!r)
    return "Hi! I'm DanubeGuard AI. Ask me anything about water quality, your area, or how to interpret satellite data.";

  if (r.odor === "Rotten Eggs / Sulfur") {
    return "I noticed you reported a sulfur smell. This usually indicates high nitrite levels or organic decomposition (anaerobic conditions). How can I help you analyze this area further?";
  }
  if (r.color === "Greenish" || r.color === "Foamy White") {
    return `You reported water that looks "${r.color.toLowerCase()}" — this often correlates with eutrophication or algal blooms. Want me to pull the latest Sentinel-3 chlorophyll readings for your zone?`;
  }
  if (r.activity?.includes("Factory nearby")) {
    return "Thanks for flagging factory activity nearby. I can cross-reference EU industrial emission registries for that zone if you'd like.";
  }
  return `Thanks for your recent report. I logged: odor=${r.odor ?? "—"}, color=${r.color ?? "—"}, flow=${r.flow ?? "—"}. What would you like to explore?`;
}
