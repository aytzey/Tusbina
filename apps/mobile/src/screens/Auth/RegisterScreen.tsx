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

export function RegisterScreen() {
  const navigation = useNavigation<Nav>();
  const signUp = useAuthStore((s) => s.signUp);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);

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
    const ok = await signUp(email.trim(), password, displayName.trim());
    if (ok) {
      // Navigation handled by auth state change in RootNavigator
    }
  };

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.inner}
      >
        {/* Header */}
        <View style={styles.header}>
          <Ionicons name="person-add-outline" size={56} color={colors.motivationOrange} />
          <Text style={styles.title}>Kayit Ol</Text>
          <Text style={styles.subtitle}>Yeni hesap olusturun</Text>
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
});
