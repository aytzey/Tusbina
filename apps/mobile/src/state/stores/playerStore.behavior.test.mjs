import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { usePlayerStore } from "./playerStore.ts";

function makeTrack(id, overrides = {}) {
  const durationSec = overrides.durationSec ?? 120;
  const audioUrl = overrides.audioUrl;

  return {
    id,
    title: `Track ${id}`,
    subtitle: "Streaming test",
    durationSec,
    absoluteOffsetSec: overrides.absoluteOffsetSec ?? 0,
    sourceType: "ai",
    audioUrl,
    remoteAudioUrl: overrides.remoteAudioUrl ?? audioUrl,
    parentId: overrides.parentId ?? "pod-streaming",
    partStatus: overrides.partStatus ?? "ready",
    voice: "Elif",
    coverImageUrl: "https://example.com/cover.png",
  };
}

function resetPlayerStore() {
  usePlayerStore.setState({
    queue: [],
    queueIndex: 0,
    bookmarksByTrack: {},
    activeTrack: null,
    isPlaying: false,
    isPlaybackActive: false,
    positionSec: 0,
    pendingSeekSec: null,
    playbackDurationSec: 0,
    isBuffering: false,
    isLoaded: false,
    rate: 1,
  });
}

beforeEach(() => {
  resetPlayerStore();
});

test("keeps playback intent when moving to the next and previous ready parts", () => {
  const first = makeTrack("part-1", { absoluteOffsetSec: 0, durationSec: 90, audioUrl: "https://a/1.wav" });
  const second = makeTrack("part-2", { absoluteOffsetSec: 90, durationSec: 110, audioUrl: "https://a/2.wav" });

  usePlayerStore.getState().setQueue([first, second], 0, 24);
  usePlayerStore.getState().play();
  usePlayerStore.getState().playNext();

  let state = usePlayerStore.getState();
  assert.equal(state.activeTrack?.id, "part-2");
  assert.equal(state.positionSec, 0);
  assert.equal(state.isPlaying, true);

  usePlayerStore.getState().playPrevious();
  state = usePlayerStore.getState();
  assert.equal(state.activeTrack?.id, "part-1");
  assert.equal(state.positionSec, 0);
  assert.equal(state.isPlaying, true);
});

test("keeps playback intent when selecting another queue item manually", () => {
  const queue = [
    makeTrack("part-1", { absoluteOffsetSec: 0, audioUrl: "https://a/1.wav" }),
    makeTrack("part-2", { absoluteOffsetSec: 120, audioUrl: "https://a/2.wav" }),
    makeTrack("part-3", { absoluteOffsetSec: 240, audioUrl: "https://a/3.wav" }),
  ];

  usePlayerStore.getState().setQueue(queue, 0, 18);
  usePlayerStore.getState().play();
  usePlayerStore.getState().selectQueueIndex(2, 7);

  const state = usePlayerStore.getState();
  assert.equal(state.activeTrack?.id, "part-3");
  assert.equal(state.positionSec, 7);
  assert.equal(state.isPlaying, true);
});

test("does not clear play intent when native status briefly reports not playing", () => {
  const readyTrack = makeTrack("part-1", { audioUrl: "https://a/1.wav" });

  usePlayerStore.getState().setQueue([readyTrack], 0, 0);
  usePlayerStore.getState().play();
  usePlayerStore.getState().setPlaybackSnapshot({
    isPlaying: false,
    isLoaded: false,
    isBuffering: true,
    positionSec: 0,
  });

  const state = usePlayerStore.getState();
  assert.equal(state.isPlaying, true);
  assert.equal(state.isPlaybackActive, false);
  assert.equal(state.isBuffering, true);
  assert.equal(state.isLoaded, false);
});

test("tracks real playback state separately from autoplay intent", () => {
  const readyTrack = makeTrack("part-1", { audioUrl: "https://a/1.wav" });

  usePlayerStore.getState().setQueue([readyTrack], 0, 0);
  usePlayerStore.getState().play();
  usePlayerStore.getState().setPlaybackSnapshot({
    isPlaying: true,
    isLoaded: true,
    isBuffering: false,
    positionSec: 3,
  });

  const state = usePlayerStore.getState();
  assert.equal(state.isPlaying, true);
  assert.equal(state.isPlaybackActive, true);
  assert.equal(state.positionSec, 3);
});

