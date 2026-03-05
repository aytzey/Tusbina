import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme";
import { MainTabParamList } from "./types";
import { CoursesCatalogScreen } from "@/screens/Courses/CoursesCatalogScreen";
import { UploadStep1Screen } from "@/screens/Upload/UploadStep1Screen";
import { PodcastLibraryScreen } from "@/screens/Listen/PodcastLibraryScreen";
import { ProfileScreen } from "@/screens/Profile/ProfileScreen";

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surfaceNavy,
          borderTopColor: "rgba(255,255,255,0.08)"
        },
        tabBarActiveTintColor: colors.motivationOrange,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarIcon: ({ color, size }) => {
          const iconName =
            route.name === "CoursesTab"
              ? "book"
              : route.name === "UploadTab"
                ? "cloud-upload"
                : route.name === "ListenTab"
                  ? "headset"
                  : "person";

          return <Ionicons name={iconName} size={size} color={color} />;
        }
      })}
    >
      <Tab.Screen name="CoursesTab" component={CoursesCatalogScreen} options={{ title: "Dersler" }} />
      <Tab.Screen name="UploadTab" component={UploadStep1Screen} options={{ title: "Yükle" }} />
      <Tab.Screen name="ListenTab" component={PodcastLibraryScreen} options={{ title: "Dinle" }} />
      <Tab.Screen name="ProfileTab" component={ProfileScreen} options={{ title: "Profil" }} />
    </Tab.Navigator>
  );
}
