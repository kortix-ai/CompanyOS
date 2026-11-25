// FNV-1a-ish string hash → stable 32-bit int. Same label always hashes the same,
// so an entity keeps its color across renders/sessions.
function hashLabel(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export interface ChalkColors {
  background: string;
  foreground: string;
  border: string;
}

export function chalkColors(label: string): ChalkColors {
  const hash = hashLabel(label || "?");
  return chalkFromHue(hash % 360, 35 + (hash % 12), (hash >> 3) % 10);
}

function chalkFromHue(hue: number, sat: number, lift: number): ChalkColors {
  return {
    background: `hsl(${hue} ${sat}% ${77 + lift}%)`,
    foreground: `hsl(${hue} ${Math.min(sat + 10, 82)}% 27%)`,
    border: `hsl(${hue} ${sat}% ${65 + lift}%)`,
  };
}

/**
 * The chalk colours of a hue the caller picks, in both themes. For a fixed
 * set of things that must never share a hue (the surfaces on the download
 * page), where a hashed label could collide. Dark mode keeps the hue and
 * inverts the lightness, so a tile does not glare on a dark canvas.
 */
export function chalkColorsForHue(hue: number): { light: ChalkColors; dark: ChalkColors } {
  const sat = 40;
  return {
    light: chalkFromHue(hue, sat, 4),
    dark: {
      background: `hsl(${hue} ${sat - 12}% 17%)`,
      foreground: `hsl(${hue} ${sat + 20}% 76%)`,
      border: `hsl(${hue} ${sat - 12}% 26%)`,
    },
  };
}

/**
 * The solid fill of a person's avatar (Avatar v2): one of the eight glyph-ring
 * hues (`--color-glyph-ring-*` light values), white initials on top. Seed it
 * with the email, so a rename keeps the colour on web and mobile.
 */
export const AVATAR_FILLS: readonly string[] = [
  "hsl(220 8% 50%)",
  "hsl(4 46% 53%)",
  "hsl(24 60% 46%)",
  "hsl(46 62% 37%)",
  "hsl(84 42% 37%)",
  "hsl(212 46% 50%)",
  "hsl(275 34% 56%)",
  "hsl(318 40% 52%)",
];

/** The initials on every avatar fill, in both themes. */
export const AVATAR_INK = "hsl(0 0% 100%)";

export function avatarFill(seed: string): string {
  return AVATAR_FILLS[hashLabel(seed.trim().toLowerCase() || "?") % AVATAR_FILLS.length];
}