test("updates the active streaming part when queue sync makes the audio ready", () => {
  const queuedTrack = makeTrack("part-2", {
    absoluteOffsetSec: 120,
    audioUrl: undefined,
    partStatus: "queued",
  });
  const readyTrack = makeTrack("part-1", {
    absoluteOffsetSec: 0,
    audioUrl: "https://a/1.wav",
  });

  usePlayerStore.getState().setQueue([readyTrack, queuedTrack], 1, 0);
  usePlayerStore.getState().play();
  usePlayerStore.getState().syncPodcastQueue({
    id: "pod-streaming",
    title: "Streaming test",
    sourceType: "ai",
    voice: "Elif",
    format: "summary",
    totalDurationSec: 240,
    coverImageUrl: "https://example.com/next-cover.png",
    remoteCoverImageUrl: "https://example.com/next-cover.png",
    coverImageSource: "generated",
    parts: [
      {
        id: "part-1",
        podcastId: "pod-streaming",
        title: "Track part-1",
        durationSec: 120,
        pageRange: "s1/2",
        status: "ready",
        audioUrl: "https://a/1.wav",
        remoteAudioUrl: "https://a/1.wav",
      },
      {
        id: "part-2",
        podcastId: "pod-streaming",
        title: "Track part-2 ready",
        durationSec: 130,
        pageRange: "s2/2",
        status: "ready",
        audioUrl: "https://a/2.wav",
        remoteAudioUrl: "https://a/2.wav",
      },
    ],
    isFavorite: false,
    isDownloaded: false,
    progressSec: 120,
  });

  const state = usePlayerStore.getState();
  assert.equal(state.activeTrack?.id, "part-2");
  assert.equal(state.activeTrack?.audioUrl, "https://a/2.wav");
  assert.equal(state.activeTrack?.partStatus, "ready");
  assert.equal(state.activeTrack?.coverImageUrl, "https://example.com/next-cover.png");
  assert.equal(state.playbackDurationSec, 130);
  assert.equal(state.isPlaying, true);
});

test("rebuilds ai queue order and offsets when podcast parts are reordered", () => {
  const first = makeTrack("part-1", {
    absoluteOffsetSec: 0,
    durationSec: 90,
    audioUrl: "https://a/1.wav",
  });
  const second = makeTrack("part-2", {
    absoluteOffsetSec: 90,
    durationSec: 110,
    audioUrl: "https://a/2.wav",
  });

  usePlayerStore.getState().setQueue([first, second], 1, 14);
  usePlayerStore.getState().play();
  usePlayerStore.getState().syncPodcastQueue({
    id: "pod-streaming",
    title: "Streaming test",
    sourceType: "ai",
    voice: "Elif",
    format: "summary",
    totalDurationSec: 200,
    coverImageUrl: "https://example.com/cover.png",
    remoteCoverImageUrl: "https://example.com/cover.png",
    coverImageSource: "generated",
    parts: [
      {
        id: "part-2",
        podcastId: "pod-streaming",
        title: "Track part-2",
        durationSec: 110,
        pageRange: "s2/2",
        status: "ready",
        audioUrl: "https://a/2.wav",
        remoteAudioUrl: "https://a/2.wav",
      },
      {
        id: "part-1",
        podcastId: "pod-streaming",
        title: "Track part-1",
        durationSec: 90,
        pageRange: "s1/2",
        status: "ready",
        audioUrl: "https://a/1.wav",
        remoteAudioUrl: "https://a/1.wav",
      },
    ],
    isFavorite: false,
    isDownloaded: false,
    progressSec: 90,
  });

  const state = usePlayerStore.getState();
  assert.deepEqual(
    state.queue.map((item) => ({ id: item.id, absoluteOffsetSec: item.absoluteOffsetSec })),
    [
      { id: "part-2", absoluteOffsetSec: 0 },
      { id: "part-1", absoluteOffsetSec: 110 },
    ]
  );
  assert.equal(state.activeTrack?.id, "part-2");
  assert.equal(state.queueIndex, 0);
  assert.equal(state.positionSec, 14);
  assert.equal(state.playbackDurationSec, 110);
  assert.equal(state.isPlaying, true);
});

