import test from "node:test";
import assert from "node:assert/strict";

import {
  shouldAdvanceQueueOnDidJustFinish,
  shouldIgnoreFinishSoonAfterResume,
  shouldResetPlaybackFromStaleEnd,
} from "./audioPlayer.ts";

test("ignores didJustFinish when playback never started for the track", () => {
  assert.equal(
    shouldAdvanceQueueOnDidJustFinish({
      didJustFinish: true,
      durationSec: 24,
      currentTimeSec: 0,
      lastKnownPositionSec: 0,
      startedForTrack: false,
    }),
    false
  );
});

test("ignores stale didJustFinish when the last known position is far from the end", () => {
  assert.equal(
    shouldAdvanceQueueOnDidJustFinish({
      didJustFinish: true,
      durationSec: 24,
      currentTimeSec: 0,
      lastKnownPositionSec: 11,
      startedForTrack: true,
    }),
    false
  );
});

test("accepts didJustFinish when the track really reached the end", () => {
  assert.equal(
    shouldAdvanceQueueOnDidJustFinish({
      didJustFinish: true,
      durationSec: 24,
      currentTimeSec: 24,
      lastKnownPositionSec: 23.8,
      startedForTrack: true,
    }),
    true
  );
});

test("accepts reset currentTime when the last known position was already at the end", () => {
  assert.equal(
    shouldAdvanceQueueOnDidJustFinish({
      didJustFinish: true,
      durationSec: 24,
      currentTimeSec: 0,
      lastKnownPositionSec: 23.9,
      startedForTrack: true,
    }),
    true
  );
});

test("resets resume playback when the player reports a stale end-of-track position", () => {
  assert.equal(
    shouldResetPlaybackFromStaleEnd({
      durationSec: 24,
      currentTimeSec: 24,
      intendedPositionSec: 15,
    }),
    true
  );
});

test("does not reset playback when the intended position is already near the end", () => {
  assert.equal(
    shouldResetPlaybackFromStaleEnd({
      durationSec: 24,
      currentTimeSec: 24,
      intendedPositionSec: 23.7,
    }),
    false
  );
});

test("ignores finish signals that arrive too soon after resuming from the middle", () => {
  assert.equal(
    shouldIgnoreFinishSoonAfterResume({
      durationSec: 24,
      resumePositionSec: 12,
      elapsedSinceResumeMs: 800,
    }),
    true
  );
});

test("does not ignore finish signals when resuming near the end", () => {
  assert.equal(
    shouldIgnoreFinishSoonAfterResume({
      durationSec: 24,
      resumePositionSec: 23.7,
      elapsedSinceResumeMs: 800,
    }),
    false
  );
});
