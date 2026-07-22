/**
 * Pure video frame-sampling planner. Image/video moderation samples frames
 * (and routes audio→text separately); this decides which timestamps to grab
 * so a long clip is covered without moderating every frame.
 */
export function planFrameSamples(
  durationSeconds: number,
  opts: { everySeconds?: number; maxFrames?: number } = {},
): number[] {
  const every = Math.max(1, opts.everySeconds ?? 3);
  const max = Math.max(1, opts.maxFrames ?? 8);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return [0];

  const stamps: number[] = [];
  for (let t = 0; t <= durationSeconds && stamps.length < max; t += every) {
    stamps.push(Math.round(t * 100) / 100);
  }
  // Always include a near-final frame (endings matter) if room and not present.
  const last = Math.round(Math.max(0, durationSeconds - 0.1) * 100) / 100;
  if (stamps.length < max && stamps[stamps.length - 1] !== last) {
    stamps.push(last);
  }
  return stamps;
}
