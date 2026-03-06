import test from "node:test";
import assert from "node:assert/strict";

import { getPodcastPartStatusLabel } from "./podcastQueue.ts";

test("shows active listening only when the part has playable audio", () => {
  assert.equal(
    getPodcastPartStatusLabel("ready", {
      hasPlayableAudio: true,
      isActive: true,
      isPlaying: true,
    }),
    "Dinleniyor"
  );
});

test("shows queued auto-start state instead of fake listening", () => {
  assert.equal(
    getPodcastPartStatusLabel("queued", {
      hasPlayableAudio: false,
      isActive: true,
      isPlaying: true,
    }),
    "Hazır Olunca Başlayacak"
  );
});

test("shows processing auto-start state instead of fake listening", () => {
  assert.equal(
    getPodcastPartStatusLabel("processing", {
      hasPlayableAudio: false,
      isActive: true,
      isPlaying: true,
    }),
    "Hazırlanıyor"
  );
});

test("keeps queued label when auto-start is not armed", () => {
  assert.equal(
    getPodcastPartStatusLabel("queued", {
      hasPlayableAudio: false,
      isActive: true,
      isPlaying: false,
    }),
    "Sırada"
  );
});
