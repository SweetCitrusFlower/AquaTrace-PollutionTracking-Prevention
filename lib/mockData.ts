// lib/mockData.ts
// Hackathon mock data — replace with real Copernicus + NGO API calls post-demo.

export type PollutionSource = 'satellite' | 'ngo-sensor' | 'citizen';
export type Severity = 'low' | 'moderate' | 'high' | 'critical';

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
    heatAnomaly_C: number;     // Sentinel-3 SLSTR thermal
  };
  reportedAt: string; // ISO
  notes?: string;
}

// Real-ish points along the Danube — Bucharest area, Iron Gates, Delta, etc.
export const POLLUTION_POINTS: PollutionPoint[] = [
  {
    id: 'p-001',
    coords: [44.4268, 26.1025], // Bucharest tributary outlet
    name: 'Dâmbovița confluence',
    source: 'citizen',
    severity: 'high',
    metrics: { chlorophyll_mg_m3: 38.2, nitrates_mg_l: 12.4, phosphates_mg_l: 2.1, heatAnomaly_C: 1.8 },
    reportedAt: '2026-04-23T08:14:00Z',
    notes: 'Algal bloom + plastic debris reported by 3 citizens.',
  },
  {
    id: 'p-002',
    coords: [44.6228, 22.6750], // Iron Gates I
    name: 'Iron Gates Reservoir',
    source: 'satellite',
    severity: 'moderate',
    metrics: { chlorophyll_mg_m3: 22.1, nitrates_mg_l: 6.8, phosphates_mg_l: 1.0, heatAnomaly_C: 0.6 },
    reportedAt: '2026-04-24T11:00:00Z',
  },
  {
    id: 'p-003',
    coords: [45.2157, 28.7969], // Tulcea / Delta entry
    name: 'Tulcea — Delta intake',
    source: 'ngo-sensor',
    severity: 'low',
    metrics: { chlorophyll_mg_m3: 8.4, nitrates_mg_l: 2.1, phosphates_mg_l: 0.3, heatAnomaly_C: 0.2 },
    reportedAt: '2026-04-24T07:30:00Z',
    notes: 'Stable readings — protected zone.',
  },
  {
    id: 'p-004',
    coords: [44.0833, 27.2667], // Călărași
    name: 'Călărași industrial outflow',
    source: 'satellite',
    severity: 'critical',
    metrics: { chlorophyll_mg_m3: 51.7, nitrates_mg_l: 18.9, phosphates_mg_l: 3.6, heatAnomaly_C: 3.4 },
    reportedAt: '2026-04-24T15:22:00Z',
    notes: 'Sentinel-2 detected color anomaly + Sentinel-3 thermal spike.',
  },
  // Additional pollution points along the Danube
  {
    id: 'p-005',
    coords: [44.9517, 20.2564], // Belgrade area
    name: 'Belgrade industrial zone',
    source: 'citizen',
    severity: 'high',
    metrics: { chlorophyll_mg_m3: 42.3, nitrates_mg_l: 14.2, phosphates_mg_l: 2.8, heatAnomaly_C: 2.1 },
    reportedAt: '2026-04-24T09:45:00Z',
    notes: 'Multiple citizen reports of foam and unusual odors.',
  },
  {
    id: 'p-006',
    coords: [45.4392, 21.0572], // Timișoara area
    name: 'Timiș river confluence',
    source: 'ngo-sensor',
    severity: 'moderate',
    metrics: { chlorophyll_mg_m3: 25.6, nitrates_mg_l: 8.3, phosphates_mg_l: 1.4, heatAnomaly_C: 0.9 },
    reportedAt: '2026-04-23T14:20:00Z',
    notes: 'Elevated nitrates from agricultural runoff.',
  },
  {
    id: 'p-007',
    coords: [44.3181, 24.2711], // Craiova area
    name: 'Olt river discharge',
    source: 'satellite',
    severity: 'high',
    metrics: { chlorophyll_mg_m3: 35.8, nitrates_mg_l: 11.6, phosphates_mg_l: 2.3, heatAnomaly_C: 1.7 },
    reportedAt: '2026-04-22T10:30:00Z',
    notes: 'Agricultural fertilizer runoff detected.',
  },
  {
    id: 'p-008',
    coords: [45.6644, 25.7889], // Brașov area
    name: 'Olt river - upstream Brașov',
    source: 'ngo-sensor',
    severity: 'low',
    metrics: { chlorophyll_mg_m3: 9.2, nitrates_mg_l: 2.8, phosphates_mg_l: 0.4, heatAnomaly_C: 0.1 },
    reportedAt: '2026-04-24T06:15:00Z',
    notes: 'Clean readings - mountain water source.',
  },
  {
    id: 'p-009',
    coords: [44.5672, 27.8522], // Constanța area
    name: 'Black Sea coast outlet',
    source: 'satellite',
    severity: 'moderate',
    metrics: { chlorophyll_mg_m3: 28.4, nitrates_mg_l: 7.1, phosphates_mg_l: 1.2, heatAnomaly_C: 0.8 },
    reportedAt: '2026-04-23T16:40:00Z',
    notes: 'Delta nutrient discharge - seasonal pattern.',
  },
  {
    id: 'p-010',
    coords: [46.0625, 21.9189], // Arad area
    name: 'Mureș river confluence',
    source: 'citizen',
    severity: 'moderate',
    metrics: { chlorophyll_mg_m3: 19.8, nitrates_mg_l: 5.9, phosphates_mg_l: 0.9, heatAnomaly_C: 0.5 },
    reportedAt: '2026-04-22T11:25:00Z',
    notes: 'Local reports of slight discoloration.',
  },
  {
    id: 'p-011',
    coords: [45.1028, 24.3692], // Sibiu area
    name: 'Lotru river discharge',
    source: 'ngo-sensor',
    severity: 'low',
    metrics: { chlorophyll_mg_m3: 7.6, nitrates_mg_l: 1.9, phosphates_mg_l: 0.2, heatAnomaly_C: 0.1 },
    reportedAt: '2026-04-24T08:00:00Z',
    notes: 'Mountain tributary - clean water.',
  },
  {
    id: 'p-012',
    coords: [44.2128, 28.4217], // Dobrogea area
    name: 'Casian lake outlet',
    source: 'satellite',
    severity: 'high',
    metrics: { chlorophyll_mg_m3: 39.5, nitrates_mg_l: 13.8, phosphates_mg_l: 2.5, heatAnomaly_C: 1.9 },
    reportedAt: '2026-04-21T13:10:00Z',
    notes: 'Eutrophication detected via satellite.',
  },
  {
    id: 'p-013',
    coords: [45.8122, 20.4611], // Jimbolia area
    name: 'Bega river canal',
    source: 'citizen',
    severity: 'moderate',
    metrics: { chlorophyll_mg_m3: 21.3, nitrates_mg_l: 6.2, phosphates_mg_l: 1.1, heatAnomaly_C: 0.7 },
    reportedAt: '2026-04-23T10:50:00Z',
    notes: 'Industrial canal discharge.',
  },
  {
    id: 'p-014',
    coords: [44.8894, 23.2717], // Drobeta-Turnu Severin
    name: 'Severin marsh area',
    source: 'satellite',
    severity: 'critical',
    metrics: { chlorophyll_mg_m3: 48.9, nitrates_mg_l: 16.4, phosphates_mg_l: 3.1, heatAnomaly_C: 2.8 },
    reportedAt: '2026-04-22T14:35:00Z',
    notes: 'Heavy industrial pollution - urgent attention needed.',
  },
  {
    id: 'p-015',
    coords: [45.4894, 27.9183], // Galați area
    name: 'Siret river confluence',
    source: 'ngo-sensor',
    severity: 'moderate',
    metrics: { chlorophyll_mg_m3: 23.7, nitrates_mg_l: 7.4, phosphates_mg_l: 1.3, heatAnomaly_C: 0.8 },
    reportedAt: '2026-04-24T07:45:00Z',
    notes: 'Agricultural area - moderate readings.',
  },
  {
    id: 'p-016',
    coords: [44.6517, 21.7139], // Kladovo area
    name: 'Kladovo industrial port',
    source: 'citizen',
    severity: 'high',
    metrics: { chlorophyll_mg_m3: 36.2, nitrates_mg_l: 12.1, phosphates_mg_l: 2.4, heatAnomaly_C: 1.6 },
    reportedAt: '2026-04-23T12:20:00Z',
    notes: 'Port activity and industrial discharge.',
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
  accent: 'water' | 'grass' | 'dusk';
}

export const NGOS: NGO[] = [
  {
    id: 'ngo-1',
    name: 'Asociația Salvați Dunărea',
    region: 'Lower Danube · RO',
    description: 'Field sensors and water-sampling teams across the Romanian stretch.',
    sensorCount: 24,
    pointIds: ['p-003', 'p-004'],
    accent: 'water',
  },
  {
    id: 'ngo-2',
    name: 'Danube Delta Watch',
    region: 'Tulcea · RO',
    description: 'Biodiversity & water-quality monitoring inside the Biosphere Reserve.',
    sensorCount: 11,
    pointIds: ['p-003'],
    accent: 'grass',
  },
  {
    id: 'ngo-3',
    name: 'Iron Gates Coalition',
    region: 'RO/RS border',
    description: 'Cross-border pollution alerts, focus on heavy industry runoff.',
    sensorCount: 8,
    pointIds: ['p-002'],
    accent: 'dusk',
  },
];

// Citizen-Science form schema — drives the camera-flow questionnaire
export const ODOR_OPTIONS  = ['Odorless', 'Chemical', 'Rotten Eggs / Sulfur', 'Sewage', 'Fishy'] as const;
export const COLOR_OPTIONS = ['Clear', 'Brown', 'Greenish', 'Reddish', 'Black', 'Foamy White'] as const;
export const FLOW_OPTIONS  = ['Low', 'Normal', 'High', 'Flood'] as const;
export const ACTIVITY_OPTIONS = ['Factory nearby', 'Agriculture/Farm runoff', 'Boats/Marina', 'Construction', 'None visible'] as const;

export type CitizenReport = {
  photoDataUrl?: string;
  odor:    typeof ODOR_OPTIONS[number]   | null;
  color:   typeof COLOR_OPTIONS[number]  | null;
  flow:    typeof FLOW_OPTIONS[number]   | null;
  activity: typeof ACTIVITY_OPTIONS[number][];
  submittedAt?: string;
};

// --- Chatbot context (mock state, swap for Zustand) ---
// The camera flow writes the most recent report here; the chatbot reads it on mount.
export const chatbotContext: { lastReport: CitizenReport | null } = {
  lastReport: null,
};

export function buildChatbotGreeting(): string {
  const r = chatbotContext.lastReport;
  if (!r) return "Hi! I'm DanubeGuard AI. Ask me anything about water quality, your area, or how to interpret satellite data.";

  if (r.odor === 'Rotten Eggs / Sulfur') {
    return "I noticed you reported a sulfur smell. This usually indicates high nitrite levels or organic decomposition (anaerobic conditions). How can I help you analyze this area further?";
  }
  if (r.color === 'Greenish' || r.color === 'Foamy White') {
    return `You reported water that looks "${r.color.toLowerCase()}" — this often correlates with eutrophication or algal blooms. Want me to pull the latest Sentinel-3 chlorophyll readings for your zone?`;
  }
  if (r.activity?.includes('Factory nearby')) {
    return "Thanks for flagging factory activity nearby. I can cross-reference EU industrial emission registries for that zone if you'd like.";
  }
  return `Thanks for your recent report. I logged: odor=${r.odor ?? '—'}, color=${r.color ?? '—'}, flow=${r.flow ?? '—'}. What would you like to explore?`;
}
