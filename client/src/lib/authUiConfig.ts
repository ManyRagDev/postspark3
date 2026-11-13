import { isLocalEmailAuth } from "./localEmailAuth";

/** Presentation flags only; Supabase Auth and app_access still authorize access. */
export function resolveAuthUiConfig(config: {
  mode?: unknown;
  signupEnabled?: unknown;
  emailDeliveryEnabled?: unknown;
  localEmailOnly?: boolean;
}) {
  return {
    googleEnabled: !config.localEmailOnly && config.mode === "email-google",
    signupEnabled:
      !config.localEmailOnly &&
      config.signupEnabled === "true" &&
      config.emailDeliveryEnabled === "true",
  };
}

export function getAuthUiConfig() {
  return resolveAuthUiConfig({
    mode: import.meta.env.VITE_POSTSPARK_AUTH_MODE,
    signupEnabled: import.meta.env.VITE_POSTSPARK_SIGNUP_ENABLED,
    emailDeliveryEnabled: import.meta.env.VITE_POSTSPARK_EMAIL_DELIVERY_ENABLED,
    localEmailOnly: isLocalEmailAuth({
      development: import.meta.env.DEV,
      mode: import.meta.env.VITE_POSTSPARK_LOCAL_AUTH,
      hostname: window.location.hostname,
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    }),
  });
}
