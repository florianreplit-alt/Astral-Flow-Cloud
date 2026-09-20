// ═══════════════════════════════════════════════════════
//   ♟️  CHESS GAME
//   .chess              → show help / menu
//   .chess @player       → challenge someone
//   .chess accept        → accept a challenge
//   .chess decline        → decline a challenge
//   .chess move e2e4 (or Nf3) → make a move
//   .chess board          → re-show current board
//   .chess resign          → resign the game
//   .chess draw            → offer / accept a draw
//   .chess status           → show game info
// ═══════════════════════════════════════════════════════
const { Chess } = require("chess.js");
const { renderBoard } = require("../../utils/chessRenderer");
const {
  getGame,
  saveGame,
  endGame,
  isPlayerBusy,
  PENDING,
  DRAW_OFFERS,
} = require("../../utils/chessStore");

const jidNum = (jid) => jid.split("@")[0];

function turnLabel(game) {
  const chess = new Chess(game.fen);
  return chess.turn() === "w" ? "White" : "Black";
}

function currentPlayer(game) {
  const chess = new Chess(game.fen);
  return chess.turn() === "w" ? game.white : game.black;
}

function moveHistory(game) {
  const history = game.sanHistory || [];
  if (!history.length) return "no moves yet";
  const pairs = [];
  for (let i = 0; i < history.length; i += 2) {
    const num = Math.floor(i / 2) + 1;
    const w = history[i];
    const b = history[i + 1] || "";
    pairs.push(`${num}. ${w}${b ? " " + b : ""}`);
  }
  return pairs.slice(-5).join("  ");
}

function buildStatusCaption(game, chess, extraLine = "") {
  const whiteNum = jidNum(game.white);
  const blackNum = jidNum(game.black);
  const turn = chess.turn() === "w" ? `♔ @${whiteNum}` : `♚ @${blackNum}`;
  const inCheck = chess.inCheck() ? "  ⚠️ In check!" : "";
  const moves = moveHistory(game);

  return (
    `♟️ *Chess*\n` +
    `♔ White: @${whiteNum}\n` +
    `♚ Black: @${blackNum}\n` +
    `Turn: ${turn}${inCheck}\n` +
    `Moves: ${moves}` +
    (extraLine ? `\n${extraLine}` : "")
  );
}

async function sendBoard(sock, chat, msg, game, caption, mentions) {
  const lastMove = game.lastMove || {};
  try {
    const buf = await renderBoard(game.fen, lastMove.from || "", lastMove.to || "");
    await sock.sendMessage(chat, { image: buf, caption, mentions }, { quoted: msg });
  } catch (e) {
    console.error("[chess sendBoard]", e.message);
    await sock.sendMessage(chat, { text: caption + "\n\n⚠️ Failed to render board.", mentions }, { quoted: msg });
  }
}

const HELP_TEXT =
  `♟️ *Chess*\n` +
  `.chess @player — challenge\n` +
  `.chess accept — accept a challenge\n` +
  `.chess decline — decline a challenge\n` +
  `.chess move e2e4 — make a move\n` +
  `.chess board — show board\n` +
  `.chess resign — resign\n` +
  `.chess draw — offer/accept draw\n` +
  `.chess status — game info`;

/**
 * @param {import("@whiskeysockets/baileys").WASocket} sock
 * @param {object} msg  raw Baileys message
 * @param {string} argText  everything after ".chess "
 */
