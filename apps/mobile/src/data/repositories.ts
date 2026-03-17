import { Course, Podcast } from "@/domain/models";
import { fetchCourseById, fetchCourses } from "@/services/api/coursesApi";
import { deletePodcastById, fetchPodcastById, fetchPodcasts } from "@/services/api/podcastsApi";

interface CoursesRepository {
  listCourses: () => Promise<Course[]>;
  getCourseById: (courseId: string) => Promise<Course>;
}

interface PodcastsRepository {
  listPodcasts: () => Promise<Podcast[]>;
  getPodcastById: (podcastId: string) => Promise<Podcast>;
  deletePodcastById: (podcastId: string) => Promise<void>;
}

export const coursesRepository: CoursesRepository = {
  listCourses: fetchCourses,
  getCourseById: fetchCourseById
};

export const podcastsRepository: PodcastsRepository = {
  listPodcasts: fetchPodcasts,
  getPodcastById: fetchPodcastById,
  async deletePodcastById(podcastId) {
    await deletePodcastById(podcastId);
  }
};
