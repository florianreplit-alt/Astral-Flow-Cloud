// Vector chess piece artwork, drawn as SVG path/shape data instead of
// relying on a Unicode chess-glyph font (♜♞♝♛♚♟). Font-based rendering is
// unreliable on headless servers: whatever font the renderer substitutes
// for those code points varies wildly (missing glyphs, emoji-style
// fallback, wrong proportions), which is why boards were showing crosses,
// boxes, and other non-piece shapes instead of real pieces.
//
// Each piece is defined on a 45x45 viewBox (the standard size used by the
// well-known open-source "cburnett" chess set, CC-BY-SA / GPL, the same
// set used by Lichess and Wikipedia) and scaled to the board's square size
// at render time.
//
// fill/stroke are left as placeholders ({{FILL}}/{{STROKE}}) and are
// substituted per-color by the renderer.

const PIECE_PATHS = {
  // Pawn
  p: `
    <path d="M 22.5,9 C 20.29,9 18.5,10.79 18.5,13 C 18.5,13.89 18.79,14.71 19.28,15.38
      C 17.33,16.5 16,18.59 16,21 C 16,23.03 16.94,24.84 18.41,26.03
      C 15.41,27.09 11,29.58 11,39.5 L 34,39.5
      C 34,29.58 29.59,27.09 26.59,26.03
      C 28.06,24.84 29,23.03 29,21
      C 29,18.59 27.67,16.5 25.72,15.38
      C 26.21,14.71 26.5,13.89 26.5,13
      C 26.5,10.79 24.71,9 22.5,9 z"
      style="fill:{{FILL}};stroke:{{STROKE}};stroke-width:1.5;stroke-linecap:round"/>
  `,
  // Knight
  n: `
    <path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18"
      style="fill:{{FILL}};stroke:{{STROKE}};stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round"/>
    <path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31
      C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30
      C 9,30 5.997,31 6,26 C 6,24 12,14 12,14
      C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5
      C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10"
      style="fill:{{FILL}};stroke:{{STROKE}};stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round"/>
    <circle cx="9.5" cy="25.5" r="0.5" style="fill:{{EYE}};stroke:{{EYE}}"/>
    <path d="M 15,15.5 A 0.5,1.5 0 1 1 14,15.5 A 0.5,1.5 0 1 1 15,15.5 z"
      transform="matrix(0.866,0.5,-0.5,0.866,9.693,-5.173)"
      style="fill:{{EYE}};stroke:{{EYE}}"/>
  `,
  // Bishop
  b: `
    <g style="fill:{{FILL}};stroke:{{STROKE}};stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round">
      <path d="M 9,36 C 12.39,35.3 19.11,36.3 22.5,34 C 25.89,36.3 32.61,35.3 36,36
        C 36,36 37.65,36.54 39,38 C 38.32,38.97 37.35,38.99 36,38.5
        C 32.61,37.2 25.89,38.2 22.5,37.5 C 19.11,38.2 12.39,37.2 9,38.5
        C 7.646,38.99 6.677,38.97 6,38 C 7.354,36.06 9,36 9,36 z"/>
      <path d="M 15,32 C 17.5,34.5 27.5,34.5 30,32 C 30.5,30.5 30,30 30,30
        C 30,27.5 27.5,26 27.5,26 C 33,24.5 33.5,14.5 22.5,10.5
        C 11.5,14.5 12,24.5 17.5,26 C 17.5,26 15,27.5 15,30
        C 15,30 14.5,30.5 15,32 z"/>
      <path d="M 25 8 A 2.5 2.5 0 1 1 20,8 A 2.5 2.5 0 1 1 25 8 z"/>
    </g>
    <path d="M 17.5,26 L 27.5,26 M 15,30 L 30,30 M 22.5,15.5 L 22.5,20.5 M 20,18 L 25,18"
      style="fill:none;stroke:{{EYE}};stroke-width:1.5;stroke-linecap:round"/>
  `,
  // Rook
  r: `
    <g style="fill:{{FILL}};stroke:{{STROKE}};stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round">
      <path d="M 9,39 L 36,39 L 36,36 L 9,36 L 9,39 z"/>
      <path d="M 12,36 L 12,32 L 33,32 L 33,36 L 12,36 z"/>
      <path d="M 11,14 L 11,9 L 15,9 L 15,11 L 20,11 L 20,9 L 25,9 L 25,11 L 30,11 L 30,9 L 34,9 L 34,14"/>
      <path d="M 34,14 L 31,17 L 14,17 L 11,14"/>
      <path d="M 31,17 L 31,29.5 L 14,29.5 L 14,17"/>
      <path d="M 31,29.5 L 32.5,32 L 12.5,32 L 14,29.5"/>
    </g>
    <path d="M 11,14 L 34,14" style="fill:none;stroke:{{EYE}};stroke-width:1;stroke-linejoin:miter"/>
  `,
  // Queen
  q: `
    <g style="fill:{{FILL}};stroke:{{STROKE}};stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round">
      <circle cx="6"  cy="12" r="2.2"/>
      <circle cx="14" cy="9"  r="2.2"/>
      <circle cx="22.5" cy="8" r="2.2"/>
      <circle cx="31" cy="9"  r="2.2"/>
      <circle cx="39" cy="12" r="2.2"/>
      <path d="M 9,26 C 17.5,24.5 30,24.5 36,26 L 38.5,13.5 L 31,25 L 30.7,11.9
        L 25.5,24.5 L 22.5,10 L 19.5,24.5 L 14.3,11.9 L 14,25 L 6.5,13.5 L 9,26 z"/>
      <path d="M 9,26 C 9,28 10.5,28 11.5,30 C 12.5,31.5 12.5,31 12,33.5
        C 10.5,34.5 11,36 11,36 C 9.5,37.5 11,38.5 11,38.5
        C 17.5,39.5 27.5,39.5 34,38.5 C 34,38.5 35.5,37.5 34,36
        C 34,36 34.5,34.5 33,33.5 C 32.5,31 32.5,31.5 33.5,30
        C 34.5,28 36,28 36,26 C 27.5,24.5 17.5,24.5 9,26 z"/>
    </g>
    <path d="M 11,38.5 A 35,35 1 0 0 34,38.5" style="fill:none;stroke:{{EYE}};stroke-linecap:butt"/>
    <path d="M 11,29 A 35,35 1 0 1 34,29" style="fill:none;stroke:{{EYE}}"/>
    <path d="M 12.5,31.5 L 32.5,31.5" style="fill:none;stroke:{{EYE}}"/>
    <path d="M 11,34.5 A 35,35 1 0 0 34,34.5" style="fill:none;stroke:{{EYE}}"/>
    <path d="M 10.5,37.5 A 35,35 1 0 0 34.5,37.5" style="fill:none;stroke:{{EYE}}"/>
  `,
  // King
  k: `
    <path d="M 22.5,11.63 L 22.5,6" style="fill:none;stroke:{{STROKE}};stroke-width:1.5;stroke-linejoin:round"/>
    <path d="M 20,8 L 25,8" style="fill:none;stroke:{{STROKE}};stroke-width:1.5;stroke-linejoin:round"/>
    <path d="M 22.5,25 C 22.5,25 27,17.5 25.5,14.5 C 25.5,14.5 24.5,12 22.5,12
      C 20.5,12 19.5,14.5 19.5,14.5 C 18,17.5 22.5,25 22.5,25"
      style="fill:{{FILL}};stroke:{{STROKE}};stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round"/>
    <path d="M 12.5,37 C 18,40.5 27,40.5 32.5,37 L 32.5,30 C 32.5,30 41.5,25.5 38.5,19.5
      C 34.5,13 25,16 22.5,23.5 L 22.5,27 L 22.5,23.5 C 20,16 10.5,13 6.5,19.5
      C 3.5,25.5 12.5,30 12.5,30 L 12.5,37"
      style="fill:{{FILL}};stroke:{{STROKE}};stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round"/>
    <path d="M 12.5,30 C 18,27 27,27 32.5,30" style="fill:none;stroke:{{EYE}};stroke-width:1.5"/>
    <path d="M 12.5,33.5 C 18,30.5 27,30.5 32.5,33.5" style="fill:none;stroke:{{EYE}};stroke-width:1.5"/>
    <path d="M 12.5,37 C 18,34 27,34 32.5,37" style="fill:none;stroke:{{EYE}};stroke-width:1.5"/>
  `,
};

