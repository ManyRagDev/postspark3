import { z } from "zod";
import { assemblyVisualLanguages } from "./componentAssembly";
/** Only explicit, owner-scoped choices influence future generation. */
export const studioPreferencesSchema=z.object({
 enabled:z.boolean(),
 language:z.enum(assemblyVisualLanguages).nullable(),
 intensity:z.enum(["auto","quiet","balanced","expressive"]),
}).strict();
export type StudioPreferences=z.infer<typeof studioPreferencesSchema>;
export const defaultStudioPreferences:StudioPreferences={enabled:false,language:null,intensity:"auto"};
export function effectiveStudioPreferences(preferences:StudioPreferences,brief:string):StudioPreferences {
 // A fresh style instruction wins over saved taste, including classic family names.
 const explicit=/\b(minimal\w*|discret\w*|s[oó]bri\w*|clean|express\w*|ousad\w*|vibrante|gr[aá]fic[oa]s?|contid[oa]s?|animad[oa]s?|colorid[oa]s?|papel|janela|editorial|org[aâ]nic\w*|tipogr[aá]fic\w*|glass|brutalis\w*|scrapbook|paper|duotone|glitch|cinematic|chromatic|data.punch|sem (?:enfeites|ornamentos))\b/i.test(brief);
 return preferences.enabled&&!explicit?preferences:{...defaultStudioPreferences};
}
