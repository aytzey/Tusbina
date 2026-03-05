import { coursesRepository } from "@/data/repositories";
import { Course, CoursePartStatus } from "@/domain/models";
import { create } from "zustand";

interface CoursesState {
  courses: Course[];
  selectedCourse: Course | null;
  loading: boolean;
  error: string | null;
  loadCourses: () => Promise<void>;
  selectCourse: (courseId: string) => Promise<void>;
  replaceCourse: (course: Course) => void;
  patchCoursePartPosition: (courseId: string, partId: string, positionSec: number) => void;
}

function updateCourseProgress(course: Course): Course {
  const completedParts = course.parts.filter((part) => part.lastPositionSec >= part.durationSec).length;
  const progressPct = course.totalParts > 0 ? Math.round((completedParts / course.totalParts) * 100) : 0;
  return {
    ...course,
    progressPct
  };
}

function applyPartPosition(course: Course, partId: string, positionSec: number): Course {
  const parts = course.parts.map((part) => {
    if (part.id !== partId) {
      return part;
    }

    const clamped = Math.min(Math.max(positionSec, 0), part.durationSec);
    const nextStatus: CoursePartStatus =
      clamped >= part.durationSec ? "completed" : clamped > 0 ? "inProgress" : part.status === "locked" ? "locked" : "new";

    return {
      ...part,
      lastPositionSec: clamped,
      status: nextStatus
    };
  });

  return updateCourseProgress({
    ...course,
    parts
  });
}

export const useCoursesStore = create<CoursesState>((set) => ({
  courses: [],
  selectedCourse: null,
  loading: false,
  error: null,
  loadCourses: async () => {
    set({ loading: true, error: null });
    try {
      const courses = await coursesRepository.listCourses();
      set({ courses, loading: false });
    } catch {
      set({ error: "Dersler yüklenemedi.", loading: false });
    }
  },
  selectCourse: async (courseId) => {
    set({ loading: true, error: null });
    try {
      const course = await coursesRepository.getCourseById(courseId);
      set({ selectedCourse: course ?? null, loading: false });
    } catch {
      set({ error: "Ders detayı yüklenemedi.", loading: false });
    }
  },
  replaceCourse: (course) =>
    set((state) => ({
      courses: state.courses.map((item) => (item.id === course.id ? course : item)),
      selectedCourse: state.selectedCourse?.id === course.id ? course : state.selectedCourse
    })),
  patchCoursePartPosition: (courseId, partId, positionSec) =>
    set((state) => ({
      courses: state.courses.map((course) =>
        course.id === courseId ? applyPartPosition(course, partId, positionSec) : course
      ),
      selectedCourse:
        state.selectedCourse && state.selectedCourse.id === courseId
          ? applyPartPosition(state.selectedCourse, partId, positionSec)
          : state.selectedCourse
    }))
}));
