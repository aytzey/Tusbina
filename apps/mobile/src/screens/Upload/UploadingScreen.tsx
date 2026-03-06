import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { PrimaryButton, ProgressBar, ScreenContainer } from "@/components";
import { Podcast, PodcastFormat } from "@/domain/models";
import { RootStackParamList } from "@/navigation/types";
import {
  ApiError,
  fetchGenerationStatus,
  isNetworkApiError,
  prioritizePodcastPart,
  requestPodcastGeneration,
  uploadPdfFiles,
} from "@/services/api";
import { usePlayerStore, usePodcastsStore, useUploadWizardStore } from "@/state/stores";
import { colors, radius, spacing, typography } from "@/theme";
import {
  buildPodcastQueue,
  getPodcastPartStatusLabel,
  getPodcastPartSummary,
  resolvePodcastQueueStart,
} from "@/utils";
const LOGO = require("../../../assets/logo.png");

type Navigation = NativeStackNavigationProp<RootStackParamList>;
type UploadPhase = "uploading" | "planning" | "tracking";

const STATUS_POLL_INTERVAL_MS = 1500;
const PODCAST_POLL_INTERVAL_MS = 2500;
const STATUS_MAX_POLLS = 320;
const QUEUED_WARNING_POLLS = 20;
const PLANNED_PODCAST_FETCH_RETRIES = 8;
const PLANNED_PODCAST_FETCH_RETRY_MS = 1200;

