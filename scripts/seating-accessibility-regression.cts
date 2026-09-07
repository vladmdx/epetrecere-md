/** In-memory component event tests. No browser, database or external requests. */
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { readFileSync } = require("node:fs");
const React = require("react");
const root = path.resolve(__dirname, "..");
const oldLoad = Module._load;
const oldFetch = global.fetch;
const oldPrompt = global.prompt;
const dictionaries = Object.fromEntries(["ro", "ru", "en"].map(locale => [locale, JSON.parse(readFileSync(path.join(root, `src/i18n/${locale}.json`), "utf8"))]));
let locale = "en", cursor = 0, hooks = [], calls = [], errors = [], state;
function t(key, args = {}) {
  const value = key.split(".").reduce((v, part) => v?.[part], dictionaries[locale]);
  assert.equal(typeof value, "string", `Missing ${locale} ${key}`);
  return value.replace(/\{(\w+)\}/g, (_, key) => String(args[key] ?? `{${key}}`));
}
Module._load = function(request, parent, isMain) {
  if (request === "react") return { ...React,
    useState(initial) { const index = cursor++; if (!(index in hooks)) hooks[index] = typeof initial === "function" ? initial() : initial; return [hooks[index], value => { hooks[index] = typeof value === "function" ? value(hooks[index]) : value; }]; },
    useRef(initial) { const index = cursor++; if (!(index in hooks)) hooks[index] = { current: initial }; return hooks[index]; },
    useMemo(fn) { return fn(); },
  };
  if (request === "@/hooks/use-locale") return { useLocale: () => ({ locale, t }) };
  if (request === "@/lib/utils") return { cn: (...args) => args.filter(Boolean).join(" ") };
  if (request.startsWith("@/components/ui/")) return new Proxy({}, { get: (_, key) => String(key) });
  if (request === "lucide-react") return new Proxy({}, { get: (_, key) => String(key) });
  if (request === "sonner") return { toast: { error: message => errors.push(message), success: () => {} } };
  return oldLoad.call(this, request, parent, isMain);
};
global.React = React; // tsx can use the classic JSX transform under this repo's preserve config.
const { SeatingView } = require("../src/components/planner/seating-view");
function reset(extra = {}) {
  hooks = []; cursor = 0; calls = []; errors = [];
  state = {
    planId: 99,
    guests: [{ id: 1, fullName: "QA Family", guestType: "family", partySize: 2, kidsCount: 1, rsvp: "accepted", group: "family" }],
    tables: [{ id: 10, name: "Small", seats: 2 }, { id: 11, name: "Large", seats: 6 }],
    seats: [], ...extra,
  };
  global.fetch = async (url, init) => {
    assert.ok(String(url).startsWith("/api/event-plans/99/"), "only same-origin owner plan API");
    calls.push({ url, ...init });
    const body = init.body ? JSON.parse(init.body) : {};
    return new Response(JSON.stringify({ assignment: { id: 100, ...body, seatNumber: null }, table: { id: 999, ...body } }), { status: 200 });
  };
}
function render() { cursor = 0; return SeatingView({ ...state, onTablesChange: tables => { state.tables = tables; }, onSeatsChange: seats => { state.seats = seats; } }); }
function nodes(node, predicate) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(child => nodes(child, predicate));
  return [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
}
function text(node) { if (node == null || typeof node === "boolean") return ""; if (Array.isArray(node)) return node.map(text).join(""); return typeof node === "object" && node ? text(node.props?.children) : String(node); }
function button(tree, label) { const found = nodes(tree, node => (node.type === "Button" || node.type === "button") && text(node) === label); assert.equal(found.length, 1, label); return found[0]; }
function dialog(tree) { const found = nodes(tree, node => node.type === "Dialog" && node.props.open); assert.equal(found.length, 1); return found[0]; }
const tick = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  try {
    reset();
    let tree = render();
    let select = nodes(tree, node => node.type === "select")[0];
    assert.equal(select.props.value, "");
    assert.equal(select.props.disabled, false);
    assert.equal(text(nodes(tree, node => node.type === "label" && node.props.htmlFor === select.props.id)[0]), "Choose a table for QA Family");
    const options = nodes(select, node => node.type === "option");
    assert.equal(options[1].props.disabled, true, "family of 3 does not fit a table of 2");
    assert.equal(options[2].props.disabled, false);
    assert.match(text(options[2]), /6 seats available/);
    select.props.onChange({ target: { value: "10" } }); await tick();
    assert.equal(calls.length, 0, "handler independently rechecks capacity");
    select.props.onChange({ target: { value: "11" } }); await tick();
    assert.deepEqual(JSON.parse(calls[0].body), { guestId: 1, tableId: 11 });
    assert.equal(state.seats[0].tableId, 11);
    assert.equal(nodes(render(), node => node.type === "select").length, 0, "assigned household leaves unseated list");
    console.log("PASS accessible keyboard/mobile select submits household assignment through existing capacity-checked API");

    reset(); tree = render();
    const draggable = nodes(tree, node => node.type === "li" && node.props.draggable)[0];
    draggable.props.onDragStart(); tree = render();
    const drop = nodes(tree, node => node.props.onDrop)[1];
    drop.props.onDrop(); await tick();
    assert.deepEqual(JSON.parse(calls[0].body), { guestId: 1, tableId: 11 });
    reset(); global.fetch = async (url, init) => { calls.push({ url, ...init }); return new Response(JSON.stringify({ code: "TABLE_FULL" }), { status: 409 }); };
    nodes(render(), node => node.type === "select")[0].props.onChange({ target: { value: "11" } }); await tick();
    assert.deepEqual(state.seats, []); assert.match(errors[0], /Large is full/);
    assert.equal(nodes(render(), node => node.type === "select")[0].props.disabled, false);
    console.log("PASS drag remains functional and server TABLE_FULL rejection does not create a local assignment");

    reset(); button(render(), t("cabinet.seating.autoSuggest")).props.onClick();
    assert.equal(calls.length, 0, "opening auto confirmation never submits");
    button(dialog(render()), t("cabinet.seating.cancel")).props.onClick();
    assert.equal(calls.length, 0); assert.equal(nodes(render(), node => node.type === "Dialog" && node.props.open).length, 0);
    button(render(), t("cabinet.seating.autoSuggest")).props.onClick();
    const confirm = button(dialog(render()), t("cabinet.seating.autoConfirmAction"));
    const first = confirm.props.onClick(); const repeated = confirm.props.onClick();
    await Promise.all([first, repeated]);
    assert.equal(calls.length, 1, "explicit confirmation only and duplicate clicks guarded");
    assert.equal(state.seats.length, 1);
    console.log("PASS auto seating requires explicit confirmation; cancel and opening are read-only; duplicate clicks guarded");

    reset({ seats: [{ id: 101, guestId: 1, tableId: 11 }] });
    nodes(render(), node => node.type === "button" && node.props["aria-label"] === t("cabinet.seating.deleteTableAria"))[1].props.onClick();
    assert.equal(calls.length, 0); assert.equal(state.tables.length, 2); assert.equal(state.seats.length, 1);
    let opened = dialog(render());
    assert.match(text(opened), /Large/);
    assert.equal(button(opened, t("cabinet.seating.cancel")).props.autoFocus, true, "safe initial focus");
    opened.props.onOpenChange(false); assert.equal(calls.length, 0);
    nodes(render(), node => node.type === "button" && node.props["aria-label"] === t("cabinet.seating.deleteTableAria"))[1].props.onClick();
    await button(dialog(render()), t("cabinet.seating.deleteTableAria")).props.onClick();
    assert.equal(calls.length, 1); assert.equal(calls[0].method, "DELETE"); assert.match(calls[0].url, /tables\/11$/);
    assert.equal(state.tables.length, 1); assert.equal(state.seats.length, 0);
    console.log("PASS table deletion requires explicit dialog confirmation and only then releases its guests");

    reset(); let finish;
    global.fetch = async () => new Promise(resolve => { finish = () => resolve(new Response(JSON.stringify({ assignment: { id: 1, guestId: 1, tableId: 11 } }))); });
    nodes(render(), node => node.type === "select")[0].props.onChange({ target: { value: "11" } });
    assert.equal(nodes(render(), node => node.type === "select")[0].props.disabled, true);
    assert.equal(button(render(), t("cabinet.seating.autoSuggest")).props.disabled, true);
    finish(); await tick();
    for (locale of ["ro", "ru", "en"]) {
      reset(); tree = render();
      assert.ok(text(nodes(tree, node => node.type === "select")[0]).includes(t("cabinet.seating.assignToTable")));
      button(tree, t("cabinet.seating.autoSuggest")).props.onClick();
      assert.ok(text(dialog(render())).includes(t("cabinet.seating.autoConfirmTitle")));
      assert.ok(text(dialog(render())).includes(t("cabinet.seating.autoConfirmAction")));
    }
    console.log("PASS pending assignment disables conflicting controls and all new controls/dialogs localize in RO/RU/EN");

    global.prompt = () => "Renamed table";
    function mutationHandlers() {
      const tree = render();
      const select = nodes(tree, node => node.type === "select")[0];
      const remove = nodes(tree, node => node.props?.["aria-label"] === t("cabinet.seating.removeGuestAria"))[0];
      const add = nodes(tree, node => node.type === "button" && text(node).includes(t("cabinet.seating.shapes.round")))[0];
      const rename = button(tree, "Large");
      nodes(tree, node => node.type === "button" && text(node).includes(t("cabinet.seating.customTableHint")))[0].props.onClick();
      nodes(render(), node => node.props?.id === "custom-name")[0].props.onChange({ target: { value: "QA custom" } });
      const custom = button(dialog(render()), t("cabinet.seating.addTableSubmit"));
      dialog(render()).props.onOpenChange(false);
      button(render(), t("cabinet.seating.autoSuggest")).props.onClick();
      const auto = button(dialog(render()), t("cabinet.seating.autoConfirmAction"));
      dialog(render()).props.onOpenChange(false);
      nodes(render(), node => node.type === "button" && node.props["aria-label"] === t("cabinet.seating.deleteTableAria"))[1].props.onClick();
      const deletion = button(dialog(render()), t("cabinet.seating.deleteTableAria"));
      dialog(render()).props.onOpenChange(false);
      return {
        assign: () => select.props.onChange({ target: { value: "11" } }),
        unassign: remove.props.onClick,
        add: add.props.onClick,
        custom: custom.props.onClick,
        rename: rename.props.onClick,
        auto: auto.props.onClick,
        delete: deletion.props.onClick,
      };
    }
    for (const firstKind of ["assign", "unassign", "add", "custom", "rename", "auto", "delete"]) {
      reset({ guests: [
        { id: 1, fullName: "QA Family", guestType: "family", partySize: 2, kidsCount: 1, rsvp: "accepted" },
        { id: 2, fullName: "QA Seated", partySize: 1, rsvp: "accepted" },
      ], seats: [{ id: 102, guestId: 2, tableId: 10 }] });
      const actions = mutationHandlers();
      let complete;
      global.fetch = (url, init) => {
        calls.push({ url, ...init });
        return new Promise(resolve => { complete = () => resolve(new Response(JSON.stringify({
          table: { id: 999, name: "New", seats: 10 }, assignment: { id: 100, guestId: 1, tableId: 11 },
        }))); });
      };
      const firstPending = actions[firstKind]();
      assert.equal(calls.length, 1, `${firstKind} starts one request`);
      const busyTree = render();
      assert.equal(nodes(busyTree, node => node.type === "select")[0].props.disabled, true);
      assert.equal(button(busyTree, t("cabinet.seating.autoSuggest")).props.disabled, true);
      assert.equal(nodes(busyTree, node => node.type === "button" && text(node).includes(t("cabinet.seating.customTableHint")))[0].props.disabled, true);
      for (const key of [t("cabinet.seating.removeGuestAria"), t("cabinet.seating.deleteTableAria")]) {
        assert.ok(nodes(busyTree, node => node.props?.["aria-label"] === key).every(node => node.props.disabled));
      }
      assert.equal(button(busyTree, "Large").props.disabled, true);
      for (const action of Object.values(actions)) await action();
      assert.equal(calls.length, 1, `${firstKind} synchronously blocks all 7 mutation handlers, even pre-render click closures`);
      complete(); await firstPending; await tick();
      assert.equal(button(render(), t("cabinet.seating.autoSuggest")).props.disabled, state.seats.some(seat => seat.guestId === 1));
    }
    reset({ seats: [{ id: 102, guestId: 1, tableId: 11 }] });
    global.fetch = async () => { throw Error("Network interrupted"); };
    await nodes(render(), node => node.props?.["aria-label"] === t("cabinet.seating.removeGuestAria"))[0].props.onClick();
    assert.equal(state.seats.length, 1, "failed unassign keeps prior seat");
    assert.equal(errors[0], t("cabinet.seating.err.release"));
    assert.equal(nodes(render(), node => node.props?.["aria-label"] === t("cabinet.seating.removeGuestAria"))[0].props.disabled, false);
    console.log("PASS every table/seat write serializes against all 7 handlers; network-failed unassign preserves state and unlocks controls");
    for (const [value, valid] of [["1", true], ["30", true], ["0", false], ["31", false], ["1.5", false]]) {
      reset();
      nodes(render(), node => node.type === "button" && text(node).includes(t("cabinet.seating.customTableHint")))[0].props.onClick();
      nodes(render(), node => node.props?.id === "custom-name")[0].props.onChange({ target: { value: "QA custom" } });
      nodes(render(), node => node.props?.id === "custom-seats")[0].props.onChange({ target: { value } });
      await button(dialog(render()), t("cabinet.seating.addTableSubmit")).props.onClick();
      assert.equal(calls.length, valid ? 1 : 0, `custom seats ${value}`);
      if (valid) assert.equal(JSON.parse(calls[0].body).seats, Number(value));
      else assert.equal(errors[0], t("cabinet.seating.err.seatsRange"));
    }
    console.log("PASS custom table UI accepts integers 1/30 and rejects 0/31/fractions before request");
    for (const shape of ["round", "rectangular", "long"]) {
      reset();
      const quick = nodes(render(), node => node.type === "button" && text(node).includes(t(`cabinet.seating.shapes.${shape}`)))[0];
      await quick.props.onClick();
      assert.equal(JSON.parse(calls[0].body).shape, shape, "quick-add sends explicit shape");
      reset();
      nodes(render(), node => node.type === "button" && text(node).includes(t("cabinet.seating.customTableHint")))[0].props.onClick();
      nodes(render(), node => node.props?.id === "custom-name")[0].props.onChange({ target: { value: "QA shaped table" } });
      button(dialog(render()), t(`cabinet.seating.shapesShort.${shape}`)).props.onClick();
      await button(dialog(render()), t("cabinet.seating.addTableSubmit")).props.onClick();
      assert.equal(JSON.parse(calls[0].body).shape, shape);
      const saved = JSON.parse(JSON.stringify(state.tables));
      reset({ tables: saved });
      const visuals = nodes(render(), node => node.props?.["data-table-shape"]);
      assert.equal(visuals.at(-1).props["data-table-shape"], shape, "reload uses persisted shape with identical seat count");
      assert.match(visuals.at(-1).props.className, shape === "round" ? /h-14 w-14 rounded-full/ : shape === "rectangular" ? /h-14 w-20 rounded-lg/ : /h-12 w-20 rounded-lg/);
    }
    reset({ tables: [{ id: 10, name: "Legacy small", seats: 12, shape: null }, { id: 11, name: "Legacy large", seats: 13 }] });
    const beforeLegacyRender = JSON.stringify(state.tables);
    assert.deepEqual(nodes(render(), node => node.props?.["data-table-shape"]).map(node => node.props["data-table-shape"]), ["round", "long"]);
    assert.equal(JSON.stringify(state.tables), beforeLegacyRender, "legacy rendering does not backfill/modify stored preferences");
    console.log("PASS quick/custom shape payloads and persisted reload renderer; NULL/omitted shapes retain exact old visuals");
    const source = readFileSync(path.join(root, "src/components/planner/seating-view.tsx"), "utf8");
    assert.doesNotMatch(source, /\b(?:window\.)?confirm\s*\(/, "no blocking native confirmation remains");
  } finally { Module._load = oldLoad; global.fetch = oldFetch; global.prompt = oldPrompt; }
})().catch(error => { console.error(error); process.exitCode = 1; });
