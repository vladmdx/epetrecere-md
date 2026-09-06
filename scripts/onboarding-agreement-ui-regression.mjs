/** Isolated real-hook/card browser regression. All HTTP legal responses and
 * signatures are synthetic; no account, contract or production row is used. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "@playwright/test";

const root = resolve(import.meta.dirname, "..");
const fixture = subjectType => ({ subjectType, locale: "ro", acceptedAt: "2026-09-06T17:00:00.000Z",
  signatureName: "Synthetic Partner", representativeRole: null,
  identity: { partnerType: "individual", legalName: "Synthetic Partner", idNumber: "SYNTHETIC-ONLY", legalAddress: "Synthetic legal address 1", representativeName: null },
  documents: Array.from({ length: subjectType === "venue" ? 6 : 5 }, (_, i) => ({ id: i + 1, title: `Signed document ${i + 1}`, copyUrl: `/api/legal/accept/${i + 1}/copy` })),
});
const bundle = await build({ absWorkingDir: root, stdin: { contents: `
  import React, { StrictMode, useState } from 'react';
  import { createRoot } from 'react-dom/client';
  import { useOnboardingAgreement } from '@/hooks/use-onboarding-agreement';
  import { OnboardingAgreement } from '@/components/legal/onboarding-agreement';
  function Harness() {
    const query = new URLSearchParams(location.search);
    const [locale, setLocale] = useState(query.get('locale') || 'ro');
    window.testLocale = locale;
    const subject = query.get('subject') || 'artist';
    const agreement = useOnboardingAgreement(subject, 'synthetic-account', locale);
    const [outcome, setOutcome] = useState('');
    const [attempt, setAttempt] = useState(0);
    const source = (${fixture.toString()})(subject);
    const signature = { accepted: true, signatureName: source.signatureName, identity: source.identity,
      documents: source.documents.map(d => d.title), signatureImage: 'data:image/png;base64,c3ludGhldGlj' };
    async function submit() {
      try { await agreement.prepare(signature);
        if (query.get('fail-registration') && attempt === 0) { setAttempt(1); throw Error('synthetic_registration_failure'); }
        setOutcome('registered');
      } catch (e) { setOutcome(e.message); }
    }
    return <><button id="language" onClick={() => setLocale(locale === 'en' ? 'ru' : 'en')}>Change language</button>
      <OnboardingAgreement subjectType={subject} agreement={agreement} onChange={() => {}}/>
      <button id="submit" disabled={agreement.loading || agreement.error || !['unsigned','resumable'].includes(agreement.value?.status)} onClick={submit}>Submit fixture</button>
      <output id="outcome">{outcome}</output></>;
  }
  createRoot(document.getElementById('root')).render(<StrictMode><Harness/></StrictMode>);`, loader: "tsx", resolveDir: root },
  bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
  tsconfigRaw: { compilerOptions: { baseUrl: root, paths: { "@/*": ["./src/*"] } } },
  define: { "process.env.NODE_ENV": '"development"' }, plugins: [{ name: "isolated-context", setup(plugin) {
    plugin.onResolve({ filter: /^@\/hooks\/use-locale$/ }, () => ({ path: "locale", namespace: "test" }));
    plugin.onLoad({ filter: /^locale$/, namespace: "test" }, () => ({ contents: "export function useLocale(){return {locale:window.testLocale||'ro',t:key=>key}}", loader: "js" }));
    plugin.onResolve({ filter: /^@\/components\/shared\/locale-link$/ }, () => ({ path: "link", namespace: "test" }));
    plugin.onLoad({ filter: /^link$/, namespace: "test" }, () => ({ contents: "import React from 'react';export default function Link(props){return <a {...props}/>}", loader: "jsx", resolveDir: root }));
  } }],
});
const server = createServer((req, res) => {
  res.setHeader("Content-Type", req.url === "/bundle.js" ? "application/javascript" : "text/html; charset=utf-8");
  res.end(req.url === "/bundle.js" ? bundle.outputFiles[0].text : '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:16px}svg{height:20px;width:20px}canvas{display:block}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" });
const base = `http://127.0.0.1:${server.address().port}`;
const errors = [];
async function setup(subject, initial, options = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", error => errors.push(error.message));
  let value = initial; let posts = 0;
  await page.route("**/api/legal/accept", async route => {
    if (route.request().method() === "POST") {
      posts++;
      value = { status: "resumable", agreement: { ...fixture(subject), locale: route.request().postDataJSON().locale } };
      if (options.loseSigningResponse) return route.abort("failed");
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ onboarding: { [subject]: value } }) });
  });
  return { page, posts: () => posts, setValue: next => { value = next; } };
}
try {
  for (const subject of ["artist", "venue"]) {
    for (const locale of ["ro", "ru", "en"]) {
      const test = await setup(subject, { status: "resumable", agreement: fixture(subject) });
      const { page } = test;
      await page.goto(`${base}/?subject=${subject}&locale=${locale}`);
      await page.locator("section").waitFor();
      assert.equal(await page.locator("canvas,input").count(), 0, "Saved legal party is not editable");
      assert.equal(await page.locator('a[href$="/copy"]').count(), subject === "venue" ? 6 : 5);
      assert.ok((await page.locator("section").textContent()).includes("SYNTHETIC-ONLY"));
      assert.ok((await page.locator("section").textContent()).includes("Română"), "Contract language stays as signed");
      await page.locator("#language").click();
      await page.locator("#submit").click();
      await page.waitForFunction(() => document.querySelector("#outcome").textContent === "registered");
      await page.reload(); await page.locator("section").waitFor();
      assert.equal(test.posts(), 0, "Language change, submit and reload never re-sign saved contract");
      await page.close(); console.log(`PASS saved ${subject}/${locale}: frozen details, copies, language, submit, reload`);
    }
    for (const uncertain of [false, true]) {
      const test = await setup(subject, { status: "unsigned", agreement: null }, { loseSigningResponse: uncertain });
      await test.page.goto(`${base}/?subject=${subject}&fail-registration=1`);
      await test.page.locator("#submit").click(); await test.page.locator("section").waitFor();
      await test.page.waitForFunction(() => document.querySelector("#outcome").textContent.length > 0);
      if (uncertain) assert.notEqual(await test.page.locator("#outcome").textContent(), "registered", "Uncertain signing displays evidence before registration");
      await test.page.locator("#submit").click();
      if (uncertain) await test.page.locator("#submit").click();
      await test.page.waitForFunction(() => document.querySelector("#outcome").textContent === "registered");
      assert.equal(test.posts(), 1, "Registration retry reuses one immutable acceptance");
      await test.page.close(); console.log(`PASS retry ${subject}, uncertain response=${uncertain}`);
    }
    const blocked = await setup(subject, { status: "blocked", agreement: null });
    await blocked.page.goto(`${base}/?subject=${subject}`); await blocked.page.getByRole("alert").waitFor();
    assert.equal(await blocked.page.locator("#submit").isDisabled(), true);
    assert.equal(await blocked.page.locator("canvas").count(), 0);
    assert.equal(await blocked.page.locator('a[href="/contact"]').count(), 1);
    await blocked.page.close(); console.log(`PASS blocked ${subject}: no registration or replacement signature`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); await new Promise(done => server.close(done)); }
