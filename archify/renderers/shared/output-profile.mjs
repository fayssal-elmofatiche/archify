// Output profiles: where a diagram is read once it leaves the Viewer.
//
// The Reader projects type onto a desktop column (desktop-readability.mjs).
// A slide or a printed page is a different reader with a fixed frame and no
// zoom, so every drawn text, fine detail included, must reach a floor at its
// final size. Renderers use the resolved profile to set type; the artifact
// checker uses the stamped frame and floors to prove it. One module owns the
// numbers so both sides agree.

const PT_PER_MM = 72 / 25.4;

export const OUTPUT_MEDIA = Object.freeze(['slide', 'print']);

export const SLIDE_PROFILE = Object.freeze({
  medium: 'slide',
  unit: 'px',
  canvas: Object.freeze({ width: 1920, height: 1080 }),
  margin: 80,
  floors: Object.freeze({ primary: 24, secondary: 20 }),
  // A small diagram may grow to fill the slide, but not past 2x its source
  // size: oversized type reads as a mistake next to the slide headline.
  maxScale: 2,
});

export const PRINT_DEFAULTS = Object.freeze({ column_mm: 160, max_height_mm: 200 });

export const PRINT_PROFILE = Object.freeze({
  medium: 'print',
  unit: 'pt',
  floors: Object.freeze({ primary: 9, secondary: 7.5 }),
  // One source unit prints at no more than 1pt, so a figure never prints
  // larger than it was designed to be read.
  maxScale: 1,
});

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

// Resolve `meta.output_profile` to the frame the diagram is placed in, in the
// profile's final unit. Returns null for an ordinary Viewer artifact.
export function resolveOutputProfile(meta) {
  const authored = meta?.output_profile;
  if (!authored || !OUTPUT_MEDIA.includes(authored.medium)) return null;
  if (authored.medium === 'slide') {
    const { canvas, margin } = SLIDE_PROFILE;
    return {
      ...SLIDE_PROFILE,
      frame: { width: canvas.width - 2 * margin, height: canvas.height - 2 * margin },
    };
  }
  const columnMm = authored.column_mm ?? PRINT_DEFAULTS.column_mm;
  const maxHeightMm = authored.max_height_mm ?? PRINT_DEFAULTS.max_height_mm;
  return {
    ...PRINT_PROFILE,
    columnMm,
    maxHeightMm,
    frame: { width: round(columnMm * PT_PER_MM), height: round(maxHeightMm * PT_PER_MM) },
  };
}

// Final-size scale for a canvas: fit the frame, never past maxScale.
export function outputScale(profile, viewBoxWidth, viewBoxHeight) {
  if (!profile || !(viewBoxWidth > 0) || !(viewBoxHeight > 0)) return Number.NaN;
  return Math.min(profile.maxScale, profile.frame.width / viewBoxWidth, profile.frame.height / viewBoxHeight);
}

// Attributes stamped on the SVG root so the checker reads the same numbers
// the renderer used.
export function outputProfileAttrs(meta) {
  const profile = resolveOutputProfile(meta);
  if (!profile) return '';
  return ` data-output-medium="${profile.medium}" data-output-frame="${profile.frame.width} ${profile.frame.height}"`
    + ` data-output-unit="${profile.unit}" data-output-floor="${profile.floors.primary} ${profile.floors.secondary}"`
    + ` data-output-max-scale="${profile.maxScale}"`;
}

// Parse the stamped attributes back into a profile (checker side).
export function outputProfileFromAttrs(attrs) {
  const medium = attrs['data-output-medium'];
  if (!OUTPUT_MEDIA.includes(medium)) return null;
  const numbers = (value) => String(value || '').trim().split(/\s+/).map(Number);
  const [width, height] = numbers(attrs['data-output-frame']);
  const [primary, secondary] = numbers(attrs['data-output-floor']);
  const maxScale = Number(attrs['data-output-max-scale']);
  if (![width, height, primary, secondary, maxScale].every((value) => Number.isFinite(value) && value > 0)) return null;
  return { medium, unit: attrs['data-output-unit'] === 'pt' ? 'pt' : 'px', frame: { width, height }, floors: { primary, secondary }, maxScale };
}
