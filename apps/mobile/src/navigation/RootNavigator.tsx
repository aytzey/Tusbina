import { useEffect } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { colors, spacing, typography } from "@/theme";
import { useAuthStore } from "@/state/stores/authStore";
import { MainTabNavigator } from "./MainTabNavigator";
import { RootStackParamList } from "./types";
import { LegalConsentScreen } from "@/screens/Auth/LegalConsentScreen";
import { LoginScreen } from "@/screens/Auth/LoginScreen";
import { RegisterScreen } from "@/screens/Auth/RegisterScreen";
import { CourseDetailScreen } from "@/screens/Courses/CourseDetailScreen";
import { PlayerScreen } from "@/screens/Player/PlayerScreen";
import { UploadStep2Screen } from "@/screens/Upload/UploadStep2Screen";
import { UploadStep3Screen } from "@/screens/Upload/UploadStep3Screen";
import { UploadingScreen } from "@/screens/Upload/UploadingScreen";
import { PremiumScreen } from "@/screens/Premium/PremiumScreen";
import { QuizScreen } from "@/screens/Quiz/QuizScreen";
import { DownloadsScreen } from "@/screens/Profile/DownloadsScreen";
import { StudyToolsScreen } from "@/screens/Profile/StudyToolsScreen";
import { AccountSettingsScreen } from "@/screens/Profile/AccountSettingsScreen";
import { ConsentPreferencesScreen } from "@/screens/Profile/ConsentPreferencesScreen";
import { DeleteAccountScreen } from "@/screens/Profile/DeleteAccountScreen";
import { LegalCenterScreen } from "@/screens/Profile/LegalCenterScreen";
import { LegalDocumentScreen } from "@/screens/Profile/LegalDocumentScreen";
import { NotificationsScreen } from "@/screens/Profile/NotificationsScreen";
import { SupportScreen } from "@/screens/Profile/SupportScreen";
import { GeneralErrorScreen } from "@/screens/States/GeneralErrorScreen";
import { NoInternetScreen } from "@/screens/States/NoInternetScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const requiresLegalAcceptance = useAuthStore((s) => s.requiresLegalAcceptance);
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (isLoading) {
    return (
      <View style={splashStyles.container}>
        <Image
          source={require("../../assets/logo.png")}
          style={splashStyles.logo}
          resizeMode="contain"
        />
        <Text style={splashStyles.brand}>TUSBINA</Text>
        <Text style={splashStyles.tagline}>Başarının Sesi</Text>
        <ActivityIndicator size="small" color={colors.motivationOrange} style={splashStyles.loader} />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primaryNavy },
        headerTintColor: colors.textPrimary,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.primaryNavy }
      }}
    >
      {isAuthenticated && requiresLegalAcceptance ? (
        <>
          <Stack.Screen name="LegalConsent" component={LegalConsentScreen} options={{ title: "Yasal Onay" }} />
          <Stack.Screen
            name="LegalDocument"
            component={LegalDocumentScreen}
            options={({ route }) => ({ title: route.params.title ?? "Yasal Metin" })}
          />
        </>
      ) : isAuthenticated ? (
        <>
          <Stack.Screen name="MainTabs" component={MainTabNavigator} options={{ headerShown: false }} />
          <Stack.Screen name="CourseDetail" component={CourseDetailScreen} options={{ title: "Ders Detay" }} />
          <Stack.Screen name="Player" component={PlayerScreen} options={{ title: "Şimdi Dinleniyor" }} />
          <Stack.Screen name="UploadStep2" component={UploadStep2Screen} options={{ title: "Ses ve Format" }} />
          <Stack.Screen name="UploadStep3" component={UploadStep3Screen} options={{ title: "Önizleme" }} />
          <Stack.Screen name="Uploading" component={UploadingScreen} options={{ title: "Hazırlanıyor" }} />
          <Stack.Screen name="Premium" component={PremiumScreen} options={{ title: "Premium" }} />
          <Stack.Screen name="Quiz" component={QuizScreen} options={{ title: "Soru-Cevap" }} />
          <Stack.Screen name="Downloads" component={DownloadsScreen} options={{ title: "İndirilenler" }} />
          <Stack.Screen name="StudyTools" component={StudyToolsScreen} options={{ title: "Çalışma Araçları" }} />
          <Stack.Screen name="AccountSettings" component={AccountSettingsScreen} options={{ title: "Hesap Ayarları" }} />
          <Stack.Screen name="ConsentPreferences" component={ConsentPreferencesScreen} options={{ title: "Açık Rıza Tercihleri" }} />
          <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} options={{ title: "Hesap Silme" }} />
          <Stack.Screen name="LegalCenter" component={LegalCenterScreen} options={{ title: "Hukuk & Gizlilik" }} />
          <Stack.Screen
            name="LegalDocument"
            component={LegalDocumentScreen}
            options={({ route }) => ({ title: route.params.title ?? "Yasal Metin" })}
          />
          <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: "Bildirimler" }} />
          <Stack.Screen name="Support" component={SupportScreen} options={{ title: "Yardım & Destek" }} />
          <Stack.Screen name="GeneralError" component={GeneralErrorScreen} options={{ title: "Bir Hata Oluştu" }} />
          <Stack.Screen name="NoInternet" component={NoInternetScreen} options={{ title: "Bağlantı Yok" }} />
        </>
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Register" component={RegisterScreen} options={{ headerShown: false }} />
          <Stack.Screen name="LegalCenter" component={LegalCenterScreen} options={{ title: "Hukuk & Gizlilik" }} />
          <Stack.Screen
            name="LegalDocument"
            component={LegalDocumentScreen}
            options={({ route }) => ({ title: route.params.title ?? "Yasal Metin" })}
          />
        </>
      )}
    </Stack.Navigator>
  );
}

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primaryNavy,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  logo: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: spacing.sm,
  },
  brand: {
    ...typography.hero,
    color: colors.textPrimary,
    letterSpacing: 4,
  },
  tagline: {
    ...typography.bodyMedium,
    color: colors.motivationOrange,
    letterSpacing: 1.5,
  },
  loader: {
    marginTop: spacing.xl,
  },
});
