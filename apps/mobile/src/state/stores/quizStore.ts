import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { fetchQuizQuestions, generateQuizQuestions } from "@/services/api";
import { ApiQuizQuestion } from "@/services/api/types";

interface QuizState {
  podcastId: string | null;
  questions: ApiQuizQuestion[];
  index: number;
  answers: Record<string, number>;
  loading: boolean;
  generating: boolean;
  error: string | null;
  loadQuiz: (podcastId: string) => Promise<void>;
  generateQuiz: (podcastId: string, partId?: string) => Promise<void>;
  setIndex: (index: number) => void;
  answerQuestion: (questionId: string, optionIndex: number) => void;
  next: () => void;
  prev: () => void;
  reset: () => void;
}

export const useQuizStore = create<QuizState>()(
  persist(
    (set, get) => ({
      podcastId: null,
      questions: [],
      index: 0,
      answers: {},
      loading: false,
      generating: false,
      error: null,

      loadQuiz: async (podcastId: string) => {
        set({ loading: true, error: null, podcastId });
        try {
          const questions = await fetchQuizQuestions(podcastId);
          set({ questions, loading: false, index: 0, answers: {} });
        } catch {
          set({ questions: [], loading: false, error: "Quiz soruları yüklenemedi." });
        }
      },

      generateQuiz: async (podcastId: string, partId?: string) => {
        set({ generating: true, error: null, podcastId, questions: [], index: 0, answers: {} });
        try {
          const result = await generateQuizQuestions(podcastId, partId);
          set({ questions: result.questions, generating: false, index: 0, answers: {} });
        } catch {
          set({ generating: false, error: "Quiz üretilemedi. Lütfen tekrar deneyin." });
        }
      },

      setIndex: (index) => set({ index: Math.max(0, index) }),

      answerQuestion: (questionId, optionIndex) =>
        set((state) => ({
          answers: { ...state.answers, [questionId]: optionIndex }
        })),

      next: () =>
        set((state) => ({
          index: Math.min(state.index + 1, Math.max(state.questions.length - 1, 0))
        })),

      prev: () =>
        set((state) => ({
          index: Math.max(state.index - 1, 0)
        })),

      reset: () => set({ podcastId: null, questions: [], index: 0, answers: {}, error: null })
    }),
    {
      name: "tusbina-quiz-store",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        podcastId: state.podcastId,
        questions: state.questions,
        index: state.index,
        answers: state.answers
      })
    }
  )
);
