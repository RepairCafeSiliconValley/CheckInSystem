const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateCode() {
  let code = "";
  for (let i = 0; i < 3; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return `R-${code}`;
}
