import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Supabase Auth encodes the message twice on the OAuth redirect, so after
// URLSearchParams' own decoding it can still contain %XX sequences.
function decodeLeftovers(text) {
  if (!/%[0-9A-Fa-f]{2}/.test(text)) return text;
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

// A sign-in that Supabase Auth rejected (e.g. the admin allowlist hook) comes
// back as error params on the redirect URL. Read them before the client
// starts, because it may clear the URL while processing it.
function readAuthRedirectError() {
  for (const raw of [window.location.hash.slice(1), window.location.search.slice(1)]) {
    const params = new URLSearchParams(raw);
    if (params.get("error") || params.get("error_description")) {
      return decodeLeftovers(params.get("error_description") || params.get("error"));
    }
  }
  return null;
}

export const authRedirectError = readAuthRedirectError();

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
