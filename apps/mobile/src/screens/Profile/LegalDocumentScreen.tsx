import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components";
import { RootStackParamList } from "@/navigation/types";
import { fetchLegalDocument, type ApiLegalDocument } from "@/services/api";
import { colors, radius, spacing, typography } from "@/theme";

type Props = NativeStackScreenProps<RootStackParamList, "LegalDocument">;

export function LegalDocumentScreen({ route }: Props) {
  const { documentId } = route.params;
  const [document, setDocument] = useState<ApiLegalDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);

    fetchLegalDocument(documentId)
      .then((nextDocument) => {
        if (!active) {
          return;
        }
        setDocument(nextDocument);
      })
      .catch((nextError: unknown) => {
        if (!active) {
          return;
        }
        setError(nextError instanceof Error ? nextError.message : "Yasal metin yüklenemedi.");
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [documentId]);

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      {isLoading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={colors.motivationOrange} />
          <Text style={styles.stateText}>Yasal metin yükleniyor...</Text>
        </View>
      ) : null}

      {!isLoading && error ? (
        <View style={styles.stateBox}>
          <Ionicons name="alert-circle-outline" size={22} color={colors.danger} />
          <Text style={styles.stateText}>{error}</Text>
        </View>
      ) : null}

      {document ? (
        <>
          <View style={styles.heroCard}>
            <Text style={styles.title}>{document.title}</Text>
            <Text style={styles.meta}>Sürüm {document.version}</Text>
            <Text style={styles.summary}>{document.summary}</Text>
          </View>

          {document.sections.map((section) => (
            <View key={section.heading} style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{section.heading}</Text>
              {section.paragraphs.map((paragraph, index) => (
                <Text key={`${section.heading}-p-${index}`} style={styles.paragraph}>
                  {paragraph}
                </Text>
              ))}
              {section.bullets.map((bullet, index) => (
                <View key={`${section.heading}-b-${index}`} style={styles.bulletRow}>
                  <Text style={styles.bulletMark}>•</Text>
                  <Text style={styles.bulletText}>{bullet}</Text>
                </View>
              ))}
            </View>
          ))}
        </>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  heroCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  meta: {
    ...typography.caption,
    color: colors.motivationOrange,
    textTransform: "uppercase",
  },
  summary: {
    ...typography.body,
    color: colors.textSecondary,
  },
  sectionCard: {
    borderRadius: radius.md,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  paragraph: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  bulletMark: {
    ...typography.body,
    color: colors.motivationOrange,
  },
  bulletText: {
    flex: 1,
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  stateBox: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  stateText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
