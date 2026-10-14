// Which renderer the boards use: PixiJS (WebGL) by default, or the SVG boards with ?board=svg in the URL (kept while
// the Pixi boards are play-tested; designer decision 2026-10-13). Read once, at load.
export const SVG_BOARDS = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('board') === 'svg'
