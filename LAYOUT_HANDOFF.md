# Layout System Handoff

The game uses fixed logical compositions that scale uniformly to fit the available screen. Elements inside a composition keep normal fixed coordinates and sizes. The scale box handles responsiveness around them.

## Core files

- `src/layout/scaleBox.ts` contains the pure sizing functions, DOM wrappers, and resize observers.
- `src/styles.css` contains `.scale-box`, `.scale-box__content`, and screen composition styles.
- `test/scaleBox.test.ts` covers fitting and stacked-layout priority.

## Single scale box

```ts
const box = createScaleBox(704, 704, 'example__scale-box');
box.content.append(composition);
screen.append(box.element);
const stopLayout = observeScaleBox(screen, box);
```

`704 × 704` is the logical design canvas. The inner content remains that size. The outer wrapper receives the actual scaled width and height, so CSS layout understands its visible footprint and does not center an oversized invisible box.

The scale is:

```txt
min(1, available width / logical width, available height / logical height)
```

It never upscales. Call `stopLayout()` when unmounting the screen.

The title screen is one scale box, centered horizontally and vertically. Its `.title-screen__composition` fills the box with `width: 100%` and `height: 100%`.

## Stacked game layout

Fireball War uses three independent logical boxes:

```txt
top:    title, back button, player information
center: scene and status
bottom: action buttons
```

`observeStackedScaleBoxes()` fits all three. Width limits apply independently. When vertical space becomes tight, the center shrinks first. If top and bottom still cannot fit, both shrink together. CSS pins top and bottom to their edges while auto margins center the scene in remaining space.

Portrait and landscape use the same stack. Safe-area padding belongs to `.app-viewport`; scale boxes measure the remaining content area.

## Adding content safely

Add elements inside a box's `.content` composition. Keep all artwork, gaps, and controls inside its logical dimensions.

If content needs more room, change the dimensions passed to `createScaleBox()`. Do not duplicate those pixel dimensions on the child composition; use `width: 100%` and `height: 100%`. This keeps TypeScript as the single source of truth.

Do not add viewport-relative sizing such as `vw`, `vh`, or responsive media-query rearrangement inside a logical composition. Use fixed logical sizes there and let the scale box perform responsiveness.

Decorative overflow is clipped at the scale-box boundary. Include room for button juice, shadows, or animation overshoot in the logical canvas when those effects must remain visible.

## Verification

Run:

```sh
npm test
npm run build
```

When changing logical dimensions, check narrow portrait, short landscape, desktop, and mobile safe-area layouts. Nothing should cross a screen edge or produce horizontal scrolling.
