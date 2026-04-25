import * as Location from "expo-location";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { submitCitizenReport } from "../services/api";

const DEFAULT_USER_ID =
  process.env.EXPO_PUBLIC_TEST_USER_ID || "00000000-0000-0000-0000-000000000000";

export default function QuestCaptureScreen() {
  const [reportType, setReportType] = useState("algae_bloom");
  const [imageUrl, setImageUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const resolveLocation = async () => {
    setFeedback(null);
    setBusy(true);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setFeedback("Location permission was denied.");
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setLatitude(current.coords.latitude.toFixed(6));
      setLongitude(current.coords.longitude.toFixed(6));
      setFeedback("GPS coordinates captured.");
    } catch {
      setFeedback("Failed to retrieve current GPS position.");
    } finally {
      setBusy(false);
    }
  };

  const submitReport = async () => {
    setFeedback(null);
    setBusy(true);

    try {
      const parsedLat = Number(latitude);
      const parsedLon = Number(longitude);

      if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLon)) {
        throw new Error("Latitude and longitude must be valid numbers.");
      }
      if (!imageUrl.trim().startsWith("http")) {
        throw new Error("Image URL must start with http or https.");
      }

      const result = await submitCitizenReport({
        userId: DEFAULT_USER_ID,
        reportType,
        latitude: parsedLat,
        longitude: parsedLon,
        imageUrl: imageUrl.trim(),
        notes: notes.trim() || undefined,
        exifTakenAt: new Date().toISOString(),
      });

      const awarded = result?.report?.tokens_awarded ?? 0;
      setFeedback(`Report submitted successfully. Tokens awarded: ${awarded}`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Submission failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>DanubeGuard Quest Capture</Text>
      <Text style={styles.subtitle}>Capture field anomalies and send geotagged reports.</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Report Type</Text>
        <TextInput value={reportType} onChangeText={setReportType} style={styles.input} autoCapitalize="none" />

        <Text style={styles.label}>Image URL (Supabase Storage public/signed URL)</Text>
        <TextInput value={imageUrl} onChangeText={setImageUrl} style={styles.input} autoCapitalize="none" />

        <Text style={styles.label}>Notes</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          style={[styles.input, styles.textArea]}
          multiline
          numberOfLines={3}
        />

        <Text style={styles.label}>Latitude</Text>
        <TextInput value={latitude} onChangeText={setLatitude} style={styles.input} keyboardType="decimal-pad" />

        <Text style={styles.label}>Longitude</Text>
        <TextInput value={longitude} onChangeText={setLongitude} style={styles.input} keyboardType="decimal-pad" />

        <View style={styles.actionsRow}>
          <Pressable style={styles.secondaryButton} onPress={resolveLocation} disabled={busy}>
            <Text style={styles.secondaryButtonText}>Get GPS</Text>
          </Pressable>

          <Pressable style={styles.primaryButton} onPress={submitReport} disabled={busy}>
            <Text style={styles.primaryButtonText}>Submit Report</Text>
          </Pressable>
        </View>

        {busy && <ActivityIndicator style={styles.loader} size="small" color="#0f7b74" />}
        {feedback && <Text style={styles.feedback}>{feedback}</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#102027",
  },
  subtitle: {
    color: "#335f66",
    marginBottom: 10,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    borderColor: "#d4e4e0",
    borderWidth: 1,
  },
  label: {
    marginTop: 10,
    marginBottom: 5,
    fontSize: 12,
    fontWeight: "600",
    color: "#335f66",
    textTransform: "uppercase",
  },
  input: {
    borderColor: "#b9d3ce",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#f7fcfa",
  },
  textArea: {
    minHeight: 82,
    textAlignVertical: "top",
  },
  actionsRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: "#0f7b74",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: "#d9efea",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#0f7b74",
    fontWeight: "700",
  },
  loader: {
    marginTop: 12,
  },
  feedback: {
    marginTop: 10,
    color: "#1b5f58",
    fontWeight: "600",
  },
});