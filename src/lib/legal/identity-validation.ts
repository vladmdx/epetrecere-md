import type { PartnerIdentity } from "@/lib/legal";

export const MOLDOVAN_ID_NUMBER_LENGTH = 13;

export type PartnerIdentityField =
  | "legalName"
  | "idNumber"
  | "legalAddress"
  | "representativeName";

export interface PartnerIdentityValidation {
  ok: boolean;
  fields: Partial<Record<PartnerIdentityField, true>>;
}

function normalized(raw: string | null | undefined): string {
  return (raw ?? "").trim().normalize("NFKC").replace(/\s+/gu, " ");
}

function letterWords(raw: string): string[] {
  return raw.match(/\p{L}[\p{L}\p{M}'’\-]*/gu) ?? [];
}

function isPersonNamePart(raw: string): boolean {
  return /^\p{L}[\p{L}\p{M}]*(?:['’\p{Pd}]\p{L}[\p{L}\p{M}]*)*$/u.test(raw) &&
    (raw.match(/\p{L}/gu) ?? []).length >= 2;
}

function distinctLetters(raw: string): number {
  return new Set((raw.toLocaleLowerCase().match(/\p{L}/gu) ?? [])).size;
}

/** A person's contractual identity must include at least two real name parts. */
export function isFullPersonName(raw: string | null | undefined): boolean {
  const value = normalized(raw);
  if (value.length < 5 || value.length > 200) return false;
  const words = value.split(" ");
  return words.length >= 2 && words.every(isPersonNamePart) && distinctLetters(value) >= 2;
}

/**
 * Entity names may legitimately be a single brand word. Keep this syntactic:
 * reject tiny/filler values without pretending to verify the state register.
 */
export function isOfficialEntityName(raw: string | null | undefined): boolean {
  const value = normalized(raw);
  if (value.length < 4 || value.length > 200 || /[\p{Cc}\p{Cf}]/u.test(value)) return false;
  const words = letterWords(value);
  return words.length >= 1 &&
    words.reduce((total, word) => total + (word.match(/\p{L}/gu) ?? []).length, 0) >= 4 &&
    distinctLetters(value) >= 2;
}

/** ASP forms define both Moldovan IDNP and IDNO as exactly 13 digits. */
export function isMoldovanIdNumber(raw: string | null | undefined): boolean {
  return /^\d{13}$/.test(normalized(raw));
}

/**
 * We cannot verify an address against a state registry here, but we can reject
 * blanks and filler: a usable domicile/office has meaningful letters and at
 * least two address parts (for example locality + street/number).
 */
export function isCompleteLegalAddress(raw: string | null | undefined): boolean {
  const value = normalized(raw);
  if (value.length < 10 || value.length > 300 || /[\p{Cc}\p{Cf}]/u.test(value)) return false;
  const letterCount = (value.match(/\p{L}/gu) ?? []).length;
  const words = letterWords(value)
    .map((word) => word.toLocaleLowerCase())
    .filter((word) => (word.match(/\p{L}/gu) ?? []).length >= 2);
  const hasAddressStructure = /\d/u.test(value) || /[,;]/u.test(value) ||
    /(?:^|\s)(?:str(?:ada)?|bd|bulevard|sat|raion|municipiu|улица|дом|село|район|street|road|avenue)(?:[.\s]|$)/iu.test(value);
  return letterCount >= 8 && distinctLetters(value) >= 4 &&
    words.length >= 2 && new Set(words).size >= 2 && hasAddressStructure;
}

export function validatePartnerIdentity(identity: PartnerIdentity): PartnerIdentityValidation {
  const fields: PartnerIdentityValidation["fields"] = {};
  const entity = identity.partnerType !== "individual";

  if (entity
    ? !isOfficialEntityName(identity.legalName)
    : !isFullPersonName(identity.legalName)) {
    fields.legalName = true;
  }
  if (!isMoldovanIdNumber(identity.idNumber)) fields.idNumber = true;
  if (!isCompleteLegalAddress(identity.legalAddress)) fields.legalAddress = true;
  if (entity && !isFullPersonName(identity.representativeName)) {
    fields.representativeName = true;
  }

  return { ok: Object.keys(fields).length === 0, fields };
}

export function normalizedSignerName(raw: string | null | undefined): string {
  return normalized(raw).toLocaleLowerCase();
}

export function signerMatchesIdentity(
  signatureName: string,
  identity: PartnerIdentity,
): boolean {
  const signer = identity.partnerType === "individual"
    ? identity.legalName
    : identity.representativeName;
  return isFullPersonName(signatureName) &&
    normalizedSignerName(signatureName) === normalizedSignerName(signer);
}
