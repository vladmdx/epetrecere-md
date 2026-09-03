/**
 * Signing the Legal Pack, from the app.
 *
 * The web onboarding has always posted here; the app had no way to sign at
 * all, which meant a partner could not finish registering from a phone —
 * the profile is only created after a contract exists.
 */
import { NextRequest, NextResponse } from "next/server";
import { LEGAL_PACK_VERSION } from "@/lib/legal";
import { POST as accept } from "../../../legal/accept/route";
export { GET } from "../../../legal/accept/route";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  // The already-shipped native v1 form reads and signs pack 2.0, but its
  // submission predates explicit version/document fields. Pin that legacy
  // format to 2.0, NEVER to the latest pack: a future legal update must force
  // a new explicit acceptance. Drawing + submitting is its acceptance action.
  if (body && body.packVersion === undefined && body.documents === undefined) {
    if (String(LEGAL_PACK_VERSION) !== "2.0") {
      const message = body.locale === "ru"
        ? "Условия обновлены. Прочитайте и подпишите новую версию на epetrecere.md или обновите приложение."
        : body.locale === "en"
          ? "The terms have changed. Read and sign the new version on epetrecere.md or update the app."
          : "Condițiile au fost actualizate. Citește și semnează versiunea nouă pe epetrecere.md sau actualizează aplicația.";
      return NextResponse.json({ error: message, code: "LEGAL_VERSION_REQUIRED", packVersion: LEGAL_PACK_VERSION }, { status: 409 });
    }
    body.packVersion = "2.0";
    body.accepted ??= true;
    body.documents = ["acord-parteneri", "termeni-generali", "politica-confidentialitate", "reguli-marketplace", "tarife"];
    if (body.subjectType === "venue") body.documents.splice(1, 0, "acord-locatii");
  }
  return accept(new NextRequest(req.url, { method:"POST", headers:req.headers, body:JSON.stringify(body) }));
}
