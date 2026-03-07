import { NavigatorScreenParams } from "@react-navigation/native";
import type { LegalDocumentId } from "@/content/legal";

export type MainTabParamList = {
  HomeTab: undefined;
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
  Downloads: undefined;
  StudyTools: undefined;
  AccountSettings: undefined;
  Support: undefined;
  LegalCenter: undefined;
  LegalDocument: { documentId: LegalDocumentId; title?: string };
  ConsentPreferences: undefined;
  LegalConsent: undefined;
  DeleteAccount: undefined;
  GeneralError: undefined;
  NoInternet: undefined;
};