async function playChess(sock, msg, argText) {
  const chat = msg.key.remoteJid;
  const sender = msg.key.participant || msg.key.remoteJid;

  if (!chat?.endsWith("@g.us")) {
    return { text: "♟️ Chess can only be played in a group chat." };
  }

  const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  const args = argText.trim().length ? argText.trim().split(/\s+/) : [];
  const sub = (args[0] || "").toLowerCase();
  const subCommands = ["accept", "decline", "move", "m", "board", "resign", "draw", "status", "help"];

  // ── .chess (help) ──────────────────────────────────
  if (!sub || sub === "help") {
    return { text: HELP_TEXT };
  }

  // ── .chess @player (challenge) ─────────────────────
  if (mentionedJid.length && !subCommands.includes(sub)) {
    const target = mentionedJid[0];
    if (target === sender) return { text: "⚘ You cannot challenge yourself." };
    if (isPlayerBusy(sender)) return { text: "⚘ You are already in a game." };
    if (isPlayerBusy(target)) return { text: `⚘ @${jidNum(target)} is already in a game.`, mentions: [target] };

    PENDING.set(sender, { target, chat, expiry: Date.now() + 120_000 });

    return {
      text:
        `♟️ *Chess challenge*\n` +
        `@${jidNum(sender)} challenges @${jidNum(target)} to chess!\n` +
        `@${jidNum(target)} type *.chess accept* to play\n` +
        `or *.chess decline* to refuse\n` +
        `Challenge expires in 2 minutes.`,
      mentions: [sender, target],
    };
  }

  // ── .chess accept ──────────────────────────────────
  if (sub === "accept") {
    let challengerJid = null;
    for (const [chal, info] of PENDING.entries()) {
      if (info.target === sender && info.chat === chat) {
        challengerJid = chal;
        break;
      }
    }
    if (!challengerJid) return { text: "⚘ No pending challenge for you." };

    const info = PENDING.get(challengerJid);
    if (Date.now() > info.expiry) {
      PENDING.delete(challengerJid);
      return { text: "⚘ Challenge expired." };
    }
    PENDING.delete(challengerJid);

    const [white, black] =
      Math.random() < 0.5 ? [challengerJid, sender] : [sender, challengerJid];

    const chess = new Chess();
    const game = {
      white,
      black,
      fen: chess.fen(),
      lastMove: null,
      moveCount: 0,
      sanHistory: [],
      startedAt: Date.now(),
    };
    saveGame(chat, game);

    await sock.sendMessage(
      chat,
      {
        text: `♟️ *Game start*\n♔ White: @${jidNum(white)}\n♚ Black: @${jidNum(black)}`,
        mentions: [white, black],
      },
      { quoted: msg }
    );

    const caption = buildStatusCaption(game, chess, "White moves first — use .chess move e2e4");
    await sendBoard(sock, chat, msg, game, caption, [white, black]);
    return null;
  }

  // ── .chess decline ─────────────────────────────────
  if (sub === "decline") {
    for (const [chal, info] of PENDING.entries()) {
      if (info.target === sender && info.chat === chat) {
        PENDING.delete(chal);
        return { text: `♟️ @${jidNum(sender)} declined the challenge.`, mentions: [sender] };
      }
    }
    return { text: "⚘ No pending challenge." };
  }

  // ── .chess board ───────────────────────────────────
  if (sub === "board") {
    const game = getGame(chat);
    if (!game) return { text: "⚘ No active game. Use .chess @player to start." };
    const chess = new Chess(game.fen);
    const caption = buildStatusCaption(game, chess);
    await sendBoard(sock, chat, msg, game, caption, [game.white, game.black]);
    return null;
  }

  // ── .chess status ──────────────────────────────────
  if (sub === "status") {
    const game = getGame(chat);
    if (!game) return { text: "⚘ No active game." };
    const chess = new Chess(game.fen);
    const elapsed = Math.floor((Date.now() - game.startedAt) / 60000);
    return {
      text: buildStatusCaption(game, chess, `Time elapsed: ${elapsed}m · Move ${game.moveCount}`),
      mentions: [game.white, game.black],
    };
  }

  // ── .chess resign ──────────────────────────────────
  if (sub === "resign") {
    const game = getGame(chat);
    if (!game) return { text: "⚘ No active game." };
    if (game.white !== sender && game.black !== sender) return { text: "⚘ You are not in this game." };

    const winner = game.white === sender ? game.black : game.white;
    const loser = sender;
    endGame(chat);

    return {
      text: `♟️ *Resignation*\n@${jidNum(loser)} resigned\n🏆 @${jidNum(winner)} wins!`,
      mentions: [loser, winner],
    };
  }

  // ── .chess draw ─────────────────────────────────────
  if (sub === "draw") {
    const game = getGame(chat);
    if (!game) return { text: "⚘ No active game." };
    if (game.white !== sender && game.black !== sender) return { text: "⚘ You are not in this game." };

    const existing = DRAW_OFFERS.get(chat);
    if (existing && existing !== sender) {
      DRAW_OFFERS.delete(chat);
      endGame(chat);
      return {
        text: `♟️ *Draw*\n@${jidNum(game.white)} & @${jidNum(game.black)} agreed to a draw.\n🤝 Game ended.`,
        mentions: [game.white, game.black],
      };
    }

    DRAW_OFFERS.set(chat, sender);
    const opponent = game.white === sender ? game.black : game.white;
    return {
      text: `♟️ *Draw offer*\n@${jidNum(sender)} offers a draw.\n@${jidNum(opponent)} type *.chess draw* to accept.`,
      mentions: [sender, opponent],
    };
  }

  // ── .chess move <notation> (also: bare notation as fallback) ──
  const isMoveSub = sub === "move" || sub === "m";
  const notationArg = isMoveSub ? args[1] : sub;
  const looksLikeMove = /^([a-h][1-8][a-h][1-8][qrbn]?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8][+#=]?[qrbn]?|O-O(-O)?)$/i.test(
    notationArg || ""
  );

  if (isMoveSub || looksLikeMove) {
    const game = getGame(chat);
    if (!game) return { text: "⚘ No active game." };
    if (game.white !== sender && game.black !== sender) return { text: "⚘ You are not in this game." };

    const activeSide = currentPlayer(game);
    if (activeSide !== sender) return { text: `⚘ It's not your turn. (${turnLabel(game)} to move)` };

    const notation = notationArg;
    if (!notation) return { text: "⚘ Usage: .chess move e2e4  or  .chess move Nf3" };

    const chess = new Chess(game.fen);
    let moveResult = null;

    if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(notation)) {
      const from = notation.slice(0, 2).toLowerCase();
      const to = notation.slice(2, 4).toLowerCase();
      const promo = notation[4]?.toLowerCase();
      try {
        moveResult = chess.move({ from, to, promotion: promo || "q" });
      } catch {}
    }
    if (!moveResult) {
      try {
        moveResult = chess.move(notation);
      } catch {}
    }

    if (!moveResult) {
      const legalMoves = chess
        .moves({ verbose: true })
        .filter((m) => !notation || m.from === notation.slice(0, 2).toLowerCase())
        .slice(0, 10)
        .map((m) => m.san)
        .join(", ");
      return {
        text:
          `⚘ Invalid move: *${notation}*` +
          (legalMoves ? `\nSome legal moves: ${legalMoves}` : ""),
      };
    }

    game.fen = chess.fen();
    game.lastMove = { from: moveResult.from, to: moveResult.to };
    game.moveCount = (game.moveCount || 0) + 1;
    game.sanHistory = [...(game.sanHistory || []), moveResult.san];
    DRAW_OFFERS.delete(chat);

    // ── Game over? ──────────────────────────────────
    if (chess.isGameOver()) {
      let result = "";
      let winner = null;

      if (chess.isCheckmate()) {
        winner = sender;
        const loser = game.white === sender ? game.black : game.white;
        result = `♟️ *Checkmate!*\n🏆 @${jidNum(winner)} wins!\n@${jidNum(loser)} was mated.`;
      } else if (chess.isDraw()) {
        if (chess.isStalemate()) result = `🤝 *Stalemate!* It's a draw.`;
        else if (chess.isThreefoldRepetition()) result = `🤝 *Threefold repetition* — draw.`;
        else if (chess.isInsufficientMaterial()) result = `🤝 *Insufficient material* — draw.`;
        else result = `🤝 *Draw!*`;
      }

      try {
        const buf = await renderBoard(game.fen, moveResult.from, moveResult.to);
        await sock.sendMessage(
          chat,
          { image: buf, caption: `♟️ *Game over*\n${result}`, mentions: [game.white, game.black] },
          { quoted: msg }
        );
      } catch {}

      endGame(chat);
      return null;
    }

    saveGame(chat, game);

    const nextTurn = turnLabel(game);
    const nextPlayer = currentPlayer(game);
    const inCheck = chess.inCheck() ? "⚠️ In check!" : "";
    const caption =
      `♟️ *Chess*\n` +
      `Move: *${moveResult.san}* (#${game.moveCount})\n` +
      `Turn: ${nextTurn} @${jidNum(nextPlayer)} ${inCheck}\n` +
      `Moves: ${moveHistory(game)}`;

    try {
      const buf = await renderBoard(game.fen, moveResult.from, moveResult.to);
      await sock.sendMessage(chat, { image: buf, caption, mentions: [game.white, game.black] }, { quoted: msg });
    } catch (e) {
      console.error("[chess move render]", e.message);
      await sock.sendMessage(chat, { text: caption, mentions: [game.white, game.black] }, { quoted: msg });
    }
    return null;
  }

  return { text: "♟️ Unknown subcommand. Use .chess help for commands." };
}

module.exports = { playChess };
