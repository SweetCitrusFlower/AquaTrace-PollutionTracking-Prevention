export type ReportInput = {
  userId: string;
  reportType: string;
  latitude: number;
  longitude: number;
  imageUrl: string;
  notes?: string;
  exifTakenAt?: string;
  gpsAccuracyM?: number;
};

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:5000";

export async function submitCitizenReport(payload: ReportInput) {
  const response = await fetch(`${API_BASE}/api/reports`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: payload.userId,
      report_type: payload.reportType,
      latitude: payload.latitude,
      longitude: payload.longitude,
      image_url: payload.imageUrl,
      notes: payload.notes,
      exif_taken_at: payload.exifTakenAt,
      gps_accuracy_m: payload.gpsAccuracyM,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data?.error || "Failed to submit report.";
    throw new Error(message);
  }

  return data;
}