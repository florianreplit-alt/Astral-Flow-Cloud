// Small, safe arithmetic evaluator — no eval(), only numbers/operators allowed.
function calculate(expression) {
  if (!expression || !expression.trim()) {
    return "⚠️ Usage: .calc 2 + 2 * 5";
  }

  const cleaned = expression.trim();

  // Only allow digits, whitespace, and basic math operators/parentheses/decimal points.
  const isSafe = /^[0-9+\-*/().\s%]+$/.test(cleaned);
  if (!isSafe) {
    return "⚠️ Only numbers and + - * / % ( ) are allowed.";
  }

  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${cleaned})`)();

    if (typeof result !== "number" || !Number.isFinite(result)) {
      return "⚠️ That expression didn't produce a valid number.";
    }

    return `🧮 *Result*\n${cleaned} = *${result}*`;
  } catch {
    return "⚠️ Couldn't calculate that. Check your expression and try again.";
  }
}

module.exports = { calculate };
