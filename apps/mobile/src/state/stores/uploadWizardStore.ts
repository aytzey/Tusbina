import { PodcastFormat, UploadFileItem } from "@/domain/models";
import { create } from "zustand";

interface UploadSection {
  id: string;
  title: string;
  enabled: boolean;
  sourceFileLocalId?: string;
}

interface UploadWizardState {
  files: UploadFileItem[];
  uploadedFileIds: string[];
  voice: string | null;
  format: PodcastFormat | null;
  podcastName: string;
  sections: UploadSection[];
  addFiles: (files: UploadFileItem[]) => void;
  removeFile: (localId: string) => void;
  setUploadedFileIds: (ids: string[]) => void;
  setVoice: (voice: string) => void;
  setFormat: (format: PodcastFormat) => void;
  setPodcastName: (name: string) => void;
  setSectionTitle: (id: string, title: string) => void;
  toggleSection: (id: string) => void;
  moveSectionUp: (id: string) => void;
  moveSectionDown: (id: string) => void;
  resetWizard: () => void;
}

const initialSections: UploadSection[] = [];

function swap<T>(items: T[], currentIndex: number, targetIndex: number): T[] {
  const clone = [...items];
  const [item] = clone.splice(currentIndex, 1);
  clone.splice(targetIndex, 0, item);
  return clone;
}

function titleFromFilename(name: string): string {
  const withoutExtension = name.replace(/\.[^/.]+$/, "");
  return withoutExtension.trim() || "Yeni Bolum";
}

export const useUploadWizardStore = create<UploadWizardState>((set) => ({
  files: [],
  uploadedFileIds: [],
  voice: "Elif",
  format: null,
  podcastName: "",
  sections: initialSections,
  addFiles: (newFiles) =>
    set((state) => {
      const unique = [...state.files];
      const sections = [...state.sections];
      for (const file of newFiles) {
        if (!unique.find((item) => item.uri === file.uri)) {
          unique.push(file);
          sections.push({
            id: `file-${file.localId}`,
            title: titleFromFilename(file.name),
            enabled: true,
            sourceFileLocalId: file.localId
          });
        }
      }
      const podcastName =
        state.podcastName ||
        (unique.length === 1
          ? titleFromFilename(unique[0].name)
          : `${titleFromFilename(unique[0].name)} ve ${unique.length - 1} dosya`);
      return { files: unique, sections, podcastName };
    }),
  removeFile: (localId) =>
    set((state) => ({
      files: state.files.filter((file) => file.localId !== localId),
      sections: state.sections.filter((section) => section.sourceFileLocalId !== localId)
    })),
  setUploadedFileIds: (uploadedFileIds) => set({ uploadedFileIds }),
  setVoice: (voice) => set({ voice }),
  setFormat: (format) => set({ format }),
  setPodcastName: (podcastName) => set({ podcastName }),
  setSectionTitle: (id, title) =>
    set((state) => ({
      sections: state.sections.map((section) => (section.id === id ? { ...section, title } : section))
    })),
  toggleSection: (id) =>
    set((state) => ({
      sections: state.sections.map((section) =>
        section.id === id ? { ...section, enabled: !section.enabled } : section
      )
    })),
  moveSectionUp: (id) =>
    set((state) => {
      const currentIndex = state.sections.findIndex((section) => section.id === id);
      if (currentIndex <= 0) {
        return state;
      }
      return { sections: swap(state.sections, currentIndex, currentIndex - 1) };
    }),
  moveSectionDown: (id) =>
    set((state) => {
      const currentIndex = state.sections.findIndex((section) => section.id === id);
      if (currentIndex < 0 || currentIndex >= state.sections.length - 1) {
        return state;
      }
      return { sections: swap(state.sections, currentIndex, currentIndex + 1) };
    }),
  resetWizard: () =>
    set({
      files: [],
      uploadedFileIds: [],
      voice: "Elif",
      format: null,
      podcastName: "",
      sections: initialSections
    })
}));
