import { useEffect, useState } from "react";
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

export function RegisterScreen() {
  const navigation = useNavigation<Nav>();
  const signUp = useAuthStore((state) => state.signUp);
  const signInWithGoogle = useAuthStore((state) => state.signInWithGoogle);
  const signInWithApple = useAuthStore((state) => state.signInWithApple);
  const isLoading = useAuthStore((state) => state.isLoading);
  const error = useAuthStore((state) => state.error);
  const confirmationPending = useAuthStore((state) => state.confirmationPending);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedRequired, setAcceptedRequired] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  useEffect(() => {
    if (confirmationPending && isAuthenticated) {
      navigation.reset({ index: 0, routes: [{ name: "Login" }] });
    }
  }, [confirmationPending, isAuthenticated, navigation]);

  const canSubmit =
    displayName.trim().length >= 2 &&
    email.trim().length > 0 &&
    password.length >= 6 &&
    acceptedRequired &&
    !isLoading;

  const handleRegister = async () => {
    if (!canSubmit) {
      return;
    }
    await signUp(email.trim(), password, displayName.trim(), marketingOptIn);
  };

  if (confirmationPending) {
    return (
      <ScreenContainer scroll contentStyle={styles.container}>
        <View style={styles.confirmationBox}>
          <View style={styles.confirmIconWrap}>
            <Ionicons name="mail-outline" size={48} color={colors.motivationOrange} />
          </View>
          <Text style={styles.confirmTitle}>E-postanızı kontrol edin</Text>
          <Text style={styles.confirmText}>
            {email} adresine bir onay bağlantısı gönderdik. Hesabını aktif etmek için e-postadaki bağlantıya tıkla.
          </Text>
          <Text style={styles.confirmHint}>
            Onayladıktan sonra aşağıdaki butona basarak giriş yapabilirsiniz.
          </Text>
          <Pressable
            onPress={() => navigation.navigate("Login")}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            <Text style={styles.buttonLabel}>Giriş Sayfasına Dön</Text>
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
        <View style={styles.header}>
          <Image source={require("../../../assets/logo.png")} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>Kayıt Ol</Text>
          <Text style={styles.subtitle}>Yeni hesabını oluştur</Text>
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
          Google veya Apple ile devam edersen zorunlu yasal onay ekranı ilk oturumda ayrıca gösterilir.
        </Text>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>veya</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>İsim</Text>
            <TextInput
              style={styles.input}
              placeholder="Adınız"
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
            <Text style={styles.legalTitle}>Yasal metinler</Text>
            <View style={styles.linkWrap}>
              {LEGAL_DOCUMENT_LINKS.filter((item) => item.required).map((item) => (
                <Pressable
                  key={item.id}
                  style={styles.linkChip}
                  onPress={() => navigation.navigate("LegalDocument", { documentId: item.id, title: item.title })}
                >
                  <Text style={styles.linkChipText}>{item.title}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable style={styles.checkboxRow} onPress={() => setAcceptedRequired((value) => !value)}>
              <Ionicons
                name={acceptedRequired ? "checkbox" : "square-outline"}
                size={22}
                color={acceptedRequired ? colors.motivationOrange : colors.textSecondary}
              />
              <Text style={styles.checkboxText}>
                Gizlilik Politikası, Kullanım Koşulları ve KVKK Aydınlatma Metni&apos;ni okudum; kabul ediyorum.
              </Text>
            </Pressable>

            <Pressable style={styles.checkboxRow} onPress={() => setMarketingOptIn((value) => !value)}>
              <Ionicons
                name={marketingOptIn ? "checkbox" : "square-outline"}
                size={22}
                color={marketingOptIn ? colors.motivationOrange : colors.textSecondary}
              />
              <Text style={styles.checkboxText}>
                Ürün güncellemeleri ve eğitim bilgilendirmeleri için benimle iletişime geçilmesini kabul ediyorum.
              </Text>
            </Pressable>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            disabled={!canSubmit}
            onPress={() => void handleRegister()}
            style={({ pressed }) => [
              styles.button,
              !canSubmit && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.textPrimary} />
            ) : (
              <Text style={styles.buttonLabel}>Kayıt Ol</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Zaten hesabın var mı?</Text>
          <Pressable onPress={() => navigation.navigate("Login")}>
            <Text style={styles.footerLink}> Giriş Yap</Text>
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
    backgroundColor: colors.cardBg,
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
    backgroundColor: colors.cardBg,
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
    backgroundColor: colors.cardBg,
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
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  checkboxText: {
    flex: 1,
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  error: { ...typography.caption, color: colors.danger, textAlign: "center" },
  button: {
    height: 52,
    borderRadius: radius.pill,
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
  confirmationBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  confirmIconWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.orangeTint,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmTitle: { ...typography.title, color: colors.textPrimary, textAlign: "center" },
  confirmText: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  confirmHint: { ...typography.caption, color: colors.motivationOrange, textAlign: "center", fontWeight: "600" },
});
