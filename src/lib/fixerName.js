// The ticket page (/T/:code) remembers the last fixer name used on this
// device, so a fixer working through several tickets on their own phone types
// it once. Saved after a successful claim or outcome submit, and only on the
// ticket page: the portal runs on a shared device, where a remembered name
// would land on the next person's ticket.
//
// Kept in localStorage (the name is never needed server-side, so a cookie would
// only add it to every request). Storage can be unavailable (private mode,
// blocked site data); then the field simply starts empty.

const KEY = "rc-fixer-name";

export function getSavedFixerName() {
  try {
    return window.localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function saveFixerName(name) {
  try {
    window.localStorage.setItem(KEY, name);
  } catch {
    // Storage unavailable: the fixer types their name next time.
  }
}
