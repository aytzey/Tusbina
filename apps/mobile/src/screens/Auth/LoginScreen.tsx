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
import { colors, radius, shadows, spacing, typography } from "@/theme";

type Nav = NativeStackNavigationProp<RootStackParamList>;

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
            <Ionicons name="logo-apple" size={20} color="#1D1D1F" />
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

        {/* ---- Email Login Toggle ---- */}
        {!showEmailForm ? (
          <Pressable onPress={() => setShowEmailForm(true)} style={styles.emailToggle}>
            <Ionicons name="mail-outline" size={16} color={colors.motivationOrange} />
            <Text style={styles.emailToggleText}>E-posta ile giriş yap</Text>
          </Pressable>
        ) : (
          <View style={styles.emailForm}>
            <View style={styles.inputGroup}>
              <TextInput
                style={styles.input}
                placeholder="E-posta adresiniz"
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
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  placeholder="Şifre (en az 6 karakter)"
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
          </View>
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
    gap: spacing.lg,
  },

  /* ---- Hero ---- */
  hero: {
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  logoRing: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 2,
    borderColor: colors.premiumGold,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(189,148,101,0.06)",
    marginBottom: spacing.sm,
    shadowColor: colors.premiumGold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 6,
  },
  logo: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  brandTitle: {
    ...typography.hero,
    color: colors.textPrimary,
    letterSpacing: 4,
  },
  brandSubtitle: {
    ...typography.bodyMedium,
    color: colors.motivationOrange,
    letterSpacing: 1.5,
  },

  /* ---- Primary CTA ---- */
  primaryBtn: {
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: colors.motivationOrange,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.subtle,
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
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.dividerStrong,
  },
  appleBtn: {
    backgroundColor: "#F5F5F7",
    borderColor: "#F5F5F7",
  },
  appleBtnLabel: {
    color: "#1D1D1F",
  },
  googleBtn: {
    backgroundColor: colors.cardBg,
  },
  socialLabel: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "600",
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
    fontWeight: "600",
  },

  /* ---- Email Form ---- */
  emailForm: {
    gap: spacing.md,
  },
  inputGroup: {
    gap: spacing.xs,
  },
  input: {
    height: 52,
    backgroundColor: colors.cardBg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    color: colors.textPrimary,
    ...typography.body,
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
    textAlign: "center",
  },
  loginBtn: {
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: colors.motivationOrange,
    alignItems: "center",
    justifyContent: "center",
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
    fontWeight: "700",
  },
  tagline: {
    ...typography.small,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.sm,
  },
});
