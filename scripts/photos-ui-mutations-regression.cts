/** In-memory actual component event tests. No browser, database or external HTTP. */
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { readFileSync } = require("node:fs");
const React = require("react");
const root = path.resolve(__dirname, "..");
const oldLoad = Module._load, oldFetch = global.fetch, oldTimer = global.setTimeout;
const dictionaries = Object.fromEntries(["ro", "ru", "en"].map(locale => [locale, JSON.parse(readFileSync(path.join(root, `src/i18n/${locale}.json`), "utf8"))]));
let locale = "en", cursor = 0, hooks = [], calls = [], errors = [], successes = [], warnings = [];
function t(key, args = {}) {
  const value = key.split(".").reduce((v, part) => v?.[part], dictionaries[locale]);
  assert.equal(typeof value, "string", `Missing ${locale} ${key}`);
  return value.replace(/\{(\w+)\}/g, (_, key) => String(args[key] ?? `{${key}}`));
}
Module._load = function(request, parent, isMain) {
  if (request === "react") return { ...React,
    useState(initial) { const index = cursor++; if (!(index in hooks)) hooks[index] = typeof initial === "function" ? initial() : initial; return [hooks[index], value => { hooks[index] = typeof value === "function" ? value(hooks[index]) : value; }]; },
    useRef(initial) { const index = cursor++; if (!(index in hooks)) hooks[index] = { current: initial }; return hooks[index]; },
    useMemo(fn) { return fn(); }, useEffect() {},
  };
  if (request === "@/hooks/use-locale") return { useLocale: () => ({ locale, t }) };
  if (request === "@/lib/utils") return { cn: (...args) => args.filter(Boolean).join(" ") };
  if (request.startsWith("@/components/ui/")) return new Proxy({}, { get: (_, key) => String(key) });
  if (request === "lucide-react") return new Proxy({}, { get: (_, key) => String(key) });
  if (request === "sonner") return { toast: { error: message => errors.push(message), success: message => successes.push(message), warning: message => warnings.push(message) } };
  if (request === "next/navigation") return { useSearchParams: () => new URLSearchParams() };
  if (request === "@/components/shared/locale-link") return { __esModule: true, default: "Link", useLocalizedRouter: () => ({ refresh() {}, push() {} }) };
  return oldLoad.call(this, request, parent, isMain);
};
global.React = React;
const { PhotosView } = require("../src/components/planner/photos-view");
const { VenueBookingsClient } = require("../src/app/[locale]/(vendor)/dashboard/sala/rezervari/client");
const fixture = { id: 5, url: "/api/event-photos/5/asset", caption: "QA photo", isPublic: false, isApproved: false, createdAt: "2026-09-01" };
const uploadFile = new File(["QA"], "test.png", { type: "image/png" });
const response = (data, status = 200) => new Response(JSON.stringify(data), { status });
function reset() {
  hooks = [[{ ...fixture }], false, false, false, "QA draft", { current: { value: "test.png", click() {} } }, { current: false }];
  cursor = 0; calls = []; errors = []; successes = []; warnings = [];
  global.fetch = async (url, init = {}) => {
    assert.ok(String(url).startsWith("/api/event-plans/99/photos"));
    calls.push({ url, ...init });
    if (!init.method) return response({ photos: [{ ...fixture }] });
    if (init.method === "DELETE") return response({ ok: true });
    if (init.method === "PATCH") return response({ photo: { ...fixture, isPublic: true } });
    return response({ photo: { ...fixture, id: 6 } });
  };
}
function render() { cursor = 0; return PhotosView({ planId: 99 }); }
function nodes(node, predicate) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(child => nodes(child, predicate));
  return [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
}
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { for (let i = 0; i < 100 && hooks[3]; i++) await new Promise(resolve => oldTimer(resolve, 1)); assert.equal(hooks[3], false, "write lock must finish"); }
function handlers() {
  const tree = render();
  return {
    upload: () => nodes(tree, node => node.type === "input" && node.props.type === "file")[0].props.onChange({ target: { files: [uploadFile] } }),
    toggle: nodes(tree, node => node.type === "button" && node.props.title === t("planner.photos.makePublic"))[0].props.onClick,
    delete: nodes(tree, node => node.type === "button" && node.props.title === t("common.delete"))[0].props.onClick,
  };
}
function allDisabled() {
  for (const node of nodes(render(), node => ["button", "Button", "Input", "input"].includes(node.type))) assert.equal(node.props.disabled, true);
}
(async () => {
  try {
    for (const first of ["upload", "toggle", "delete"]) {
      reset(); let finish;
      global.fetch = (url, init) => { calls.push({ url, ...init }); return new Promise(resolve => { finish = () => resolve(response(first === "delete" ? { ok: true } : { photo: { ...fixture, id: first === "upload" ? 6 : 5, isPublic: true } })); }); };
      const actions = handlers(); actions[first]();
      for (const action of Object.values(actions)) action();
      assert.equal(calls.length, 1, `${first}: shared synchronous lock rejects all 3 conflicting handlers before rerender`);
      allDisabled(); finish(); await settle();
      assert.equal(hooks[6].current, false);
    }
    console.log("PASS shared synchronous upload/toggle/delete lock and disabled controls across all 9 handler combinations");

    for (const action of ["toggle", "delete"]) {
      reset(); let finishRead;
      global.fetch = async (url, init) => { calls.push({ url, ...init }); if (init.method) throw new Error("offline"); return new Promise(resolve => { finishRead = () => resolve(response({ photos: [fixture] })); }); };
      handlers()[action](); await tick();
      assert.deepEqual(hooks[0], [fixture], "optimistic state rolls back before reconciliation");
      assert.equal(calls.length, 2); assert.equal(calls[1].cache, "no-store"); allDisabled();
      finishRead(); await settle();
      assert.deepEqual(hooks[0], [fixture]); assert.equal(successes.length, 0);
      assert.equal(errors[0], t(`planner.photos.${action === "delete" ? "deleteError" : "updateError"}`));
    }
    console.log("PASS thrown network errors roll back optimism, hold lock through owner read, and never report success");

    for (const status of [409, 503]) {
      reset(); global.fetch = async (url, init) => { calls.push({ url, ...init }); return init.method ? response({ code: status === 409 ? "PHOTO_STORAGE_UNVERIFIED" : "PHOTO_ERASURE_RETRY" }, status) : response({ photos: [fixture] }); };
      handlers().delete(); await settle();
      assert.deepEqual(hooks[0], [fixture]); assert.equal(errors[0], t("planner.photos.deleteError"));
      assert.equal(warnings.length, 0); assert.equal(successes.length, 0);
    }
    console.log("PASS retryable storage failure and unverifiable legacy object keep the photo and show localized deletion error");

    for (const action of ["toggle", "delete", "upload"]) {
      reset();
      const authoritative = action === "delete" ? [] : action === "upload" ? [{ ...fixture, id: 6 }, fixture] : [{ ...fixture, isPublic: true }];
      global.fetch = async (url, init) => { calls.push({ url, ...init }); if (init.method) throw new Error("reply lost after commit"); return response({ photos: authoritative }); };
      handlers()[action](); await settle();
      assert.deepEqual(hooks[0], authoritative); assert.equal(calls.filter(call => call.method).length, 1, "never replay uncertain mutation");
      assert.equal(successes.length, 0); assert.equal(hooks[4], "QA draft"); assert.equal(hooks[5].current.value, "test.png");
    }
    console.log("PASS lost write response reconciles server state without automatic retry, false success or discarded upload draft");

    reset(); global.fetch = async (url, init) => { calls.push({ url, ...init }); throw new Error("offline"); };
    handlers().toggle(); await settle(); assert.deepEqual(hooks[0], [fixture]); assert.equal(errors.length, 1); assert.equal(hooks[6].current, false);
    reset(); handlers().upload(); await settle(); assert.equal(hooks[0].length, 2); assert.equal(hooks[4], ""); assert.equal(hooks[5].current.value, ""); assert.equal(successes[0], t("planner.photos.added"));
    reset(); handlers().toggle(); await settle(); assert.equal(hooks[0][0].isPublic, true);
    reset(); handlers().delete(); await settle(); assert.deepEqual(hooks[0], []);
    console.log("PASS failed reconciliation preserves last known snapshot and acknowledged mutations still work");

    for (const hang of ["headers", "json"]) {
      reset();
      global.setTimeout = (callback, ms, ...args) => oldTimer(callback, Math.min(ms, 5), ...args);
      global.fetch = async (url, init) => {
        calls.push({ url, ...init });
        if (!init.method) return response({ photos: [fixture] });
        return hang === "headers" ? new Promise(() => {}) : { ok: true, json: () => new Promise(() => {}) };
      };
      handlers().toggle(); await settle(); global.setTimeout = oldTimer;
      assert.deepEqual(hooks[0], [fixture]); assert.equal(calls[0].signal.aborted, true); assert.equal(calls.length, 2); assert.equal(successes.length, 0);
    }
    console.log("PASS finite deadline covers fetch headers AND JSON body before owner reconciliation");

    // Actual venue component JSX, not a duplicated selector. No effects run.
    const source = readFileSync(path.join(root, "src/app/[locale]/(vendor)/dashboard/sala/rezervari/client.tsx"), "utf8");
    const reasons = [...source.matchAll(/"(vendorSalaBookings\.decline(?:Busy|TooManyGuests|EventType|Budget|Other))"/g)].map(match => match[1]);
    assert.equal(reasons.length, 5);
    for (locale of ["ro", "ru", "en"]) {
      hooks = []; cursor = 0;
      let tree = VenueBookingsClient({ venueId: 1, venueCapacityMax: 100, initialTab: "noi", initialBookings: [], counts: { noi: 0, acceptate: 0, finalizate: 0, anulate: 0 } });
      for (const reason of reasons) {
        const select = nodes(tree, node => node.type === "Select" && reasons.includes(node.props.value))[0];
        assert.ok(select); select.props.onValueChange(reason); cursor = 0;
        tree = VenueBookingsClient({ venueId: 1, venueCapacityMax: 100, initialTab: "noi", initialBookings: [], counts: { noi: 0, acceptate: 0, finalizate: 0, anulate: 0 } });
        const selected = nodes(tree, node => node.type === "SelectValue")[0];
        assert.equal(selected.props.children, t(reason)); assert.ok(!selected.props.children.includes("vendorSalaBookings."));
        for (const item of nodes(tree, node => node.type === "SelectItem")) assert.equal(item.props.children, t(item.props.value));
      }
    }
    console.log("PASS all five venue decline reasons use existing RO/RU/EN labels in actual closed selector JSX and menu items");
  } finally { Module._load = oldLoad; global.fetch = oldFetch; global.setTimeout = oldTimer; delete global.React; }
})().catch(error => { console.error(error); process.exitCode = 1; });
