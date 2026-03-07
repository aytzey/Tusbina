import { PodcastFormat, UploadFileItem } from "@/domain/models";
import { create } from "zustand";

interface UploadWizardState {
  files: UploadFileItem[];
  coverImage: UploadFileItem | null;
  uploadedFileIds: string[];
  voice: string | null;
  format: PodcastFormat | null;
  podcastName: string;
  courseId: string | null;
  addFiles: (files: UploadFileItem[]) => void;
  removeFile: (localId: string) => void;
  setCoverImage: (file: UploadFileItem | null) => void;
  setUploadedFileIds: (ids: string[]) => void;
  setVoice: (voice: string) => void;
  setFormat: (format: PodcastFormat) => void;
  setPodcastName: (name: string) => void;
  setCourseId: (courseId: string | null) => void;
  resetWizard: () => void;
}

function titleFromFilename(name: string): string {
  const withoutExtension = name.replace(/\.[^/.]+$/, "");
  return withoutExtension.trim() || "Yeni Podcast";
}

export const useUploadWizardStore = create<UploadWizardState>((set) => ({
  files: [],
  coverImage: null,
  uploadedFileIds: [],
  voice: "Elif",
  format: null,
  podcastName: "",
  courseId: null,
  addFiles: (newFiles) =>
    set((state) => {
      const unique = [...state.files];
      for (const file of newFiles) {
        if (!unique.find((item) => item.uri === file.uri)) {
          unique.push({ ...file, kind: "document" });
        }
      }

      const podcastName =
        state.podcastName ||
        (unique.length === 1
          ? titleFromFilename(unique[0].name)
          : unique.length > 1
            ? `${titleFromFilename(unique[0].name)} ve ${unique.length - 1} belge`
            : "");

      return { files: unique, podcastName };
    }),
  removeFile: (localId) =>
    set((state) => ({
      files: state.files.filter((file) => file.localId !== localId),
    })),
  setCoverImage: (coverImage) => set({ coverImage }),
  setUploadedFileIds: (uploadedFileIds) => set({ uploadedFileIds }),
  setVoice: (voice) => set({ voice }),
  setFormat: (format) => set({ format }),
  setPodcastName: (podcastName) => set({ podcastName }),
  setCourseId: (courseId) => set({ courseId }),
  resetWizard: () =>
    set({
      files: [],
      coverImage: null,
      uploadedFileIds: [],
      voice: "Elif",
      format: null,
      podcastName: "",
      courseId: null,
    }),
}));
