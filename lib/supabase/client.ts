import { createClient } from "@supabase/supabase-js";

export const getSupabaseConfig = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return {
    url,
    key,
    urlPresent: Boolean(url && url.length > 0),
    keyPresent: Boolean(key && key.length > 0),
  };
};

export const getSupabaseClient = () => {
  const { url, key, urlPresent, keyPresent } = getSupabaseConfig();
  if (!urlPresent || !keyPresent) return null;
  return createClient(url as string, key as string);
};
