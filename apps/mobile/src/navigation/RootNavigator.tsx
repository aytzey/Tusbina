import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { colors } from "@/theme";
import { MainTabNavigator } from "./MainTabNavigator";
import { RootStackParamList } from "./types";
import { CourseDetailScreen } from "@/screens/Courses/CourseDetailScreen";
import { PlayerScreen } from "@/screens/Player/PlayerScreen";
import { UploadStep2Screen } from "@/screens/Upload/UploadStep2Screen";
import { UploadStep3Screen } from "@/screens/Upload/UploadStep3Screen";
import { UploadingScreen } from "@/screens/Upload/UploadingScreen";
import { PremiumScreen } from "@/screens/Premium/PremiumScreen";
import { QuizScreen } from "@/screens/Quiz/QuizScreen";
import { GeneralErrorScreen } from "@/screens/States/GeneralErrorScreen";
import { NoInternetScreen } from "@/screens/States/NoInternetScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="MainTabs"
      screenOptions={{
        headerStyle: { backgroundColor: colors.primaryNavy },
        headerTintColor: colors.textPrimary,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.primaryNavy }
      }}
    >
      <Stack.Screen name="MainTabs" component={MainTabNavigator} options={{ headerShown: false }} />
      <Stack.Screen name="CourseDetail" component={CourseDetailScreen} options={{ title: "Ders Detay" }} />
      <Stack.Screen name="Player" component={PlayerScreen} options={{ title: "Şimdi Dinleniyor" }} />
      <Stack.Screen name="UploadStep2" component={UploadStep2Screen} options={{ title: "Ses ve Format" }} />
      <Stack.Screen name="UploadStep3" component={UploadStep3Screen} options={{ title: "Önizleme" }} />
      <Stack.Screen name="Uploading" component={UploadingScreen} options={{ title: "Hazırlanıyor" }} />
      <Stack.Screen name="Premium" component={PremiumScreen} options={{ title: "Premium" }} />
      <Stack.Screen name="Quiz" component={QuizScreen} options={{ title: "Soru-Cevap" }} />
      <Stack.Screen name="GeneralError" component={GeneralErrorScreen} options={{ title: "Bir Hata Oluştu" }} />
      <Stack.Screen name="NoInternet" component={NoInternetScreen} options={{ title: "Bağlantı Yok" }} />
    </Stack.Navigator>
  );
}
