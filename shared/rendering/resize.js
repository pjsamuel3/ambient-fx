/**
 * observeResize(el, onResize, { debounce }) — a ResizeObserver that only
 * reports real size changes, debounced.
 *
 * Mobile browsers resize the viewport as their toolbars collapse and expand
 * during scrolling. A `position: fixed; inset: 0` layer follows that, and a
 * naive observer would then reallocate the whole simulation on every scroll.
 * The CSS side pins the background to `100lvh` so its box stays put; this
 * helper is the second line of defence: it ignores callbacks where the
 * rounded size is unchanged and coalesces bursts into one call.
 *
 * `skipFirst`: the caller has already sized itself for the current box, so the
 * observer's initial report is not forwarded.
 *
 * Returns { disconnect() }.
 */
export function observeResize(el, onResize, { debounce = 120, skipFirst = false } = {}) {
  let lastW = -1, lastH = -1, timer = 0;
  const measure = () => [Math.round(el.clientWidth), Math.round(el.clientHeight)];
  const check = () => {
    timer = 0;
    const [w, h] = measure();
    if (w === lastW && h === lastH) return;
    lastW = w; lastH = h;
    onResize(w, h);
  };
  if (skipFirst) [lastW, lastH] = measure();   // caller has already sized itself
  const ro = new ResizeObserver(() => {
    if (lastW === -1) { check(); return; }    // first report: immediate
    if (timer) clearTimeout(timer);
    timer = setTimeout(check, debounce);
  });
  ro.observe(el);
  return {
    disconnect() { if (timer) clearTimeout(timer); ro.disconnect(); },
  };
}
