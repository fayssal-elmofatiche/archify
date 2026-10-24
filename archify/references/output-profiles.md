# Output profiles (provisional)

Status: first slice for review in #1104. The field shape and the floors are
provisional until that review settles them.

## Problem

The artifact checker projects text onto the 930px Reader column
(`collectDesktopReadability`) and skips fine detail, because the Viewer can
zoom. A slide or a printed page has no zoom and a different width, so a
diagram can pass `showcase` and still print with unreadable text.

## Contract

```json
"meta": {
  "output_profile": { "medium": "print", "column_mm": 160, "max_height_mm": 200 }
}
```

| Medium | Frame | Final unit | Primary floor | Secondary floor | Max scale |
|---|---|---|---|---|---|
| `slide` | 1920×1080 CSS px less an 80px margin = 1760×920 | px | 24 | 20 | 2 |
| `print` | `column_mm` (default 160) × `max_height_mm` (default 200), in pt | pt | 9 | 7.5 | 1 |

Primary text is node labels and boundary labels. Secondary text is everything
else that is drawn: relationship labels, context text, fine detail and the
legend.

Placement scale: `s = min(maxScale, frameW / viewBoxW, frameH / viewBoxH)`.
One SVG user unit is one CSS px at `s = 1`, and one pt in print. Final size of
a text is `font-size × s`.

Without `output_profile` nothing changes: no attributes, no check, and the
diagram SVG is byte-identical.

## What renderers do

Only stamp the frame. `svgRootAttrs` adds `data-output-medium`,
`data-output-frame`, `data-output-unit`, `data-output-floor` and
`data-output-max-scale` from `renderers/shared/output-profile.mjs`, so the
checker reads the numbers the renderer resolved. Layout is not changed.

## Checker: `output_final_type`

`check-render-output` projects every drawn `<text>` outside `defs`, symbols,
markers, patterns, masks and clip paths to its final size. Text below its
floor is `output/final-type-below-floor`, with:

- owner: node id, edge `from`/`to`, boundary, legend, or canvas
- text, role, source px, final size, floor, unit, scale, max scale, frame,
  viewBox

The composition receipt carries `outputFinalType` evidence: scale, frame,
smallest primary and secondary final size, text count and count below floor.

It is a warning in both `standard` and `showcase`, following CONTRIBUTING's
rule that a new check ships as evidence first. Supported fixes belong with a
later promotion to an error; they would keep the text and make the canvas fit,
and none would lower the floor.

## Out of scope for this slice

- Renderers choosing type for the medium (would build on `typography_scale`,
  #649 and #578).
- Export at the checked size (would be a flag on the export command from #974
  or #241).
