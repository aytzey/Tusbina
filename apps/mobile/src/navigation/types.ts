import { NavigatorScreenParams } from "@react-navigation/native";

export type MainTabParamList = {
  CoursesTab: undefined;
  UploadTab: undefined;
  ListenTab: undefined;
  ProfileTab: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  CourseDetail: { courseId: string };
  Player: { trackId?: string; sourceType?: "course" | "ai" } | undefined;
  UploadStep2: undefined;
  UploadStep3: undefined;
  Uploading: undefined;
  Premium: undefined;
  Quiz: { podcastId: string };
  GeneralError: undefined;
  NoInternet: undefined;
};
