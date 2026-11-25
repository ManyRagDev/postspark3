// Sorted once at pointerdown. A six-pixel hit area stays the same at any zoom.
export function nearestSnap(times, at, secondsPerPixel) {
  let low = 0, high = times.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (times[mid] < at) low = mid + 1;
    else high = mid;
  }
  const before = times[low - 1] ?? -Infinity;
  const after = times[low] ?? Infinity;
  const nearest = at - before <= after - at ? before : after;
  return Math.abs(at - nearest) <= secondsPerPixel * 6 ? nearest : null;
}
