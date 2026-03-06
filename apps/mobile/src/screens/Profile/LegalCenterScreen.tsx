import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components";
import { RootStackParamList } from "@/navigation/types";
import { fetchLegalDocuments, type ApiLegalDocumentSummary } from "@/services/api";
import { useAuthStore } from "@/state/stores";
import { colors, radius, spacing, typography } from "@/theme";

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export function LegalCenterScreen() {
  const navigation = useNavigation<Navigation>();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [documents, setDocuments] = useState<ApiLegalDocumentSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchLegalDocuments()
      .then((items) => {
        if (active) {
          setDocuments(items);
        }
      })
      .catch((nextError: unknown) => {
        if (active) {
          setError(nextError instanceof Error ? nextError.message : "Yasal metinler alınamadı.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      <Text style={styles.title}>Hukuk & Gizlilik</Text>
      <Text style={styles.subtitle}>
        Gizlilik, KVKK, kullanım koşulları ve hesap silme mekanizması bu alanda toplanır.
      </Text>

      {isAuthenticated ? (
        <View style={styles.actionsCard}>
          <ActionRow
            icon="options-outline"
            title="Açık Rıza Tercihleri"
            description="İletişim izni ve mevcut onay durumu"
            onPress={() => navigation.navigate("ConsentPreferences")}
          />
          <ActionRow
            icon="trash-outline"
            title="Hesabı Kalıcı Olarak Sil"
            description="Google Play uyumlu uygulama içi hesap silme akışı"
            onPress={() => navigation.navigate("DeleteAccount")}
            danger
          />
        </View>
      ) : null}

      {documents.map((document) => (
        <ActionRow
          key={document.slug}
          icon={document.requires_acceptance ? "document-text-outline" : "shield-checkmark-outline"}
          title={document.title}
          description={document.summary}
          onPress={() =>
            navigation.navigate("LegalDocument", {
              documentId: document.slug,
              title: document.title,
            })
          }
        />
      ))}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScreenContainer>
  );
}

function ActionRow({
  icon,
  title,
  description,
  onPress,
  danger = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={[styles.iconWrap, danger && styles.iconWrapDanger]}>
        <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.motivationOrange} />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, danger && styles.rowTitleDanger]}>{title}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  actionsCard: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceNavy,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(191,95,62,0.14)",
  },
  iconWrapDanger: {
    backgroundColor: "rgba(214,69,69,0.14)",
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  rowTitleDanger: {
    color: colors.danger,
  },
  rowDescription: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
});
