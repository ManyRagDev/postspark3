import { createClient } from "@supabase/supabase-js";
import { installLocalNetworkDiagnostics } from "./localNetworkDiagnostics";

if(import.meta.env.DEV){
  try{installLocalNetworkDiagnostics();}
  catch{console.warn("[diagnostics] Coleta local indisponível; autenticação continuará normalmente.");}
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn("[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing.");
}

export const supabase = (() => {
  if (!isSupabaseConfigured) {
    return null;
  }

  try {
    return createClient(supabaseUrl, supabaseAnonKey, {auth:{autoRefreshToken: !import.meta.env.DEV}});
  } catch (error) {
    console.error("[Supabase] Failed to initialize client:", error);
    return null;
  }
})();