test("keeps waiting playback intent across a ready-to-queued part transition", () => {
  const first = makeTrack("part-1", {
    absoluteOffsetSec: 0,
    durationSec: 95,
    audioUrl: "https://a/1.wav",
  });
  const second = makeTrack("part-2", {
    absoluteOffsetSec: 95,
    durationSec: 105,
    audioUrl: undefined,
    partStatus: "queued",
  });

  usePlayerStore.getState().setQueue([first, second], 0, 0);
  usePlayerStore.getState().play();
  usePlayerStore.getState().playNext();

  let state = usePlayerStore.getState();
  assert.equal(state.activeTrack?.id, "part-2");
  assert.equal(state.activeTrack?.audioUrl, undefined);
  assert.equal(state.isPlaying, true);

  usePlayerStore.getState().syncPodcastQueue({
    id: "pod-streaming",
    title: "Streaming test",
    sourceType: "ai",
    voice: "Elif",
    format: "summary",
    totalDurationSec: 200,
    coverImageUrl: "https://example.com/cover.png",
    remoteCoverImageUrl: "https://example.com/cover.png",
    coverImageSource: "generated",
    parts: [
      {
        id: "part-1",
        podcastId: "pod-streaming",
        title: "Track part-1",
        durationSec: 95,
        pageRange: "s1/2",
        status: "ready",
        audioUrl: "https://a/1.wav",
        remoteAudioUrl: "https://a/1.wav",
      },
      {
        id: "part-2",
        podcastId: "pod-streaming",
        title: "Track part-2 ready",
        durationSec: 105,
        pageRange: "s2/2",
        status: "ready",
        audioUrl: "https://a/2.wav",
        remoteAudioUrl: "https://a/2.wav",
      },
    ],
    isFavorite: false,
    isDownloaded: false,
    progressSec: 95,
  });

  state = usePlayerStore.getState();
  assert.equal(state.activeTrack?.id, "part-2");
  assert.equal(state.activeTrack?.audioUrl, "https://a/2.wav");
  assert.equal(state.activeTrack?.partStatus, "ready");
  assert.equal(state.isPlaying, true);
});

test("respects pause while waiting for the next streaming part to become ready", () => {
  const first = makeTrack("part-1", {
    absoluteOffsetSec: 0,
    durationSec: 95,
    audioUrl: "https://a/1.wav",
  });
  const second = makeTrack("part-2", {
    absoluteOffsetSec: 95,
    durationSec: 105,
    audioUrl: undefined,
    partStatus: "queued",
  });

  usePlayerStore.getState().setQueue([first, second], 0, 0);
  usePlayerStore.getState().play();
  usePlayerStore.getState().playNext();
  usePlayerStore.getState().pause();

  usePlayerStore.getState().syncPodcastQueue({
    id: "pod-streaming",
    title: "Streaming test",
    sourceType: "ai",
    voice: "Elif",
    format: "summary",
    totalDurationSec: 200,
    coverImageUrl: "https://example.com/cover.png",
    remoteCoverImageUrl: "https://example.com/cover.png",
    coverImageSource: "generated",
    parts: [
      {
        id: "part-1",
        podcastId: "pod-streaming",
        title: "Track part-1",
        durationSec: 95,
        pageRange: "s1/2",
        status: "ready",
        audioUrl: "https://a/1.wav",
        remoteAudioUrl: "https://a/1.wav",
      },
      {
        id: "part-2",
        podcastId: "pod-streaming",
        title: "Track part-2 ready",
        durationSec: 105,
        pageRange: "s2/2",
        status: "ready",
        audioUrl: "https://a/2.wav",
        remoteAudioUrl: "https://a/2.wav",
      },
    ],
    isFavorite: false,
    isDownloaded: false,
    progressSec: 95,
  });

  const state = usePlayerStore.getState();
  assert.equal(state.activeTrack?.id, "part-2");
  assert.equal(state.activeTrack?.audioUrl, "https://a/2.wav");
  assert.equal(state.isPlaying, false);
});
