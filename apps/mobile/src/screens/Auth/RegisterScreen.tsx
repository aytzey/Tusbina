import { useState } from "react";
import {
  ActivityIndicator,
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

export function RegisterScreen() {
  const navigation = useNavigation<Nav>();
  const signUp = useAuthStore((s) => s.signUp);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const signInWithApple = useAuthStore((s) => s.signInWithApple);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);
  const confirmationPending = useAuthStore((s) => s.confirmationPending);

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const canSubmit =
    displayName.trim().length >= 2 &&
    email.trim().length > 0 &&
    password.length >= 6 &&
    !isLoading;

  const handleRegister = async () => {
    if (!canSubmit) return;
    await signUp(email.trim(), password, displayName.trim());
  };

  if (confirmationPending) {
    return (
      <ScreenContainer scroll contentStyle={styles.container}>
        <View style={styles.confirmationBox}>
          <Ionicons name="mail-outline" size={64} color={colors.motivationOrange} />
          <Text style={styles.confirmTitle}>E-postanizi kontrol edin</Text>
          <Text style={styles.confirmText}>
            {email} adresine bir onay baglantisi gonderdik. Hesabinizi aktif etmek icin e-postadaki baglantiya tiklayin.
          </Text>
          <Pressable
            onPress={() => navigation.navigate("Login")}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            <Text style={styles.buttonLabel}>Giris Sayfasina Don</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.inner}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Kayit Ol</Text>
          <Text style={styles.subtitle}>Yeni hesap olusturun</Text>
        </View>

        {/* Social login */}
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

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>veya</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Form */}
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Isim</Text>
            <TextInput
              style={styles.input}
              placeholder="Adiniz"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="words"
              value={displayName}
              onChangeText={setDisplayName}
              editable={!isLoading}
            />
          </View>

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
            <Text style={styles.label}>Sifre</Text>
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
              <Pressable
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={colors.textSecondary}
                />
              </Pressable>
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            disabled={!canSubmit}
            onPress={handleRegister}
            style={({ pressed }) => [
              styles.button,
              !canSubmit && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.textPrimary} />
            ) : (
              <Text style={styles.buttonLabel}>Kayit Ol</Text>
            )}
          </Pressable>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Zaten hesabiniz var mi?</Text>
          <Pressable onPress={() => navigation.navigate("Login")}>
            <Text style={styles.footerLink}> Giris Yap</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center" },
  inner: { flex: 1, paddingHorizontal: spacing.lg, justifyContent: "center", gap: spacing.xl },
  header: { alignItems: "center", gap: spacing.sm },
  title: { ...typography.title, color: colors.textPrimary, fontSize: 28 },
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
  dividerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.divider },
  dividerText: { ...typography.caption, color: colors.textSecondary },
  form: { gap: spacing.lg },
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
  error: { ...typography.caption, color: colors.danger, textAlign: "center" },
  button: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.motivationOrange,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonPressed: { opacity: 0.8 },
  buttonLabel: { ...typography.button, color: colors.textPrimary },
  footer: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  footerText: { ...typography.body, color: colors.textSecondary },
  footerLink: { ...typography.body, color: colors.motivationOrange, fontWeight: "700" },
  confirmationBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  confirmTitle: { ...typography.h2, color: colors.textPrimary, textAlign: "center" },
  confirmText: { ...typography.body, color: colors.textSecondary, textAlign: "center", lineHeight: 24 },
});
