import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { PrimaryButton, ProgressBar, ScreenContainer } from "@/components";
import { PodcastFormat } from "@/domain/models";
import { RootStackParamList } from "@/navigation/types";
import { ApiError, fetchGenerationStatus, isNetworkApiError, requestPodcastGeneration, uploadPdfFiles } from "@/services/api";
import { usePodcastsStore, useUploadWizardStore } from "@/state/stores";
import { colors, spacing, typography } from "@/theme";

type Navigation = NativeStackNavigationProp<RootStackParamList>;
const STATUS_POLL_INTERVAL_MS = 1500;
const STATUS_MAX_POLLS = 320;
const QUEUED_WARNING_POLLS = 20;

export function UploadingScreen() {
  const navigation = useNavigation<Navigation>();
  const loadPodcasts = usePodcastsStore((state) => state.loadPodcasts);

  const files = useUploadWizardStore((state) => state.files);
  const voice = useUploadWizardStore((state) => state.voice);
  const format = useUploadWizardStore((state) => state.format);
  const podcastName = useUploadWizardStore((state) => state.podcastName);
  const sections = useUploadWizardStore((state) => state.sections);
  const setUploadedFileIds = useUploadWizardStore((state) => state.setUploadedFileIds);
  const resetWizard = useUploadWizardStore((state) => state.resetWizard);

  const [progress, setProgress] = useState(5);
  const [statusText, setStatusText] = useState("Dosyalar hazırlanıyor...");
  const [error, setError] = useState<string | null>(null);
  const validSections = useMemo(
    () => sections.filter((section) => section.enabled && section.title.trim().length > 0),
    [sections]
  );

  const canStart = useMemo(
    () =>
      files.length > 0 &&
      voice !== null &&
      format !== null &&
      podcastName.trim().length > 0 &&
      validSections.length > 0,
    [files, voice, format, podcastName, validSections.length]
  );

  useEffect(() => {
    if (!canStart || voice === null || format === null) {
      setError("Wizard bilgileri eksik. Lütfen adımları yeniden tamamla.");
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        setStatusText("PDF dosyaları yükleniyor...");
        const uploadResult = await uploadPdfFiles(files);
        if (cancelled) {
          return;
        }

        setUploadedFileIds(uploadResult.file_ids);
        setProgress(30);

        setStatusText("Podcast üretim işi kuyruğa alındı...");
        const job = await requestPodcastGeneration({
          title: podcastName,
          voice,
          format: format as PodcastFormat,
          file_ids: uploadResult.file_ids,
          sections: validSections.map((section) => ({
            id: section.id,
            title: section.title,
            enabled: section.enabled
          }))
        });

        let attempts = 0;
        let queuedStreak = 0;
        while (!cancelled && attempts < STATUS_MAX_POLLS) {
          await sleep(STATUS_POLL_INTERVAL_MS);
          const status = await fetchGenerationStatus(job.job_id);
          if (cancelled) {
            return;
          }

          attempts += 1;
          const elapsedSec = Math.round((attempts * STATUS_POLL_INTERVAL_MS) / 1000);
          queuedStreak = status.status === "queued" ? queuedStreak + 1 : 0;

          setProgress(Math.max(35, status.progress_pct));
          if (queuedStreak >= QUEUED_WARNING_POLLS) {
            setStatusText(`Kuyrukta bekliyor... (${elapsedSec}s)`);
          } else {
            setStatusText(getStatusText(status.status, elapsedSec));
          }

          if (status.status === "completed") {
            setProgress(100);
            await loadPodcasts();
            resetWizard();
            navigation.navigate("MainTabs", { screen: "ListenTab" });
            return;
          }

          if (status.status === "failed") {
            throw new Error(status.error ?? "Podcast üretimi başarısız oldu.");
          }
        }

        throw new Error("İşlem zaman aşımına uğradı. Backend worker durumunu kontrol edip tekrar dene.");
      } catch (e) {
        if (cancelled) {
          return;
        }
        if (isNetworkApiError(e)) {
          navigation.replace("NoInternet");
          return;
        }
        if (e instanceof ApiError && e.status >= 500) {
          navigation.replace("GeneralError");
          return;
        }
        const message = toErrorMessage(e);
        setError(message);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [canStart, files, format, loadPodcasts, navigation, podcastName, resetWizard, setUploadedFileIds, validSections, voice]);

  return (
    <ScreenContainer contentStyle={styles.container}>
      <Text style={styles.title}>İçeriğin hazırlanıyor...</Text>
      <Text style={styles.subtitle}>{error ?? statusText}</Text>
      <View style={styles.progressBlock}>
        <ProgressBar progress={progress} />
        <Text style={styles.progressValue}>%{progress}</Text>
      </View>

      {error ? <PrimaryButton label="Yeniden Dene" onPress={() => navigation.replace("Uploading")} /> : null}
    </ScreenContainer>
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getStatusText(status: "queued" | "processing" | "completed" | "failed", elapsedSec: number): string {
  if (status === "queued") {
    return `Kuyrukta bekliyor... (${elapsedSec}s)`;
  }
  if (status === "processing") {
    return `Ses dalgaları üretiliyor... (${elapsedSec}s)`;
  }
  if (status === "completed") {
    return "Tamamlandı";
  }
  return "Üretim başarısız";
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (typeof error.payload === "string") {
      return error.payload;
    }
    if (error.payload && typeof error.payload === "object") {
      const detail = (error.payload as { detail?: unknown }).detail;
      const message = (error.payload as { message?: unknown }).message;
      if (typeof detail === "string") {
        return detail;
      }
      if (typeof message === "string") {
        return message;
      }
    }
    return "İstek işlenemedi. Lütfen bilgileri kontrol et.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Bilinmeyen bir hata oluştu.";
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    justifyContent: "center",
    gap: spacing.md
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    textAlign: "center"
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center"
  },
  progressBlock: {
    gap: spacing.sm
  },
  progressValue: {
    ...typography.h2,
    color: colors.motivationOrange,
    textAlign: "center"
  }
});