export function UploadingScreen() {
  const navigation = useNavigation<Navigation>();
  const replacePodcast = usePodcastsStore((state) => state.replacePodcast);
  const refreshPodcast = usePodcastsStore((state) => state.refreshPodcast);
  const setQueue = usePlayerStore((state) => state.setQueue);

  const files = useUploadWizardStore((state) => state.files);
  const coverImage = useUploadWizardStore((state) => state.coverImage);
  const voice = useUploadWizardStore((state) => state.voice);
  const format = useUploadWizardStore((state) => state.format);
  const podcastName = useUploadWizardStore((state) => state.podcastName);
  const setUploadedFileIds = useUploadWizardStore((state) => state.setUploadedFileIds);
  const resetWizard = useUploadWizardStore((state) => state.resetWizard);

  const [phase, setPhase] = useState<UploadPhase>("uploading");
  const [progress, setProgress] = useState(5);
  const [statusText, setStatusText] = useState("Kaynak dosyaları hazırlanıyor...");
  const [error, setError] = useState<string | null>(null);
  const [podcast, setPodcast] = useState<Podcast | null>(null);
  const [planningJobId, setPlanningJobId] = useState<string | null>(null);
  const planningJobIdRef = useRef<string | null>(null);
  const seededPriorityPodcastId = useRef<string | null>(null);

  const uploadItems = useMemo(
    () => (coverImage ? [...files, coverImage] : files),
    [coverImage, files]
  );

  const canStart = useMemo(
    () =>
      files.length > 0 &&
      voice !== null &&
      format !== null &&
      podcastName.trim().length > 0,
    [files, voice, format, podcastName]
  );

  const partSummary = useMemo(() => (podcast ? getPodcastPartSummary(podcast) : null), [podcast]);
  const hasPendingParts = useMemo(
    () => Boolean(podcast?.parts.some((part) => part.status === "queued" || part.status === "processing")),
    [podcast]
  );
  const firstReadyPart = useMemo(
    () => podcast?.parts.find((part) => part.status === "ready") ?? null,
    [podcast]
  );

  useEffect(() => {
    if (podcast || planningJobIdRef.current) {
      return;
    }
    if (!canStart || voice === null || format === null) {
      setError("Yükleme bilgileri eksik. Lütfen adımları yeniden tamamla.");
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        setPhase("uploading");
        setStatusText("Kaynak dosyaları yükleniyor...");
        const uploadResult = await uploadPdfFiles(uploadItems);
        if (cancelled) {
          return;
        }

        const uploadedIdByLocalId = new Map<string, string>();
        uploadItems.forEach((file, index) => {
          const uploadedId = uploadResult.file_ids[index];
          if (uploadedId) {
            uploadedIdByLocalId.set(file.localId, uploadedId);
          }
        });

        const uploadedDocumentIds = files
          .map((file) => uploadedIdByLocalId.get(file.localId))
          .filter((value): value is string => Boolean(value));
        const coverFileId = coverImage ? uploadedIdByLocalId.get(coverImage.localId) ?? null : null;

        setUploadedFileIds(uploadedDocumentIds);
        setProgress(30);

        setPhase("planning");
        setStatusText("Önce belge otomatik bölümleniyor ve bölüm adları hazırlanıyor. Hazır olan parçalar burada anında görünecek.");
        const job = await requestPodcastGeneration({
          title: podcastName,
          voice,
          format: format as PodcastFormat,
          file_ids: uploadedDocumentIds,
          cover_file_id: coverFileId ?? undefined,
          sections: []
        });
        planningJobIdRef.current = job.job_id;
        setPlanningJobId(job.job_id);

        let attempts = 0;
        let queuedStreak = 0;
        let lastResolvedPodcastId: string | null = null;
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
          setStatusText(getJobStatusText(status.status, elapsedSec, queuedStreak >= QUEUED_WARNING_POLLS));

          if (status.status === "failed") {
            throw new Error(status.error ?? "Podcast üretimi başarısız oldu.");
          }

          if (!status.result_podcast_id) {
            continue;
          }

          lastResolvedPodcastId = status.result_podcast_id;

          const plannedPodcast = await loadPlannedPodcastWithRetry({
            cancelled: () => cancelled,
            podcastId: status.result_podcast_id,
            refreshPodcast,
          });
          if (!plannedPodcast) {
            setProgress(Math.max(45, status.progress_pct));
            setStatusText("Plan hazırlandı. İçerik listesi yükleniyor, oturum doğrulanıyor...");
            continue;
          }

          let nextPodcast = plannedPodcast;
          if (seededPriorityPodcastId.current !== plannedPodcast.id && plannedPodcast.parts[0]) {
            try {
              nextPodcast = await prioritizePodcastPart(plannedPodcast.id, plannedPodcast.parts[0].id);
              replacePodcast(nextPodcast);
            } catch {
              replacePodcast(plannedPodcast);
            }
            seededPriorityPodcastId.current = plannedPodcast.id;
          } else {
            replacePodcast(plannedPodcast);
          }

          setPhase("tracking");
          setPodcast(nextPodcast);
          setProgress(resolveTrackingProgress(nextPodcast));
          setStatusText(buildTrackingStatusText(nextPodcast));
          resetWizard();
          return;
        }

        if (lastResolvedPodcastId) {
          throw new Error("Plan hazırlandı ancak oturum doğrulanamadığı için içerik yüklenemedi. Tekrar giriş yapıp yeniden dene.");
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
        setError(toErrorMessage(e));
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    canStart,
    files,
    format,
    navigation,
    podcastName,
    podcast,
    refreshPodcast,
    replacePodcast,
    resetWizard,
    coverImage,
    setUploadedFileIds,
    uploadItems,
    voice
  ]);

  useEffect(() => {
    if (!podcast?.id || !hasPendingParts) {
      return;
    }

    let cancelled = false;
    const poll = async () => {
      while (!cancelled) {
        await sleep(PODCAST_POLL_INTERVAL_MS);
        const refreshed = await refreshPodcast(podcast.id);
        if (cancelled || !refreshed) {
          continue;
        }
        setPodcast(refreshed);
        setProgress(resolveTrackingProgress(refreshed));
        setStatusText(buildTrackingStatusText(refreshed));
      }
    };

    void poll();

    return () => {
      cancelled = true;
    };
  }, [hasPendingParts, podcast?.id, refreshPodcast]);

  const handleOpenPodcast = (targetPartId?: string) => {
    if (!podcast) {
      return;
    }

    const queue = buildPodcastQueue(podcast);
    const defaultStart = resolvePodcastQueueStart(podcast);
    const requestedIndex =
      targetPartId !== undefined ? queue.findIndex((item) => item.id === targetPartId) : defaultStart.startIndex;
    const startIndex = requestedIndex >= 0 ? requestedIndex : defaultStart.startIndex;
    const startPositionSec = targetPartId ? 0 : defaultStart.startPositionSec;

    setQueue(queue, startIndex, startPositionSec);
    navigation.navigate("Player", { trackId: queue[startIndex]?.id, sourceType: "ai" });
  };

  const handlePrioritizePart = async (partId: string) => {
    if (!podcast) {
      return;
    }

    try {
      const updatedPodcast = await prioritizePodcastPart(podcast.id, partId);
      replacePodcast(updatedPodcast);
      setPodcast(updatedPodcast);
      setProgress(resolveTrackingProgress(updatedPodcast));
      setStatusText(buildTrackingStatusText(updatedPodcast));
    } catch {
      setError("Bölüm sırası güncellenemedi. Lütfen tekrar dene.");
    }
  };

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      <Image source={LOGO} style={styles.logo} resizeMode="contain" />
      <Text style={styles.title}>{podcast ? "Planın hazır" : "İçeriğin hazırlanıyor..."}</Text>
      <Text style={styles.subtitle}>{error ?? statusText}</Text>
      {phase === "tracking" ? (
        <Text style={styles.helperText}>
          Sesler artık tek seferde değil, dinleme sırasına göre üretiliyor. İstersen hazır içeriklerinle devam et,
          istersen aşağıdan bir bölümü öne al.
        </Text>
      ) : null}

      <View style={styles.progressBlock}>
        <ProgressBar progress={progress} />
        <Text style={styles.progressValue}>%{progress}</Text>
      </View>

      {podcast && partSummary ? (
        <>
          <View style={styles.summaryRow}>
            <View style={styles.summaryChip}>
              <Text style={styles.summaryChipLabel}>Hazır</Text>
              <Text style={styles.summaryChipValue}>{partSummary.readyCount}</Text>
            </View>
            <View style={styles.summaryChip}>
              <Text style={styles.summaryChipLabel}>Oluşturuluyor</Text>
              <Text style={styles.summaryChipValue}>{partSummary.processingCount}</Text>
            </View>
            <View style={styles.summaryChip}>
              <Text style={styles.summaryChipLabel}>Sırada</Text>
              <Text style={styles.summaryChipValue}>{partSummary.queuedCount}</Text>
            </View>
          </View>

          <View style={styles.actionRow}>
            {firstReadyPart ? (
              <PrimaryButton label="Dinlemeye Başla" onPress={() => handleOpenPodcast(firstReadyPart.id)} />
            ) : (
              <PrimaryButton label="Hazır İçeriklere Git" onPress={() => navigation.navigate("MainTabs", { screen: "ListenTab" })} />
            )}
            <Pressable
              style={styles.secondaryButton}
              onPress={() => navigation.navigate("MainTabs", { screen: "ListenTab" })}
            >
              <Text style={styles.secondaryButtonLabel}>Kütüphaneye Dön</Text>
            </Pressable>
          </View>

          <View style={styles.partList}>
            {podcast.parts.map((part, index) => {
              const isReady = part.status === "ready";
              const statusLabel = getPodcastPartStatusLabel(part.status);
              return (
                <View key={part.id} style={styles.partCard}>
                  <View style={styles.partIndex}>
                    <Text style={styles.partIndexText}>{index + 1}</Text>
                  </View>
                  <View style={styles.partBody}>
                    <Text style={styles.partTitle} numberOfLines={1}>
                      {part.title}
                    </Text>
                    <Text style={styles.partStatus}>{statusLabel}</Text>
                  </View>
                  <Pressable
                    style={[styles.partAction, isReady ? styles.partActionReady : styles.partActionQueued]}
                    onPress={() => (isReady ? handleOpenPodcast(part.id) : void handlePrioritizePart(part.id))}
                  >
                    <Text style={styles.partActionLabel}>{isReady ? "Dinle" : "Öne Al"}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      {planningJobId && !podcast ? <Text style={styles.jobMeta}>Plan işi: {planningJobId.slice(0, 8)}</Text> : null}
      {error ? <PrimaryButton label="Yeniden Dene" onPress={() => navigation.replace("Uploading")} /> : null}
    </ScreenContainer>
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function loadPlannedPodcastWithRetry({
  cancelled,
  podcastId,
  refreshPodcast,
}: {
  cancelled: () => boolean;
  podcastId: string;
  refreshPodcast: (podcastId: string) => Promise<Podcast | null>;
}): Promise<Podcast | null> {
  for (let attempt = 0; attempt < PLANNED_PODCAST_FETCH_RETRIES; attempt += 1) {
    const plannedPodcast = await refreshPodcast(podcastId);
    if (plannedPodcast) {
      return plannedPodcast;
    }
    if (cancelled()) {
      return null;
    }
    await sleep(PLANNED_PODCAST_FETCH_RETRY_MS);
  }

  return null;
}

function getJobStatusText(
  status: "queued" | "processing" | "completed" | "failed",
  elapsedSec: number,
  showQueueWarning: boolean
): string {
  if (status === "queued") {
    return showQueueWarning
      ? `Kuyruk yoğun. Bu sırada hazır içeriklerle devam edebilirsin. (${elapsedSec}s)`
      : `Plan sırası bekleniyor... (${elapsedSec}s)`;
  }
  if (status === "processing") {
    return `Bölüm planı hazırlanıyor... (${elapsedSec}s)`;
  }
  if (status === "completed") {
    return "Plan tamamlandı";
  }
  return "Üretim başarısız";
}

function resolveTrackingProgress(podcast: Podcast): number {
  const totalParts = Math.max(podcast.parts.length, 1);
  const summary = getPodcastPartSummary(podcast);
  const weighted = summary.readyCount + summary.processingCount * 0.5;
  return Math.max(45, Math.min(100, Math.round((weighted / totalParts) * 100)));
}

function buildTrackingStatusText(podcast: Podcast): string {
  const summary = getPodcastPartSummary(podcast);
  if (summary.readyCount > 0) {
    return `${summary.readyCount}/${podcast.parts.length} bölüm hazır. İstersen hemen dinlemeye başlayabilirsin.`;
  }
  if (summary.processingCount > 0) {
    return "İlk bölümler oluşturuluyor. Hazır olanlar burada anında görünecek.";
  }
  return "Plan hazır. Dinleme sırasına göre bölümler kuyruğa alındı.";
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
    gap: spacing.md
  },
  logo: {
    width: 240,
    height: 240,
    alignSelf: "center"
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
  helperText: {
    ...typography.caption,
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
  },
  summaryRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  summaryChip: {
    flex: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceNavy,
    gap: spacing.xs
  },
  summaryChipLabel: {
    ...typography.caption,
    color: colors.textSecondary
  },
  summaryChipValue: {
    ...typography.h2,
    color: colors.textPrimary
  },
  actionRow: {
    gap: spacing.sm
  },
  secondaryButton: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center"
  },
  secondaryButtonLabel: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700"
  },
  partList: {
    gap: spacing.sm
  },
  partCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceNavy,
    padding: spacing.md
  },
  partIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.motivationOrange,
    alignItems: "center",
    justifyContent: "center"
  },
  partIndexText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: "700"
  },
  partBody: {
    flex: 1,
    gap: 2
  },
  partTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700"
  },
  partStatus: {
    ...typography.caption,
    color: colors.textSecondary
  },
  partAction: {
    minWidth: 72,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: "center"
  },
  partActionReady: {
    backgroundColor: colors.motivationOrange
  },
  partActionQueued: {
    backgroundColor: "rgba(189,148,101,0.16)"
  },
  partActionLabel: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: "700"
  },
  jobMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center"
  }
});
