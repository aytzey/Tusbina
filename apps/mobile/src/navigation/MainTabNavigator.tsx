import { BottomTabBar, createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { MiniPlayerBar } from "@/components/MiniPlayerBar";
import { colors, typography } from "@/theme";
import { MainTabParamList } from "./types";
import { HomeScreen } from "@/screens/Home/HomeScreen";
import { CoursesCatalogScreen } from "@/screens/Courses/CoursesCatalogScreen";
import { UploadStep1Screen } from "@/screens/Upload/UploadStep1Screen";
import { PodcastLibraryScreen } from "@/screens/Listen/PodcastLibraryScreen";
import { ProfileScreen } from "@/screens/Profile/ProfileScreen";

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_ICONS: Record<
  keyof MainTabParamList,
  { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }
> = {
  HomeTab: { active: "home", inactive: "home-outline" },
  CoursesTab: { active: "book", inactive: "book-outline" },
  UploadTab: { active: "cloud-upload", inactive: "cloud-upload-outline" },
  ListenTab: { active: "headset", inactive: "headset-outline" },
  ProfileTab: { active: "person", inactive: "person-outline" },
};

export function MainTabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => (
        <>
          <MiniPlayerBar />
          <BottomTabBar {...props} />
        </>
      )}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surfaceNavy,
          borderTopColor: colors.divider,
          borderTopWidth: 0.5,
          paddingTop: 6,
          paddingBottom: 6,
          height: 62,
        },
        tabBarActiveTintColor: colors.motivationOrange,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: {
          fontSize: typography.tabLabel.fontSize,
          fontWeight: typography.tabLabel.fontWeight,
          letterSpacing: typography.tabLabel.letterSpacing,
        },
        tabBarIcon: ({ color, focused }) => (
          <Ionicons
            name={focused ? TAB_ICONS[route.name].active : TAB_ICONS[route.name].inactive}
            size={22}
            color={color}
          />
        ),
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeScreen} options={{ title: "Ana Sayfa" }} />
      <Tab.Screen name="CoursesTab" component={CoursesCatalogScreen} options={{ title: "Dersler" }} />
      <Tab.Screen name="UploadTab" component={UploadStep1Screen} options={{ title: "Y\u00fckle" }} />
      <Tab.Screen name="ListenTab" component={PodcastLibraryScreen} options={{ title: "Dinle" }} />
      <Tab.Screen name="ProfileTab" component={ProfileScreen} options={{ title: "Profil" }} />
    </Tab.Navigator>
  );
}
