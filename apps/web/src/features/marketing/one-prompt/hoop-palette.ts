/**
 * Loopmaxxing's own palette: the four colors of the hula hoop it is named
 * after (founder call 2026-11-18). This page is a deliberate exception to the
 * one-accent rule of the Kortix brand kit, and these values exist on this
 * page only. They paint the dither fields, where each pixel is drawn at 85%
 * over black, so every color is set one step brighter than the toy: the
 * yellow especially, which turns brown when it is darkened.
 */
export const HOOP_PALETTE = [
  '#FF4747', // audit:allow Loopmaxxing hoop palette (red), founder call 2026-11-18
  '#3F6FFF', // audit:allow Loopmaxxing hoop palette (blue), founder call 2026-11-18
  '#3FD95C', // audit:allow Loopmaxxing hoop palette (green), founder call 2026-11-18
  '#FFDA3D', // audit:allow Loopmaxxing hoop palette (yellow), founder call 2026-11-18
] as const;
