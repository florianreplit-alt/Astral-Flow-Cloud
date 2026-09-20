// Astral Cloud brand fonts — exactly three styles used bot-wide.
// Usage: fonts.mono("text"), fonts.super("text"), fonts.script("text")

const MONO_MAP = {
  a: "𝚊", b: "𝚋", c: "𝚌", d: "𝚍", e: "𝚎", f: "𝚏", g: "𝚐", h: "𝚑",
  i: "𝚒", j: "𝚓", k: "𝚔", l: "𝚕", m: "𝚖", n: "𝚗", o: "𝚘", p: "𝚙",
  q: "𝚚", r: "𝚛", s: "𝚜", t: "𝚝", u: "𝚞", v: "𝚟", w: "𝚠", x: "𝚡",
  y: "𝚢", z: "𝚣",
  A: "𝙰", B: "𝙱", C: "𝙲", D: "𝙳", E: "𝙴", F: "𝙵", G: "𝙶", H: "𝙷",
  I: "𝙸", J: "𝙹", K: "𝙺", L: "𝙻", M: "𝙼", N: "𝙽", O: "𝙾", P: "𝙿",
  Q: "𝚀", R: "𝚁", S: "𝚂", T: "𝚃", U: "𝚄", V: "𝚅", W: "𝚆", X: "𝚇",
  Y: "𝚈", Z: "𝚉",
  0: "𝟶", 1: "𝟷", 2: "𝟸", 3: "𝟹", 4: "𝟺", 5: "𝟻", 6: "𝟼", 7: "𝟽",
  8: "𝟾", 9: "𝟿",
};

const SUPER_MAP = {
  a: "ᵃ", b: "ᵇ", c: "ᶜ", d: "ᵈ", e: "ᵉ", f: "ᶠ", g: "ᵍ", h: "ʰ",
  i: "ⁱ", j: "ʲ", k: "ᵏ", l: "ˡ", m: "ᵐ", n: "ⁿ", o: "ᵒ", p: "ᵖ",
  q: "۹", r: "ʳ", s: "ˢ", t: "ᵗ", u: "ᵘ", v: "ᵛ", w: "ʷ", x: "ˣ",
  y: "ʸ", z: "ᶻ",
  A: "ᴬ", B: "ᴮ", C: "ᶜ", D: "ᴰ", E: "ᴱ", F: "ᶠ", G: "ᴳ", H: "ᴴ",
  I: "ᴵ", J: "ᴶ", K: "ᴷ", L: "ᴸ", M: "ᴹ", N: "ᴺ", O: "ᴼ", P: "ᴾ",
  Q: "Q", R: "ᴿ", S: "ˢ", T: "ᵀ", U: "ᵁ", V: "ⱽ", W: "ᵂ", X: "ˣ",
  Y: "ʸ", Z: "ᶻ",
  0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷",
  8: "⁸", 9: "⁹",
};

const SCRIPT_MAP = {
  a: "α", b: "ɓ", c: "ƈ", d: "ԃ", e: "ҽ", f: "բ", g: "ɠ", h: "ԋ",
  i: "ٱ", j: "ʝ", k: "ƙ", l: "ʅ", m: "ɱ", n: "ղ", o: "σ", p: "ρ",
  q: "ϙ", r: "ɾ", s: "ʂ", t: "ƚ", u: "υ", v: "ѵ", w: "ա", x: "х",
  y: "ყ", z: "ȥ",
  A: "A", B: "B", C: "C", D: "D", E: "E", F: "F", G: "G", H: "H",
  I: "I", J: "J", K: "K", L: "L", M: "M", N: "N", O: "O", P: "P",
  Q: "Q", R: "R", S: "S", T: "T", U: "U", V: "V", W: "W", X: "X",
  Y: "Y", Z: "Z",
};

function convert(text, map) {
  return String(text)
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("");
}

const fonts = {
  mono: (text) => convert(text, MONO_MAP),
  super: (text) => convert(text, SUPER_MAP),
  script: (text) => convert(text, SCRIPT_MAP),
};

module.exports = fonts;
