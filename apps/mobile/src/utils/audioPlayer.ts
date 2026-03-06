export function isReleasedSharedObjectError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("NativeSharedObjectNotFoundException") ||
    error.message.includes("Unable to find the native shared object associated with given JavaScript object")
  );
}

export function safeAudioPlayerCall(action: () => void): boolean {
  try {
    action();
    return true;
  } catch (error) {
    if (isReleasedSharedObjectError(error)) {
      return false;
    }
    throw error;
  }
}

export async function safeAudioPlayerAsyncCall<T>(action: () => Promise<T>): Promise<T | undefined> {
  try {
    return await action();
  } catch (error) {
    if (isReleasedSharedObjectError(error)) {
      return undefined;
    }
    throw error;
  }
}

export function shouldAdvanceQueueOnDidJustFinish({
  didJustFinish,
  durationSec,
  currentTimeSec,
  lastKnownPositionSec,
  startedForTrack,
}: {
  didJustFinish: boolean;
  durationSec: number;
  currentTimeSec: number;
  lastKnownPositionSec: number;
  startedForTrack: boolean;
}): boolean {
  if (!didJustFinish || !startedForTrack) {
    return false;
  }

  const currentTime = Number.isFinite(currentTimeSec) ? Math.max(currentTimeSec, 0) : 0;
  const lastKnownPosition = Number.isFinite(lastKnownPositionSec) ? Math.max(lastKnownPositionSec, 0) : 0;
  const duration = Number.isFinite(durationSec) ? Math.max(durationSec, 0) : 0;

  if (duration <= 0) {
    return currentTime > 0.25 || lastKnownPosition > 0.25;
  }

  const finishThreshold = Math.max(duration - 0.5, duration * 0.8);
  return currentTime >= finishThreshold || lastKnownPosition >= finishThreshold;
}

export function shouldResetPlaybackFromStaleEnd({
  durationSec,
  currentTimeSec,
  intendedPositionSec,
}: {
  durationSec: number;
  currentTimeSec: number;
  intendedPositionSec: number;
}): boolean {
  const duration = Number.isFinite(durationSec) ? Math.max(durationSec, 0) : 0;
  const currentTime = Number.isFinite(currentTimeSec) ? Math.max(currentTimeSec, 0) : 0;
  const intendedPosition = Number.isFinite(intendedPositionSec) ? Math.max(intendedPositionSec, 0) : 0;

  if (duration <= 0) {
    return false;
  }

  const nearEndThreshold = Math.max(duration - 0.5, duration * 0.8);
  const intendedFarFromEnd = intendedPosition < Math.max(duration - 0.75, 0.5);
  return currentTime >= nearEndThreshold && intendedFarFromEnd;
}

export function shouldIgnoreFinishSoonAfterResume({
  durationSec,
  resumePositionSec,
  elapsedSinceResumeMs,
}: {
  durationSec: number;
  resumePositionSec: number;
  elapsedSinceResumeMs: number;
}): boolean {
  const duration = Number.isFinite(durationSec) ? Math.max(durationSec, 0) : 0;
  const resumePosition = Number.isFinite(resumePositionSec) ? Math.max(resumePositionSec, 0) : 0;
  const elapsedMs = Number.isFinite(elapsedSinceResumeMs) ? Math.max(elapsedSinceResumeMs, 0) : Number.POSITIVE_INFINITY;

  if (duration <= 0) {
    return false;
  }

  const resumedFarFromEnd = resumePosition < Math.max(duration - 0.75, 0.5);
  return resumedFarFromEnd && elapsedMs < 1500;
}
