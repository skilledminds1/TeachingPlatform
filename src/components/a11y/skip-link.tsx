/**
 * Skip to main content (GLO-03).
 *
 * Every page puts its navigation, and on the marketplace an entire filter panel, before the
 * content. Without this a keyboard or screen-reader user tabs through all of it on every
 * single page load before reaching the first tutor — the exact repetition WCAG 2.4.1 exists
 * to remove.
 *
 * Visually hidden until focused rather than hidden outright: `display: none` and
 * `visibility: hidden` remove an element from the accessibility tree entirely, so the link
 * would not be reachable by the very users it serves. This keeps it in the tab order and
 * off-screen, then brings it back on focus.
 *
 * The target is `#main-content`, which every `<main>` in the application carries.
 */
export function SkipLink() {
  return (
    <a
      href="#main-content"
      // `focus:` and not `focus-visible:` — deliberate. A skip link must appear whenever it
      // receives focus, including focus moved programmatically or restored after a route
      // change, not only when the browser's heuristic decides the focus came from a
      // keyboard. Measured: with focus-visible it stayed clipped at inset(50%).
      className="sr-only rounded-md bg-background px-4 py-2 text-sm font-medium text-foreground shadow-lg outline-2 outline-offset-2 outline-ring focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100]"
    >
      Skip to main content
    </a>
  );
}
