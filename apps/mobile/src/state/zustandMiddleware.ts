import type {
  createJSONStorage as createJSONStorageType,
  persist as persistType,
} from "zustand/middleware";

// Expo web bundling trips over the ESM middleware entry because of import.meta.
// Use the CJS runtime path while preserving Zustand's official types.
const middleware = require("zustand/middleware") as typeof import("zustand/middleware");

export const createJSONStorage: typeof createJSONStorageType = middleware.createJSONStorage;
export const persist: typeof persistType = middleware.persist;
