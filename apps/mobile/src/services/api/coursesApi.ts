import { apiRequest } from "./httpClient";
import { mapApiCourse } from "./mappers";
import { ApiCourse } from "./types";
import { Course } from "@/domain/models";

export async function fetchCourses(): Promise<Course[]> {
  const payload = await apiRequest<ApiCourse[]>("/courses", { method: "GET" });
  return payload.map(mapApiCourse);
}

export async function fetchCourseById(courseId: string): Promise<Course> {
  const payload = await apiRequest<ApiCourse>(`/courses/${courseId}`, { method: "GET" });
  return mapApiCourse(payload);
}

export async function patchCoursePartPosition(
  courseId: string,
  partId: string,
  lastPositionSec: number
): Promise<Course> {
  const payload = await apiRequest<ApiCourse>(`/courses/${courseId}/parts/${partId}/position`, {
    method: "PUT",
    body: JSON.stringify({ last_position_sec: Math.max(0, Math.floor(lastPositionSec)) })
  });
  return mapApiCourse(payload);
}
