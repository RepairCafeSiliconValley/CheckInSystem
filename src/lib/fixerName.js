// The fixer page (/fix/:id) remembers the last fixer name submitted on this
// device, so a fixer closing out several tickets on their own phone types it
// once. Saved only after a successful submit, and only on the fixer page:
// /queue runs on a shared device, where a remembered name would land on the
// next person's ticket.
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
