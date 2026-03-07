import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, typography } from "@/theme";

interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: { rating: number; tags: string[]; text: string }) => Promise<void>;
}

const TAGS: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: "headset-outline", label: "Ses Kalitesi" },
  { icon: "checkmark-circle-outline", label: "Icerik Dogrulugu" },
  { icon: "speedometer-outline", label: "Hiz" },
  { icon: "mic-outline", label: "Telaffuz" },
  { icon: "list-outline", label: "Bolum Sirasi" },
  { icon: "ellipsis-horizontal-outline", label: "Diger" }
];

const RATING_LABELS: Record<number, string> = {
  1: "Kotu",
  2: "Vasat",
  3: "Orta",
  4: "Iyi",
  5: "Harika"
};

export function FeedbackModal({ visible, onClose, onSubmit }: FeedbackModalProps) {
  const [rating, setRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => rating > 0 && !sending, [rating, sending]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]));
  };

  const closeAndReset = () => {
    setRating(0);
    setSelectedTags([]);
    setText("");
    setSending(false);
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      setError("Gondermek icin yildiz puani zorunlu.");
      return;
    }

    setSending(true);
    setError(null);

    try {
      await onSubmit({ rating, tags: selectedTags, text });
      closeAndReset();
    } catch {
      setError("Geri bildirim gonderilemedi.");
      setSending(false);
    }
  };

  const ratingLabel = rating > 0 ? `${rating} / 5 - ${RATING_LABELS[rating]}` : "";

  return (
    <Modal animationType="slide" transparent visible={visible}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Handle bar */}
          <View style={styles.handleBar} />

          {/* Header with title and close button */}
          <View style={styles.header}>
            <Text style={styles.title}>Geri Bildirim</Text>
            <Pressable onPress={closeAndReset} style={styles.closeBtn} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Subtitle */}
          <Text style={styles.subtitle}>
            Bu podcast deneyiminizi nasil degerlendirirsiniz?
          </Text>

          {/* Star rating */}
          <View style={styles.ratingSection}>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((value) => (
                <Pressable key={value} onPress={() => setRating(value)} style={styles.starButton}>
                  <Ionicons
                    name={value <= rating ? "star" : "star-outline"}
                    size={36}
                    color={value <= rating ? colors.premiumGold : colors.textSecondary}
                  />
                </Pressable>
              ))}
            </View>
            {rating > 0 && <Text style={styles.ratingLabel}>{ratingLabel}</Text>}
          </View>

          {/* Tags section */}
          <Text style={styles.sectionTitle}>Neler iyilestirilebilir?</Text>
          <View style={styles.tagsContainer}>
            {TAGS.map(({ icon, label }) => {
              const active = selectedTags.includes(label);
              return (
                <Pressable
                  key={label}
                  style={[styles.tag, active && styles.tagActive]}
                  onPress={() => toggleTag(label)}
                >
                  <Ionicons
                    name={icon}
                    size={14}
                    color={active ? "#FFFFFF" : colors.textSecondary}
                  />
                  <Text style={[styles.tagLabel, active && styles.tagLabelActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Text area */}
          <TextInput
            style={styles.input}
            multiline
            numberOfLines={4}
            placeholder="Detayli geri bildiriminizi yazin..."
            placeholderTextColor={colors.textSecondary}
            value={text}
            onChangeText={setText}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* Submit button */}
          <Pressable
            style={[styles.primary, !canSubmit && styles.disabled]}
            onPress={() => void handleSubmit()}
          >
            <Text style={styles.primaryLabel}>
              {sending ? "Gonderiliyor..." : "Geri Bildirimi Gonder"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
    padding: spacing.lg
  },
  card: {
    backgroundColor: colors.surfaceNavy,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing.xl,
    gap: spacing.md
  },

  /* Handle bar */
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.dividerStrong,
    alignSelf: "center",
    marginBottom: spacing.xs
  },

  /* Header */
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center"
  },

  /* Subtitle */
  subtitle: {
    ...typography.body,
    color: colors.textSecondary
  },

  /* Star rating */
  ratingSection: {
    alignItems: "center",
    gap: spacing.sm
  },
  starsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm
  },
  starButton: {
    padding: spacing.xs
  },
  ratingLabel: {
    ...typography.caption,
    color: colors.premiumGold,
    fontWeight: "700"
  },

  /* Section title */
  sectionTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
    marginTop: spacing.xs
  },

  /* Tags */
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.divider,
    paddingVertical: 8,
    paddingHorizontal: spacing.md
  },
  tagActive: {
    borderColor: colors.motivationOrange,
    backgroundColor: colors.motivationOrange
  },
  tagLabel: {
    ...typography.caption,
    color: colors.textSecondary
  },
  tagLabelActive: {
    color: "#FFFFFF"
  },

  /* Text input */
  input: {
    minHeight: 100,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.cardBg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    textAlignVertical: "top",
    ...typography.body
  },

  /* Error */
  error: {
    ...typography.caption,
    color: colors.danger
  },

  /* Submit button */
  primary: {
    marginTop: spacing.xs,
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: colors.motivationOrange,
    alignItems: "center",
    justifyContent: "center"
  },
  disabled: {
    opacity: 0.45
  },
  primaryLabel: {
    ...typography.button,
    color: "#FFFFFF"
  }
});
