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
