import { hallDELETE, hallGET, hallPATCH } from "../route";

type Ctx = { params: Promise<{ id: string; hallId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  return hallGET(req, ctx);
}
export async function PATCH(req: Request, ctx: Ctx) {
  return hallPATCH(req, ctx);
}
export async function DELETE(req: Request, ctx: Ctx) {
  return hallDELETE(req, ctx);
}