const VIEWBOX = 45;

/**
 * Returns an SVG <g> snippet drawing the given piece, positioned and
 * scaled to fit inside a square of the given size at (x, y) (top-left).
 * @param {string} piece FEN piece char, e.g. "P", "n", "K"
 * @param {number} x top-left x of the target square
 * @param {number} y top-left y of the target square
 * @param {number} squareSize
 */
function renderPiece(piece, x, y, squareSize) {
  const isWhite = piece === piece.toUpperCase();
  const key = piece.toLowerCase();
  const template = PIECE_PATHS[key];
  if (!template) return "";

  const fill = isWhite ? "#ffffff" : "#2b2b26";
  const stroke = "#000000";
  const eye = isWhite ? "#000000" : "#ffffff";

  const body = template
    .replace(/\{\{FILL\}\}/g, fill)
    .replace(/\{\{STROKE\}\}/g, stroke)
    .replace(/\{\{EYE\}\}/g, eye);

  // Scale from the 45x45 native viewBox to the target square, with a
  // small inset so pieces don't touch the square edges.
  const inset = squareSize * 0.06;
  const drawSize = squareSize - inset * 2;
  const scale = drawSize / VIEWBOX;

  return `<g transform="translate(${x + inset},${y + inset}) scale(${scale})">${body}</g>`;
}

module.exports = { renderPiece };
