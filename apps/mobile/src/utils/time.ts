export function formatDuration(totalSeconds: number): string {
  const total = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (hours > 0) {
    if (minutes === 0) {
      return `${hours} sa`;
    }
    return `${hours} sa ${minutes} dk`;
  }

  if (minutes > 0) {
    if (seconds === 0) {
      return `${minutes} dk`;
    }
    return `${minutes} dk ${seconds} sn`;
  }

  return `${seconds} sn`;
}

export function formatTimer(totalSeconds: number): string {
  const total = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(total / 3600)
    .toString()
    .padStart(2, "0");
  const m = Math.floor((total % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  if (total >= 3600) {
    return `${hours}:${m}:${s}`;
  }
  return `${m}:${s}`;
}
