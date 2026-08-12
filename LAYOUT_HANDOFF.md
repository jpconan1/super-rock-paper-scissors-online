# Layout System Handoff

The game uses fixed logical compositions that scale uniformly to fit the available screen. Elements inside a composition keep normal fixed coordinates and sizes. The scale box handles responsiveness around them.

## Core files

- `src/layout/scaleBox.ts` contains the pure sizing functions, DOM wrappers, and resize observers.
- `src/styles.css` contains `.scale-box`, `.scale-box__content`, and screen composition styles.
- `test/scaleBox.test.ts` covers fitting and responsive layout selection.

## Single scale box

```ts
const box = createScaleBox(704, 704, 'example__scale-box');
box.content.append(composition);
screen.append(box.element);
const stopLayout = observeScaleBox(screen, box);
```

The dimensions passed to `createScaleBox` define that screen's logical design canvas. The inner content remains that size. The outer wrapper receives the actual scaled width and height, so CSS layout understands its visible footprint and does not center an oversized invisible box.

The scale is:

```txt
min(1, available width / logical width, available height / logical height)
```

It never upscales. Call `stopLayout()` when unmounting the screen.

The title screen is one scale box, centered horizontally and vertically. Its `.title-screen__composition` fills the box with `width: 100%` and `height: 100%`.

## Responsive game layouts

Fireball War uses the same DOM in two authored logical compositions:

- `landscape`: `705 × 540`, selected when the host is square or wider.
- `portrait`: `390 × 705`, selected when the host is taller than wide.

`observeResponsiveScaleBox` selects the layout from the host's available width and height, updates the scale box's logical dimensions, and reports the selected named layout. Fireball War writes that name to `data-layout` on its composition; CSS uses it to change slot coordinates without recreating sprites, controls, or event handlers.

Future variants should provide an ordered set of named `ResponsiveScaleBoxLayout` definitions and keep one element tree across modes. Use deliberate fixed coordinate maps rather than fluid interpolation. Safe-area padding belongs to `.app-viewport`; the scale box measures the remaining content area.

The layout is edited directly in the variant's CSS. There is no layout-authoring tool, interpolation layer, stacked-panel system, or shared base-layout abstraction. Extract common layout structure only after the landscape and portrait compositions are approved.

## Adding content safely

Add elements inside a box's `.content` composition. Keep all artwork, gaps, and controls inside its logical dimensions.

If content needs more room, change the dimensions passed to `createScaleBox()`. Do not duplicate those pixel dimensions on the child composition; use `width: 100%` and `height: 100%`. This keeps TypeScript as the single source of truth.

Do not add viewport-relative sizing such as `vw` or `vh` inside a logical composition. Use fixed logical sizes for each named layout and let the responsive scale box select and scale them.

Decorative overflow is clipped at the scale-box boundary. Include room for button juice, shadows, or animation overshoot in the logical canvas when those effects must remain visible.

## Verification

Run:

```sh
npm test
npm run build
```

When changing logical dimensions, check narrow portrait, short landscape, desktop, and mobile safe-area layouts. Nothing should cross a screen edge or produce horizontal scrolling.
