import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { LEGAL_DOCUMENT_LINKS } from "@/content/legal";
import { ScreenContainer } from "@/components";
import { RootStackParamList } from "@/navigation/types";
import { useAuthStore } from "@/state/stores/authStore";
import { colors, radius, spacing, typography } from "@/theme";

type Nav = NativeStackNavigationProp<RootStackParamList>;

function SocialButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.socialButton,
        disabled && styles.buttonDisabled,
        pressed && styles.buttonPressed,
      ]}
    >
      <Ionicons name={icon} size={20} color={colors.textPrimary} />
      <Text style={styles.socialLabel}>{label}</Text>
    </Pressable>
  );
}

export function LoginScreen() {
  const navigation = useNavigation<Nav>();
  const signIn = useAuthStore((state) => state.signIn);
  const signInWithGoogle = useAuthStore((state) => state.signInWithGoogle);
  const signInWithApple = useAuthStore((state) => state.signInWithApple);
  const isLoading = useAuthStore((state) => state.isLoading);
  const error = useAuthStore((state) => state.error);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length >= 6 && !isLoading;

  const handleLogin = async () => {
    if (!canSubmit) {
      return;
    }
    await signIn(email.trim(), password);
  };

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.inner}
      >
        <View style={styles.header}>
          <Image source={require("../../../assets/logo.png")} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>TUSBINA</Text>
          <Text style={styles.subtitle}>Hesabınıza giriş yapın</Text>
        </View>

        <View style={styles.socialRow}>
          <SocialButton
            icon="logo-google"
            label="Google"
            onPress={signInWithGoogle}
            disabled={isLoading}
          />
          {Platform.OS === "ios" ? (
            <SocialButton
              icon="logo-apple"
              label="Apple"
              onPress={signInWithApple}
              disabled={isLoading}
            />
          ) : null}
        </View>

        <Text style={styles.helperText}>
          Sosyal girişte gerekli yasal onaylar eksikse uygulama seni önce onay ekranına yönlendirir.
        </Text>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>veya</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>E-posta</Text>
            <TextInput
              style={styles.input}
              placeholder="ornek@email.com"
              placeholderTextColor={colors.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
              editable={!isLoading}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Şifre</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder="En az 6 karakter"
                placeholderTextColor={colors.textSecondary}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                value={password}
                onChangeText={setPassword}
                editable={!isLoading}
              />
              <Pressable style={styles.eyeButton} onPress={() => setShowPassword(!showPassword)}>
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={colors.textSecondary}
                />
              </Pressable>
            </View>
          </View>

          <View style={styles.legalCard}>
            <Text style={styles.legalTitle}>Yasal metinlere hızlı erişim</Text>
            <View style={styles.linkWrap}>
              {LEGAL_DOCUMENT_LINKS.slice(0, 3).map((item) => (
                <Pressable
                  key={item.id}
                  style={styles.linkChip}
                  onPress={() => navigation.navigate("LegalDocument", { documentId: item.id, title: item.title })}
                >
                  <Text style={styles.linkChipText}>{item.title}</Text>
                </Pressable>
              ))}
              <Pressable style={styles.linkChip} onPress={() => navigation.navigate("LegalCenter")}>
                <Text style={styles.linkChipText}>Tüm Metinler</Text>
              </Pressable>
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            disabled={!canSubmit}
            onPress={() => void handleLogin()}
            style={({ pressed }) => [
              styles.button,
              !canSubmit && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.textPrimary} />
            ) : (
              <Text style={styles.buttonLabel}>Giriş Yap</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Hesabınız yok mu?</Text>
          <Pressable onPress={() => navigation.navigate("Register")}>
            <Text style={styles.footerLink}> Kayıt Ol</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center" },
  inner: { flex: 1, paddingHorizontal: spacing.lg, justifyContent: "center", gap: spacing.lg },
  header: { alignItems: "center", gap: spacing.sm },
  logo: { width: 150, height: 100 },
  title: { ...typography.title, color: colors.textPrimary, fontSize: 32 },
  subtitle: { ...typography.body, color: colors.textSecondary },
  socialRow: { flexDirection: "row", gap: spacing.md, justifyContent: "center" },
  socialButton: {
    flex: 1,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceNavy,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  socialLabel: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  helperText: { ...typography.caption, color: colors.textSecondary, textAlign: "center" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.divider },
  dividerText: { ...typography.caption, color: colors.textSecondary },
  form: { gap: spacing.md },
  inputGroup: { gap: spacing.xs },
  label: { ...typography.caption, color: colors.textSecondary, textTransform: "uppercase" },
  input: {
    height: 48,
    backgroundColor: colors.surfaceNavy,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    color: colors.textPrimary,
    ...typography.body,
  },
  passwordRow: { position: "relative" },
  passwordInput: { paddingRight: 48 },
  eyeButton: {
    position: "absolute",
    right: 0,
    top: 0,
    height: 48,
    width: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  legalCard: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceNavy,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing.md,
    gap: spacing.sm,
  },
  legalTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  linkWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  linkChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  linkChipText: {
    ...typography.caption,
    color: colors.textPrimary,
  },
  error: { ...typography.caption, color: colors.danger, textAlign: "center" },
  button: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.motivationOrange,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonPressed: { opacity: 0.8 },
  buttonLabel: { ...typography.button, color: colors.textPrimary },
  footer: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  footerText: { ...typography.body, color: colors.textSecondary },
  footerLink: { ...typography.body, color: colors.motivationOrange, fontWeight: "700" },
});
