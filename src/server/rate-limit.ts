/**
 * حد أداء على مستوى المشاهد والرسائل — بالذاكرة في هذه النسخة (خادم واحد).
 * في نشر متعدد العمليات: يلزم مخزن مشترك (Redis)؛ راجع README الفرق.
 */

export type LimitEntry = { hits: number[] };

const buckets = new Map<string, number[]>();

export type AllowResult =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number };

export function allow(
  key: string,
  windowMs: number,
  maxActions: number,
  now = Date.now(),
): AllowResult {
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= maxActions) {
    const oldest = arr[0]!;
    return { allowed: false, retryAfterMs: windowMs - (now - oldest) };
  }
  arr.push(now);
  buckets.set(key, arr);
  // تنظيف دوري خفيف لتجنب النمو غير المحدود
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      const live = v.filter((t) => now - t < windowMs);
      if (live.length === 0) buckets.delete(k);
      else buckets.set(k, live);
    }
  }
  return { allowed: true };
}

export function resetLimit(key: string): void {
  buckets.delete(key);
}
