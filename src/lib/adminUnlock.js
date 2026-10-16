// /admin re-lock: an admin's login stays valid on /queue, but once an admin
// session opens /queue, getting back into /admin takes a fresh "Continue with
// Google". This guards the admin pages on a shared front-desk device; the
// session itself (and RLS) still treats the user as an admin.
//
// Kept in localStorage so other tabs in the same browser share it. Storage can
// be unavailable (private mode, blocked site data); then /admin simply asks
// for a sign-in each time.

const KEY = "rc-admin-unlocked";

export function isAdminUnlocked() {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function unlockAdmin() {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    // Storage unavailable: /admin will ask for a sign-in next time.
  }
}

export function lockAdmin() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
}
