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
import { ScreenContainer } from "@/components";
import { RootStackParamList } from "@/navigation/types";
import { useAuthStore } from "@/state/stores/authStore";
import { FadeInView, colors, fw, radius, shadows, spacing, typography } from "@/theme";

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function LoginScreen() {
  const navigation = useNavigation<Nav>();
  const signIn = useAuthStore((state) => state.signIn);
  const signInWithGoogle = useAuthStore((state) => state.signInWithGoogle);
  const signInWithApple = useAuthStore((state) => state.signInWithApple);
  const clearError = useAuthStore((state) => state.clearError);
  const isLoading = useAuthStore((state) => state.isLoading);
  const error = useAuthStore((state) => state.error);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length >= 6 && !isLoading;

  const handleLogin = async () => {
    if (!canSubmit) return;
    await signIn(email.trim(), password);
  };

  return (
    <ScreenContainer scroll contentStyle={styles.scrollContent}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.inner}
      >
        {/* ---- Hero Section ---- */}
        <View style={styles.hero}>
          <View style={styles.logoRing}>
            <Image
              source={require("../../../assets/logo.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.brandTitle}>TUSBINA</Text>
          <Text style={styles.brandSubtitle}>Başarının Sesi</Text>
        </View>

        {/* ---- Primary CTA ---- */}
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
          onPress={() => navigation.navigate("Register")}
          disabled={isLoading}
        >
          <Text style={styles.primaryBtnLabel}>Hemen Başla</Text>
        </Pressable>

        {/* ---- Divider ---- */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>veya</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* ---- Social Buttons ---- */}
        {Platform.OS === "ios" ? (
          <Pressable
            disabled={isLoading}
            onPress={signInWithApple}
            style={({ pressed }) => [styles.socialBtn, styles.appleBtn, pressed && styles.btnPressed]}
          >
            <Ionicons name="logo-apple" size={20} color={colors.appleText} />
            <Text style={[styles.socialLabel, styles.appleBtnLabel]}>Apple ile Devam Et</Text>
          </Pressable>
        ) : null}

        <Pressable
          disabled={isLoading}
          onPress={signInWithGoogle}
          style={({ pressed }) => [styles.socialBtn, styles.googleBtn, pressed && styles.btnPressed]}
        >
          <Ionicons name="logo-google" size={18} color={colors.textPrimary} />
          <Text style={styles.socialLabel}>Google ile Devam Et</Text>
        </Pressable>
        <Text style={styles.socialHint}>
          Sosyal giriş cihaz tarayıcısında açılır. Dönüşte oturum otomatik tamamlanır.
        </Text>

        {/* ---- Email Login Toggle ---- */}
        {!showEmailForm ? (
          <Pressable
            onPress={() => {
              clearError();
              setShowEmailForm(true);
            }}
            style={styles.emailToggle}
          >
            <Ionicons name="mail-outline" size={16} color={colors.motivationOrange} />
            <Text style={styles.emailToggleText}>E-posta ile giriş yap</Text>
          </Pressable>
        ) : (
          <FadeInView style={styles.emailForm}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>E-posta</Text>
              <TextInput
                style={styles.input}
                placeholder="E-posta adresiniz"
                placeholderTextColor={colors.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={(value) => {
                  clearError();
                  setEmail(value);
                }}
                editable={!isLoading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Şifre</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  placeholder="Şifre (en az 6 karakter)"
                  placeholderTextColor={colors.textSecondary}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  value={password}
                  onChangeText={(value) => {
                    clearError();
                    setPassword(value);
                  }}
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

            {error ? (
              <FadeInView style={styles.errorCard}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                <Text style={styles.error}>{error}</Text>
              </FadeInView>
            ) : null}

            <Pressable
              disabled={!canSubmit}
              onPress={() => void handleLogin()}
              style={({ pressed }) => [
                styles.loginBtn,
                !canSubmit && styles.btnDisabled,
                pressed && styles.btnPressed,
              ]}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.textPrimary} />
              ) : (
                <Text style={styles.loginBtnLabel}>Giriş Yap</Text>
              )}
            </Pressable>
          </FadeInView>
        )}

        {/* ---- Footer ---- */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Hesabınız yok mu?</Text>
          <Pressable onPress={() => navigation.navigate("Register")}>
            <Text style={styles.footerLink}> Kayıt Ol</Text>
          </Pressable>
        </View>

        <Text style={styles.tagline}>TUS'u Dinle, Başarıyı Yakala.</Text>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flex: 1,
    justifyContent: "center",
  },
  inner: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: "center",
    gap: spacing.md,
  },

  /* ---- Hero ---- */
  hero: {
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingTop: spacing.xl,
  },
  logoRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1.5,
    borderColor: "rgba(212,170,85,0.35)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.goldTint,
    marginBottom: spacing.sm,
  },
  logo: {
    width: 70,
    height: 70,
    borderRadius: 35,
  },
  brandTitle: {
    ...typography.title,
    color: colors.textPrimary,
    letterSpacing: 3,
    fontSize: 32,
  },
  brandSubtitle: {
    ...typography.caption,
    color: colors.motivationOrange,
    letterSpacing: 2,
    ...fw.semiBold,
  },

  /* ---- Primary CTA ---- */
  primaryBtn: {
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.motivationOrange,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.glow(colors.motivationOrange),
  },
  primaryBtnLabel: {
    ...typography.button,
    color: colors.textPrimary,
  },

  /* ---- Divider ---- */
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.divider,
  },
  dividerText: {
    ...typography.caption,
    color: colors.textSecondary,
  },

  /* ---- Social Buttons ---- */
  socialBtn: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.cardBg,
  },
  appleBtn: {
    backgroundColor: colors.appleSurface,
    borderColor: colors.appleSurface,
  },
  appleBtnLabel: {
    color: colors.appleText,
  },
  googleBtn: {
    backgroundColor: colors.cardBg,
  },
  socialLabel: {
    ...typography.body,
    color: colors.textPrimary,
    ...fw.semiBold,
  },
  socialHint: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.xs,
  },

  /* ---- Email Toggle ---- */
  emailToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  emailToggleText: {
    ...typography.body,
    color: colors.motivationOrange,
    ...fw.semiBold,
  },

  /* ---- Email Form ---- */
  emailForm: {
    gap: spacing.md,
  },
  inputGroup: {
    gap: spacing.xs,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    ...fw.semiBold,
  },
  input: {
    height: 52,
    backgroundColor: colors.cardBg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    color: colors.textPrimary,
    ...typography.input,
    borderWidth: 1,
    borderColor: colors.dividerStrong,
  },
  passwordRow: {
    position: "relative",
  },
  passwordInput: {
    paddingRight: 48,
  },
  eyeButton: {
    position: "absolute",
    right: 0,
    top: 0,
    height: 52,
    width: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  error: {
    ...typography.caption,
    color: colors.danger,
    flex: 1,
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(232,91,91,0.25)",
    backgroundColor: colors.dangerTint,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  loginBtn: {
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.motivationOrange,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.glow(colors.motivationOrange),
  },
  loginBtnLabel: {
    ...typography.button,
    color: colors.textPrimary,
  },

  /* ---- Shared ---- */
  btnPressed: {
    opacity: 0.8,
  },
  btnDisabled: {
    opacity: 0.4,
  },

  /* ---- Footer ---- */
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  footerText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  footerLink: {
    ...typography.caption,
    color: colors.motivationOrange,
    ...fw.bold,
  },
  tagline: {
    ...typography.small,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.sm,
  },
});
