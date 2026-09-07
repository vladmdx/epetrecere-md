/** Real API and extracted real submit callback, no browser/network/storage/DB. */
/* eslint-disable @typescript-eslint/no-require-imports -- isolated CommonJS loader mocks */
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { readFileSync } = require("node:fs");
const ts = require("typescript");
const project = path.resolve(__dirname, "..");
const MAX = 4 * 1024 * 1024;
const originalLoad = Module._load;
const originalFetch = global.fetch;
let access = true, processed = [];
global.fetch = async () => { throw Error("External network is forbidden"); };
const db = {
  select() {
    const q = { from() { return q; }, where() { return q; }, limit: async () => [{ id: 99, enabled: true, openAt: null, closeAt: null, shotLimit: null }] };
    return q;
  },
  insert() { throw Error("No database writes permitted in this test"); },
};
Module._load = function(request, parent, isMain) {
  let resolved; try { resolved = Module._resolveFilename(request, parent); } catch {}
  if (request === "@/lib/db" || resolved === path.join(project, "src/lib/db/index.ts")) return { db };
  if (request === "@/lib/moments/access" || resolved === path.join(project, "src/lib/moments/access.ts")) return { requestHasMomentsAccess: () => access };
  if (request === "@/lib/rate-limit" || resolved === path.join(project, "src/lib/rate-limit.ts")) return { rateLimit: async () => ({ success: true }) };
  if (request === "sharp") return bytes => {
    processed.push(bytes.length);
    const q = { rotate() { return q; }, resize() { return q; }, webp() { return q; }, toBuffer: async () => { throw Error("Synthetic processing stop, never store a file"); } };
    return q;
  };
  return originalLoad.call(this, request, parent, isMain);
};

function uploadRequest(size, { consent = true, type = "image/jpeg" } = {}) {
  const data = new FormData();
  data.append("file", new File([new Uint8Array(size)], "fixture.jpg", { type }));
  data.append("guestName", "Synthetic QA"); data.append("deviceId", "qa-device");
  data.append("rightsConfirmed", String(consent)); data.append("subjectCapacity", "adult");
  return new Request("https://example.invalid/api/moments/qa/upload", { method: "POST", body: data });
}

const source = readFileSync(path.join(project, "src/app/[locale]/(public)/moments/[slug]/client.tsx"), "utf8");
const tree = ts.createSourceFile("client.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let submit;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "handleSubmit") submit = node.getText(tree);
  ts.forEachChild(node, visit);
}
visit(tree); assert.ok(submit);
const compiledSubmit = ts.transpileModule(submit, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
async function runSubmit(files, overrides = {}) {
  const result = { requests: [], errors: [], prepared: [], busy: [], cleared: false };
  const context = {
    files, guestName: "QA", guestMessage: "", rightsConfirmed: true, subjectCapacity: "adult",
    limitReached: false, shotLimit: null, remainingShots: null, vintage: false,
    slug: "qa", deviceId: "qa-device", currentPrompt: null, tableLabel: null,
    File, FormData, Error,
    setError: value => result.errors.push(value), t: key => key,
    setUploading: value => result.busy.push(value),
    applyVintage: async file => { result.prepared.push(file.name); return file; },
    fetch: async (_url, options) => {
      result.requests.push({ file: options.body.get("file"), preparedBeforeSend: result.prepared.length });
      return Response.json({ id: result.requests.length, url: "https://example.invalid/synthetic.jpg" });
    },
    setState: () => {}, setFiles: () => { result.cleared = true; }, setGuestMessage: () => {},
    setRightsConfirmed: () => {}, setDone: () => {}, setTimeout: () => {},
    ...overrides,
  };
  const execute = new Function(...Object.keys(context), `${compiledSubmit}; return handleSubmit;`)(...Object.values(context));
  await execute({ preventDefault() {} });
  return result;
}

(async () => {
  try {
    const route = require("../src/app/api/moments/[slug]/upload/route");
    const params = { params: Promise.resolve({ slug: "qa" }) };
    for (const size of [1, MAX - 1, MAX]) {
      processed = [];
      const res = await route.POST(uploadRequest(size), params);
      assert.equal(res.status, 400); assert.deepEqual(processed, [size]);
      assert.equal((await res.json()).error, "Image could not be processed");
    }
    processed = [];
    const oversized = await route.POST(uploadRequest(MAX + 1), params);
    assert.equal(oversized.status, 413); assert.equal((await oversized.json()).code, "PHOTO_TOO_LARGE");
    assert.deepEqual(processed, []);
    assert.equal((await route.POST(uploadRequest(0), params)).status, 400);
    assert.equal((await route.POST(uploadRequest(2, { type: "text/plain" }), params)).status, 400);
    assert.deepEqual(processed, []);
    console.log("PASS guest API accepts size boundaries through processing and rejects 4 MiB + 1 with 413/code before processing or storage");

    access = false;
    assert.equal((await route.POST(uploadRequest(MAX + 1), params)).status, 401);
    access = true;
    assert.equal((await route.POST(uploadRequest(MAX + 1, { consent: false }), params)).status, 400);
    console.log("PASS access and required consent still run unchanged before the size gate");

    const small = new File(["small"], "small.jpg", { type: "image/jpeg" });
    const large = new File([new Uint8Array(MAX + 1)], "large.jpg", { type: "image/jpeg" });
    const exact = new File([new Uint8Array(MAX)], "exact.jpg", { type: "image/jpeg" });
    const raw = await runSubmit([small, large]);
    assert.equal(raw.requests.length, 0); assert.equal(raw.errors.at(-1), "moments.errTooLarge"); assert.equal(raw.cleared, false);
    console.log("PASS later oversized selection stops the entire real UI batch before any POST");

    const expanded = await runSubmit([small, exact], { vintage: true, applyVintage: async file => file.name === "exact.jpg" ? large : file });
    assert.equal(expanded.requests.length, 0); assert.equal(expanded.errors.at(-1), "moments.errTooLarge");
    assert.equal(expanded.cleared, false); assert.equal(expanded.busy.at(-1), false);
    const valid = await runSubmit([small, exact], { vintage: true });
    assert.equal(valid.requests.length, 2); assert.ok(valid.requests.every(item => item.preparedBeforeSend === 2));
    assert.equal(valid.cleared, true);
    console.log("PASS all vintage results are checked before first POST; exact 4 MiB remains accepted");

    for (const response of [new Response("payload too large", { status: 413 }), Response.json({ code: "PHOTO_TOO_LARGE" }, { status: 400 })]) {
      const result = await runSubmit([small], { fetch: async () => response });
      assert.equal(result.errors.at(-1), "moments.errTooLarge"); assert.equal(result.cleared, false);
    }
    for (const locale of ["ro", "ru", "en"]) {
      const moments = JSON.parse(readFileSync(path.join(project, `src/i18n/${locale}.json`), "utf8")).moments;
      assert.match(moments.fileHint, /4/); assert.doesNotMatch(moments.fileHint, /10/); assert.ok(moments.errTooLarge);
    }
    console.log("PASS platform/server size errors localize, preserve selection and all three hints say 4 MB");
    console.log("5 guest Moments upload-limit groups passed; zero external operations");
  } finally { Module._load = originalLoad; global.fetch = originalFetch; }
})().catch(error => { console.error(error); process.exitCode = 1; });
