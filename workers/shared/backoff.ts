export function exponentialBackoffSeconds(attemptCount: number, baseSeconds = 30, maxSeconds = 3600) {
  const raw = baseSeconds * 2 ** Math.max(attemptCount - 1, 0);
  return Math.min(raw, maxSeconds);
}
