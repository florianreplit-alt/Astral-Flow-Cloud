const sharp = require("sharp");
const { renderPiece } = require("./chessPieces");

const SQUARE = 72;
const BOARD = SQUARE * 8;
const LIGHT = "#f0d9b5";
const DARK = "#b58863";
const HIGHLIGHT = "#f7ec6e";

function fenToBoard(fen) {
  const placement = fen.split(" ")[0];
  const rows = placement.split("/");
  const board = [];
  for (const row of rows) {
    const squares = [];
    for (const ch of row) {
      if (/\d/.test(ch)) {
        for (let i = 0; i < Number(ch); i++) squares.push(null);
      } else {
        squares.push(ch);
      }
    }
    board.push(squares);
  }
  return board; // board[0] = rank 8 ... board[7] = rank 1
}

function squareToXY(square) {
  const file = square.charCodeAt(0) - "a".charCodeAt(0); // 0-7
  const rank = Number(square[1]); // 1-8
  const col = file;
  const row = 8 - rank;
  return { col, row };
}

/**
 * Renders a FEN position to a PNG buffer.
 * @param {string} fen
 * @param {string} [fromSquare] last move origin, e.g. "e2" - highlighted
 * @param {string} [toSquare] last move destination, e.g. "e4" - highlighted
 * @returns {Promise<Buffer>}
 */
async function renderBoard(fen, fromSquare = "", toSquare = "") {
  const board = fenToBoard(fen);
  const highlighted = new Set();
  if (fromSquare) highlighted.add(fromSquare);
  if (toSquare) highlighted.add(toSquare);

  let squaresXml = "";
  let piecesXml = "";
  let coordsXml = "";

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const x = col * SQUARE;
      const y = row * SQUARE;
      const file = String.fromCharCode("a".charCodeAt(0) + col);
      const rank = 8 - row;
      const squareName = `${file}${rank}`;
      const isLight = (row + col) % 2 === 0;
      const isHighlighted = highlighted.has(squareName);
      const fill = isHighlighted ? HIGHLIGHT : isLight ? LIGHT : DARK;

      squaresXml += `<rect x="${x}" y="${y}" width="${SQUARE}" height="${SQUARE}" fill="${fill}" />`;

      const piece = board[row][col];
      if (piece) {
        // Real vector artwork (not a Unicode chess-glyph font) so pieces
        // render identically everywhere, regardless of what fonts happen
        // to be installed on the server.
        piecesXml += renderPiece(piece, x, y, SQUARE);
      }
    }
  }

  // File letters (bottom) and rank numbers (left)
  for (let col = 0; col < 8; col++) {
    const file = String.fromCharCode("a".charCodeAt(0) + col);
    const isLightCorner = (7 + col) % 2 === 0;
    coordsXml += `<text x="${col * SQUARE + SQUARE - 6}" y="${BOARD - 4}" font-size="14" text-anchor="end" fill="${isLightCorner ? DARK : LIGHT}">${file}</text>`;
  }
  for (let row = 0; row < 8; row++) {
    const rank = 8 - row;
    const isLightCorner = (row + 0) % 2 === 0;
    coordsXml += `<text x="4" y="${row * SQUARE + 16}" font-size="14" text-anchor="start" fill="${isLightCorner ? DARK : LIGHT}">${rank}</text>`;
  }

  const svg = `
    <svg width="${BOARD}" height="${BOARD}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${BOARD}" height="${BOARD}" fill="${DARK}" />
      ${squaresXml}
      ${piecesXml}
      ${coordsXml}
    </svg>
  `;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

module.exports = { renderBoard };
