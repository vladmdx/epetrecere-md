import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { artistBookingDeepLink, artistBookingTab, bookingChatErrorKey, parseBookingDeepLinkId } from "../src/lib/vendors/booking-deep-link";
import en from "../src/i18n/en.json";
import ro from "../src/i18n/ro.json";
import ru from "../src/i18n/ru.json";

const path = "src/app/[locale]/(vendor)/dashboard/rezervari/page.tsx";
const text = readFileSync(path, "utf8");
const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes: ts.Node[] = [];
function visit(node: ts.Node) { nodes.push(node); ts.forEachChild(node, visit); }
visit(source);

// Execute the component's actual callbacks with in-memory state/network
// doubles. No browser, app account, production data or external requests.
function callback(expression: string, scope: Record<string, unknown>) {
  const js = ts.transpileModule(`const handler = ${expression};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(scope), `${js}; return handler;`)(...Object.values(scope));
}
function declaration(name: string) {
  const node = nodes.find((item): item is ts.FunctionDeclaration => ts.isFunctionDeclaration(item) && item.name?.text === name);
  assert.ok(node);
  return node.getText(source);
}
const deepLinkEffect = nodes.find((node): node is ts.CallExpression => ts.isCallExpression(node)
  && node.expression.getText(source) === "useEffect" && node.arguments[0]?.getText(source).includes("artistBookingDeepLink"));
const loadDeclaration = nodes.find((node): node is ts.VariableDeclaration => ts.isVariableDeclaration(node) && node.name.getText(source) === "loadChat");
assert.ok(deepLinkEffect && loadDeclaration?.initializer && ts.isCallExpression(loadDeclaration.initializer));
const loadExpression = loadDeclaration.initializer.arguments[0].getText(source);

for (const [status, tab] of Object.entries({ pending: "active", accepted: "accepted", confirmed_by_client: "accepted", completed: "past", cancelled: "past", rejected: "past" })) {
  test(`${status} deep link selects ${tab} from the owner-scoped list`, () => {
    assert.equal(artistBookingTab(status), tab);
    assert.deepEqual(artistBookingDeepLink("257", [{ id: 257, status }]), { id: 257, tab });
  });
}

test("malformed, non-positive, unsafe, unrelated and unsupported links never resolve", () => {
  for (const value of [null, "", "0", "-1", "2.5", "NaN", "1e2", "Infinity", "9007199254740992", "257<script>"]) {
    assert.equal(parseBookingDeepLinkId(value), null);
    assert.equal(artistBookingDeepLink(value, [{ id: 257, status: "accepted" }]), null);
  }
  assert.equal(artistBookingDeepLink("258", [{ id: 257, status: "accepted" }]), null);
  assert.equal(artistBookingDeepLink("257", [{ id: 257, status: "unknown" }]), null);
});

test("actual effect waits for the owned list, selects the tab, loads history once and allows later manual tab changes", () => {
  const appliedDeepLink = { current: null };
  const loaded: number[] = [];
  const selected: string[] = [];
  const expanded: number[] = [];
  const scope = {
    appliedDeepLink, artistId: 561, expandParam: "257", loading: true,
    bookings: [] as { id: number; status: string }[], artistBookingDeepLink,
    setActiveTab: (value: string) => selected.push(value), setExpandedId: (value: number) => expanded.push(value),
    loadChat: (id: number) => loaded.push(id),
  };
  const run = () => callback(deepLinkEffect.arguments[0].getText(source), scope)();
  run();
  assert.deepEqual(loaded, []);
  scope.loading = false;
  scope.bookings = [{ id: 257, status: "accepted" }];
  run();
  assert.deepEqual({ selected, expanded, loaded }, { selected: ["accepted"], expanded: [257], loaded: [257] });
  // Chat results, a load failure, or a booking-list refresh must not retrigger
  // the link or force the artist back after selecting another tab.
  run(); run();
  assert.equal(loaded.length, 1);
  assert.equal(selected.length, 1);
  scope.expandParam = "999";
  run();
  assert.equal(loaded.length, 1);
  scope.expandParam = "257";
  run();
  assert.equal(loaded.length, 2, "navigating away then back deliberately reapplies the link");
});

test("actual chat loader stores both historical messages and distinguishes failed/loading from truly empty", async () => {
  const history = [{ id: 1, message: "Mesaj anterior [contact disponibil după confirmare]" }, { id: 2, message: "Evenimentul este pe 20.09.2026 la 14:00" }];
  let chats: Record<number, unknown[]> = {};
  let loading: Record<number, boolean> = {};
  let errors: Record<number, boolean> = {};
  const urls: string[] = [];
  const scope = {
    setChats: (update: (previous: typeof chats) => typeof chats) => { chats = update(chats); },
    setChatLoading: (update: (previous: typeof loading) => typeof loading) => { loading = update(loading); },
    setChatErrors: (update: (previous: typeof errors) => typeof errors) => { errors = update(errors); },
    fetch: async (url: string) => { urls.push(url); return { ok: true, json: async () => history }; },
  };
  await callback(loadExpression, scope)(257);
  assert.deepEqual(chats[257], history);
  assert.equal(loading[257], false);
  assert.equal(errors[257], false);
  await callback(loadExpression, { ...scope, fetch: async () => { throw new Error("offline"); } })(258);
  assert.equal(loading[258], false);
  assert.equal(errors[258], true);
  assert.equal(chats[258], undefined);
  assert.deepEqual(urls, ["/api/chat?booking_request_id=257"]);
  assert.match(text, /chatLoading\[booking\.id\]/);
  assert.match(text, /chatErrors\[booking\.id\]/);
  assert.match(text, /<Tabs value=\{activeTab\}/);
  assert.doesNotMatch(text, /<Tabs defaultValue="active"/);
});

for (const [locale, dictionary] of Object.entries({ en, ro, ru })) {
  test(`${locale}: actual inline and dialog send keep the draft and explain CONTACT_LOCKED`, async () => {
    const draft = "Contact: qa@example.invalid";
    const notices: string[] = [];
    let inlineDraft = { 257: draft };
    let dialogDraft = draft;
    let sending = false;
    let historyLoads = 0;
    const translate = (key: string) => key.split(".").reduce((value: any, part) => value?.[part], dictionary);
    const scope = {
      newMsg: inlineDraft, messageDialog: { id: 257 }, messageText: dialogDraft,
      bookingChatErrorKey, t: translate,
      toast: { error: (message: string) => notices.push(message), success: () => assert.fail("blocked message must not succeed") },
      fetch: async () => ({ ok: false, json: async () => ({ code: "CONTACT_LOCKED", error: "Romanian API fallback" }) }),
      setNewMsg: (update: (previous: typeof inlineDraft) => typeof inlineDraft) => { inlineDraft = update(inlineDraft); },
      setMessageText: (value: string) => { dialogDraft = value; },
      setMessageSending: (value: boolean) => { sending = value; },
      loadChat: async () => { historyLoads++; },
    };
    await callback(declaration("sendMessage"), scope)(257);
    await callback(declaration("sendMessageFromDialog"), scope)();
    assert.equal(inlineDraft[257], draft);
    assert.equal(dialogDraft, draft);
    assert.equal(sending, false);
    assert.equal(historyLoads, 0);
    assert.deepEqual(notices, [dictionary.vendor.bookingsPage.toastContactLocked, dictionary.vendor.bookingsPage.toastContactLocked]);
    assert.ok(notices.every(message => typeof message === "string" && message.length > 40));
  });
}

test("unknown chat errors retain their normal translation and inline timestamps use the selected locale", () => {
  for (const value of [null, {}, { error: "Oops" }, { code: "OTHER" }]) assert.equal(bookingChatErrorKey(value), "vendor.bookingsPage.toastMessageError");
  assert.match(text, /m\.senderName\} · \{formatBookingDate\(m\.createdAt, locale,/);
  assert.match(text, /canCompleteBooking\(booking\)/);
});
