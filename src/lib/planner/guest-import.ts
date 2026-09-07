/** Browser-side parsing only. Saving still uses the owner-checked, encrypted
 * guest API. Never send invitations or include spreadsheet values in errors. */
// CSV must not coerce phone strings into numbers (leading 0 / + are data).
// Shared with the byte-level regression so it exercises the real UI options.
export const GUEST_IMPORT_WORKBOOK_OPTIONS = { type: "array", raw: true } as const;

export interface ImportedGuest {
  fullName: string;
  guestType: "single" | "couple" | "family";
  partySize: number;
  kidsCount: number;
  plusOnes: number;
  rsvp: "pending" | "accepted" | "declined" | "maybe";
  phone?: string;
  email?: string;
  group?: string;
  dietary?: string;
  notes?: string;
}

const HEADERS = {
  fullName: ["Name", "Nume", "Имя", "FullName", "Full Name"],
  guestType: ["Type", "Tip", "Тип", "guestType"],
  partySize: ["Adults", "Adulți", "Взрослые", "partySize"],
  kidsCount: ["Children", "Copii", "Дети", "kidsCount"],
  plusOnes: ["Plus ones", "Însoțitori", "Дополнительные гости", "plusOnes", "+1"],
  phone: ["Phone", "Telefon", "Телефон", "Tel"],
  email: ["Email", "E-mail"],
  group: ["Group", "Grup", "Группа"],
  rsvp: ["RSVP"],
  dietary: ["Allergies / dietary preferences", "Alergii / preferințe alimentare", "Аллергии / пищевые предпочтения", "Dietary"],
  notes: ["Notes", "Notițe", "Примечания"],
} as const;

function key(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().trim().replace(/[\s_-]+/g, "");
}

export class GuestImportError extends Error {
  constructor(public row: number, public field: keyof typeof HEADERS) {
    super(`Invalid guest import row ${row}, field ${field}`);
    this.name = "GuestImportError";
  }
}

/** Parse every row BEFORE posting any. Invalid counts/types fail the file
 * rather than silently reducing a family to a single guest. Blank rows skip. */
export function parseGuestImportRows(rows: ReadonlyArray<Record<string, unknown>>): ImportedGuest[] {
  return rows.flatMap((row, index) => {
    const cells = new Map(Object.entries(row).map(([header, value]) => [key(header), value == null ? "" : String(value).trim()]));
    if (![...cells.values()].some(Boolean)) return [];
    const get = (field: keyof typeof HEADERS) => {
      for (const alias of HEADERS[field]) {
        const value = cells.get(key(alias));
        if (value != null && value !== "") return value;
      }
      return "";
    };
    const invalid = (field: keyof typeof HEADERS): never => { throw new GuestImportError(index + 2, field); };
    const integer = (field: "partySize" | "kidsCount" | "plusOnes", fallback: number, min: number, max: number) => {
      const raw = get(field);
      if (!raw) return fallback;
      if (!/^\d+$/.test(raw)) return invalid(field);
      const number = Number(raw);
      if (!Number.isSafeInteger(number) || number < min || number > max) return invalid(field);
      return number;
    };
    const fullName = get("fullName");
    if (!fullName || fullName.length > 120) return invalid("fullName");
    const types: Record<string, ImportedGuest["guestType"]> = {
      single: "single", singleperson: "single", singura: "single", singurapersoana: "single", одинчеловек: "single", одна: "single",
      couple: "couple", cuplu: "couple", пара: "couple",
      family: "family", familie: "family", семья: "family",
    };
    const rawType = get("guestType");
    const explicitType = rawType && Object.prototype.hasOwnProperty.call(types, key(rawType)) ? types[key(rawType)] : undefined;
    if (rawType && !explicitType) return invalid("guestType");
    const partySize = integer("partySize", explicitType === "couple" || explicitType === "family" ? 2 : 1, 1, 8);
    const guestType = explicitType ?? (partySize === 1 ? "single" : partySize === 2 ? "couple" : "family");
    if ((guestType === "single" && partySize !== 1) || (guestType === "couple" && partySize !== 2) || (guestType === "family" && partySize < 2)) {
      return invalid("partySize");
    }
    const statuses: Record<string, ImportedGuest["rsvp"]> = {
      pending: "pending", inasteptare: "pending", neconfirmat: "pending", unconfirmed: "pending", вожидании: "pending", неподтверждено: "pending",
      accepted: "accepted", confirmed: "accepted", confirmat: "accepted", подтверждено: "accepted",
      declined: "declined", refuzat: "declined", отклонено: "declined",
      maybe: "maybe", posibil: "maybe", возможно: "maybe",
    };
    const rawRsvp = get("rsvp");
    const rsvp = !rawRsvp ? "pending" : Object.prototype.hasOwnProperty.call(statuses, key(rawRsvp)) ? statuses[key(rawRsvp)] : undefined;
    if (!rsvp) return invalid("rsvp");
    return [{ fullName, guestType, partySize, kidsCount: integer("kidsCount", 0, 0, 20),
      plusOnes: integer("plusOnes", 0, 0, 20), rsvp,
      phone: get("phone") || undefined, email: get("email") || undefined,
      group: get("group") || undefined, dietary: get("dietary") || undefined, notes: get("notes") || undefined }];
  });
}
