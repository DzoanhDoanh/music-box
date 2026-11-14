export type Rectangle = { left: number; top: number; right: number; bottom: number };

/** Find a viewport slot outside every visible YouTube frame, including after scrolling. */
export function notificationPosition(
  width: number,
  height: number,
  cardHeight: number,
  players: Rectangle[],
  options: {
    cardWidth?: number;
    minHeight?: number;
    margin?: number;
    edge?: 'top' | 'bottom';
  } = {},
) {
  const margin = options.margin ?? 12,
    gap = 10,
    cardWidth = Math.min(options.cardWidth ?? 356, width - margin * 2);
  const xs = [
    width - margin - cardWidth,
    margin,
    ...players.flatMap((p) => [p.left - gap - cardWidth, p.right + gap]),
  ];
  const slots: { left: number; top: number; width: number; maxHeight: number }[] = [];
  for (const left of xs) {
    if (left < margin || left + cardWidth > width - margin) continue;
    let intervals = [[margin, height - margin]];
    for (const p of players) {
      if (p.right + gap <= left || p.left - gap >= left + cardWidth) continue;
      intervals = intervals.flatMap(([start, end]) => {
        if (p.bottom + gap <= start || p.top - gap >= end) return [[start, end]];
        return [
          [start, Math.min(end, p.top - gap)],
          [Math.max(start, p.bottom + gap), end],
        ].filter(([a, b]) => b > a);
      });
    }
    for (const [start, end] of intervals) {
      if (end - start < (options.minHeight ?? 48)) continue;
      slots.push({
        left,
        top: options.edge === 'top' ? start : Math.max(start, end - cardHeight),
        width: cardWidth,
        maxHeight: end - start,
      });
    }
  }
  return (
    slots.sort(
      (a, b) =>
        Number(b.maxHeight >= cardHeight) - Number(a.maxHeight >= cardHeight) ||
        b.left - a.left ||
        (options.edge === 'top' ? a.top - b.top : b.top - a.top),
    )[0] ?? null
  );
}
