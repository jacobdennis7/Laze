// Geometry of the calendar time grid, shared by the event tiles and the
// suggested-time layer drawn over them.
export const DAY_START = 6 * 60; // 6 AM
export const DAY_END = 23 * 60; // 11 PM
export const PX_PER_MIN = 44 / 60;

export function yFor(min) {
  return (Math.max(min, DAY_START) - DAY_START) * PX_PER_MIN;
}
