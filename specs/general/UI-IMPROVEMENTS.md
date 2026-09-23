# UI improvement review

## Scope

Refresh the presentation layer for the existing single-player auto-battler. Keep run progression, economy, unit stats, synergies, shop behavior, and individual unit skills intact while making the game feel like a bright virtual-idol concert arena. Equipment-specific combat triggers and crafting routes may change with an equipment redesign.

## Findings and changes

- **High — the portrait phone game screen was visually crowded.** Replaced the stacked toolbar, shop preview, level controls, and repeated action rows with a compact resource header, a centered board and bench, and one bottom action row. Population and experience remain visible in a small strip. Shop operations, deployment, upgrade, equipment, bonds, details, and other settings are available from focused sheets.
- **High — the board could extend beyond a narrow phone viewport.** Sized the grid from the actual phone width, reduced its inner gap and padding, and checked that all eight columns fit at 390, 360, 375, and 320 pixel widths.
- **Medium — mobile utility actions were scattered through the header.** Added a More sheet for the unit book, history, autoplay, help, sound, restart, challenge end, and battle speed. The shop sheet now contains its related economy and deployment actions.
- **High — equipment was presented as bare chips and most items were stat sticks.** Reworked the panel into an armory with loadout, inventory, craftable pairs, a forge, and an expandable route catalog. Cards show the item's stat line and combat trait; the unit book now lists traits and recipes too. Mobile uses a compact card grid and collapses routes until requested.
- **High — recipe discovery did not communicate why a craft mattered.** Added fixed pair recipes for all 21 combinations of the six components. Component mechanics carry into crafted items, then each crafted item adds its own trigger. The forge previews all four artifact choices and their trait text.

- **High — the old dark, metal-heavy palette conflicted with the virtual-idol cast.** Replaced the visible interface with a light sky-blue, mint, lilac, and pink stage palette, translucent panels, clear resource chips, and a generated concert-arena backdrop.
- **High — the board needed a stronger stage presence.** Reorganized play into a three-column desktop view, added a raised perspective board and separate bench, and gave the shop and battle action a clear bottom-row hierarchy.
- **High — characters were too small to carry their identity.** Kept the existing individual hero portrait assets in the shop, unit book, and inspect panel. Added a hero-specific hue and a short signature-skill cue using the matching portrait and skill glyph.
- **Medium — the mobile start screen could exceed the viewport.** Made the mode cards stack on narrow screens and constrained the start card to the viewport width. Checked the result at a 390 × 844 emulated viewport.
- **High — the portrait phone play area needed a clearer board and touch dock.** Compact the mobile HUD, use the available main-area height when scaling the board, and give the shop/bond/equipment/details controls and battle button larger tap targets. Hide empty desktop control columns after their contents move into the mobile drawer.
- **High — the bench could overlap the shop in short landscape windows.** Compact the header and shop cards, place the eight bench slots beside the board, size the board to the remaining height, and scale touch layouts against the actual main-area width.
- **High — desktop top-bar labels disappeared.** A blanket icon-button rule set every control to `font-size: 0` and a fixed 34px width. Keep secondary actions compact, but let 图鉴 and 结束挑战 size to their text on desktop; restore 图鉴 to icon-only on narrow screens. Keep the end-of-run button's inline display mode compatible with its icon and label.
- **Medium — icon-only controls needed accessible names.** Added title and `aria-label` fallbacks to the top-bar icon buttons, plus a reduced-motion rule for the new animations.
- **Medium — app identity did not match the refreshed game.** Updated the title, browser theme color, install manifest, stage icon, and offline cache version to “星域棋战”.

## Positive observations

- The project already contains 50 individual large hero portraits and 16 skill-effect textures, so the redesigned screens can show distinct performers without substituting generic character art.
- The existing game is a single-page app with no build step. The presentation layer is split into dedicated CSS and JavaScript files, while the engine and run rules remain in `index.html`.
- The current board, shop, bonds, player stats, inspect panels, history, and unit book remain available in the single-player flow.

## Verification

- Checked the redesigned preparation screen at 390 × 844, 360 × 740, 375 × 667, and 320 × 568 touch viewports. The board and bench fit horizontally, and the bottom action row stays within the viewport.
- Opened the shop and More sheets; all five shop cards rendered, purchase reduced gold and added a bench unit, and no page errors occurred in those viewports. Also reviewed 740 × 360 touch landscape and 1280 × 800 desktop layouts.
- Reviewed the start screen at desktop and 390 × 844 emulated mobile sizes.
- Started a new run in a local browser and reviewed the battle preparation screen at 1440 × 900.
- Checked board, bench, and shop separation at 1305 × 318 and 740 × 360 landscape sizes; the bench stays above the shop in both layouts.
- For the current portrait/header fixes, reviewed the cascade and mobile drawer node moves statically. Browser visual regression was not run in this iteration.
- No automated test suite or build step is configured for this project.
