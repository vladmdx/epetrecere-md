/**
 * The one exchange rate the product knows about.
 *
 * The platform prices in EUR, but real Moldovan restaurant menus are printed
 * in lei, so the menu scanner has to convert what it reads. It used to ask
 * the model to "use the current approximate MDL/EUR exchange rate" — a model
 * has no FX feed, so the euro prices a venue imported (and then showed to the
 * public) came from a guess that drifted silently as the real rate moved.
 *
 * The rate now comes from here, is stated in the prompt, and is shown to the
 * venue owner so they can correct any line before publishing. Set
 * MDL_PER_EUR in the environment when it moves far enough to matter.
 */

const FALLBACK_MDL_PER_EUR = 19.5;

export function mdlPerEur(): number {
  const raw = Number(process.env.MDL_PER_EUR);
  return Number.isFinite(raw) && raw > 0 ? raw : FALLBACK_MDL_PER_EUR;
}
