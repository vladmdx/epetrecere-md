/**
 * Signing the Legal Pack, from the app.
 *
 * The web onboarding has always posted here; the app had no way to sign at
 * all, which meant a partner could not finish registering from a phone —
 * the profile is only created after a contract exists.
 */
import { NextRequest } from "next/server";
import { POST as accept } from "../../../legal/accept/route";
export { GET } from "../../../legal/accept/route";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  // The already-shipped native v1 form reads and signs pack 2.0, but its
  // submission predates explicit version/document fields. Pin that legacy
  // format to 2.0, NEVER to the latest pack: a future legal update must force
  // a new explicit acceptance. Drawing + submitting is its acceptance action.
  if (body && body.packVersion === undefined && body.documents === undefined) {
    body.packVersion = "2.0";
    body.accepted ??= true;
    body.documents = ["acord-parteneri", "termeni-generali", "politica-confidentialitate", "reguli-marketplace", "tarife"];
    if (body.subjectType === "venue") body.documents.splice(1, 0, "acord-locatii");
  }
  return accept(new NextRequest(req.url, { method:"POST", headers:req.headers, body:JSON.stringify(body) }));
}
