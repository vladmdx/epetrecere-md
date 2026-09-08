/** Isolated browser regression for the real signing components, without accounts or API writes. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "@playwright/test";

const root = resolve(import.meta.dirname, "..");
const labels = {};
for (const locale of ["ro", "ru", "en"]) {
  labels[locale] = JSON.parse(await readFile(resolve(root, `src/i18n/${locale}.json`), "utf8")).legal;
}
const result = await build({
  absWorkingDir: root,
  stdin: {
    contents: `import React, { StrictMode, useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { ESignature } from '@/components/legal/e-signature';
      function Harness() {
        const [value, setValue] = useState(null);
        const [visible, setVisible] = useState(true);
        const [showValidation, setShowValidation] = useState(false);
        return <><button id="toggle-form" onClick={() => setVisible(!visible)}>Toggle form</button>
          <button id="show-validation" onClick={() => setShowValidation(true)}>Validate</button>
          {visible && <ESignature subjectType={new URLSearchParams(location.search).get('subject')} onChange={setValue} showValidation={showValidation}/>}
          <output id="result">{JSON.stringify(value)}</output></>;
      }
      createRoot(document.getElementById('root')).render(<StrictMode><Harness/></StrictMode>);`,
    resolveDir: root,
    loader: "tsx",
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  tsconfigRaw: { compilerOptions: { baseUrl: root, paths: { "@/*": ["./src/*"] }, jsx: "react-jsx" } },
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{
    name: "standalone-navigation-and-locale",
    setup(plugin) {
      plugin.onResolve({ filter: /^@\/hooks\/use-locale$/ }, () => ({ path: "locale", namespace: "test" }));
      plugin.onLoad({ filter: /^locale$/, namespace: "test" }, () => ({
        contents: `const labels = ${JSON.stringify(labels)};
          export function useLocale() { const locale = new URLSearchParams(location.search).get('locale') || 'ro';
            return {locale, t: key => labels[locale][key.replace('legal.', '')] || key}; }`,
        loader: "js",
      }));
      plugin.onResolve({ filter: /^@\/components\/shared\/locale-link$/ }, () => ({ path: "link", namespace: "test" }));
      plugin.onLoad({ filter: /^link$/, namespace: "test" }, () => ({
        contents: "import React from 'react'; export default function Link(props) { return <a {...props}/>; }",
        loader: "jsx",
        resolveDir: root,
      }));
    },
  }],
});

const server = createServer((request, response) => {
  if (request.url === "/bundle.js") {
    response.setHeader("Content-Type", "application/javascript");
    response.end(result.outputFiles[0].text);
    return;
  }
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:24px}svg{height:20px;width:20px}canvas{display:block}input:not([type=checkbox]){display:block}#result{display:none}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" });
const address = server.address();
const errors = [];
const words = {
  ro: { expand: "Deschide toate secțiunile", accept: "Am citit și sunt de acord" },
  ru: { expand: "Открыть все разделы", accept: "Я прочитал(а) и согласен(на)" },
  en: { expand: "Open all sections", accept: "I have read and agree" },
};

async function signingValue(page) {
  return JSON.parse(await page.locator("#result").textContent());
}

async function drawSignature(page) {
  const canvas = page.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 10, box.y + 60);
  await page.mouse.down();
  for (let i = 1; i <= 35; i += 1) {
    await page.mouse.move(box.x + 10 + i * 4, box.y + 65 + Math.sin(i / 2) * 30);
  }
  await page.mouse.up();
}

async function assertFieldError(input, expected = true) {
  assert.equal(await input.getAttribute("aria-invalid"), String(expected));
  const describedBy = await input.getAttribute("aria-describedby");
  if (!expected) {
    assert.equal(describedBy, null);
    return;
  }
  assert.ok(describedBy, "Invalid field points to its error message");
  const message = input.page().locator(`[id="${describedBy}"]`);
  await message.waitFor();
  assert.ok((await message.textContent()).trim().length > 0, "Field error is visible and non-empty");
}

try {
  for (const locale of ["ro", "ru", "en"]) {
    for (const subject of ["artist", "venue"]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      await page.goto(`http://127.0.0.1:${address.port}/?locale=${locale}&subject=${subject}`);
      const checkbox = page.getByRole("checkbox");
      assert.equal(await checkbox.count(), 1, "One consent checkbox is shown");
      assert.equal(await checkbox.isChecked(), false, "Consent starts unchecked");
      assert.ok((await checkbox.getAttribute("aria-describedby")), "Consent identifies the document list");
      assert.equal(await page.locator("ol a").count(), subject === "venue" ? 6 : 5);
      const preview = page.getByRole("button", { name: labels[locale].readContract, exact: true });
      assert.equal(await preview.isEnabled(), true, "Contract can be opened before completing identity");
      await preview.click();
      await page.getByRole("button", { name: words[locale].expand, exact: true }).click();
      await checkbox.check();
      assert.equal((await signingValue(page)).accepted, false, "Reading and checking cannot bypass identity or signature");

      const legalName = page.getByLabel(labels[locale].legalNameIndividual, { exact: true });
      const idNumber = page.getByLabel(labels[locale].idNumberIndividual, { exact: true });
      const legalAddress = page.getByLabel(labels[locale].legalAddressIndividual, { exact: true });
      await legalName.fill("Vlas");
      await idNumber.fill("134");
      await legalAddress.fill("Chi");
      await page.locator("#show-validation").click();
      await page.locator("[data-agreement-validation]").waitFor();
      await assertFieldError(legalName);
      await assertFieldError(idNumber);
      await assertFieldError(legalAddress);
      await assertFieldError(page.locator("canvas"));
      assert.deepEqual(
        (await signingValue(page)).validationIssues.slice(0, 3),
        ["legalName", "idNumber", "legalAddress"],
        "The photographed filler values identify all three exact fields",
      );
      await legalName.fill("Test Partner");
      await idNumber.fill("2000000000001");
      await legalAddress.fill("Bălți, str. Test 10");
      await assertFieldError(legalName, false);
      await assertFieldError(idNumber, false);
      await assertFieldError(legalAddress, false);
      assert.equal(await checkbox.isChecked(), false, "Identity edits invalidate earlier consent");
      await page.getByRole("button", { name: words[locale].expand, exact: true }).click();
      await page.getByLabel(labels[locale].fullName, { exact: true }).fill("Wrong Signer");
      await drawSignature(page);
      await assertFieldError(page.locator("canvas"), false);
      await checkbox.check();
      assert.equal((await signingValue(page)).accepted, false, "Another person's name cannot sign");
      await page.getByLabel(labels[locale].fullName, { exact: true }).fill("Test Partner");
      assert.equal((await signingValue(page)).accepted, true, "Complete matching signature is accepted");
      assert.equal((await signingValue(page)).documents.length, subject === "venue" ? 6 : 5);

      await page.getByLabel(labels[locale].legalAddressIndividual, { exact: true }).fill("Balti, Updated Street 11");
      assert.equal((await signingValue(page)).accepted, false, "Editing signed identity invalidates acceptance");
      assert.equal((await signingValue(page)).signatureImage, null, "Editing signed identity clears old signature");
      await page.getByRole("button", { name: words[locale].expand, exact: true }).click();
      await drawSignature(page);
      await checkbox.check();
      assert.equal((await signingValue(page)).accepted, true, "Contract can be reviewed and signed after an identity edit");
      await page.getByRole("button", { name: labels[locale].hideContract, exact: true }).click();
      await page.getByRole("button", { name: labels[locale].readContract, exact: true }).click();
      assert.equal((await signingValue(page)).accepted, true, "Collapsing the document preserves its review");
      await checkbox.uncheck();
      assert.equal((await signingValue(page)).accepted, false, "Revoking consent disables submission");

      await page.getByRole("button", { name: labels[locale].partnerTypeCompany, exact: true }).click();
      await page.getByLabel(labels[locale].legalNameEntity, { exact: true }).fill("Test Company SRL");
      const representative = page.getByLabel(labels[locale].representativeName, { exact: true });
      await representative.fill("Test");
      await assertFieldError(representative);
      await representative.fill("Test Manager");
      await assertFieldError(representative, false);
      await page.getByRole("button", { name: words[locale].expand, exact: true }).click();
      await drawSignature(page);
      await checkbox.check();
      assert.equal((await signingValue(page)).accepted, false, "Company needs its representative's signature");
      await page.getByLabel(labels[locale].fullName, { exact: true }).fill("Test Manager");
      assert.equal((await signingValue(page)).accepted, true, "Named representative can sign for company");
      await page.locator("#toggle-form").click();
      assert.equal((await signingValue(page)).accepted, true, "Harness preserves parent state while form is away");
      await page.locator("#toggle-form").click();
      assert.equal((await signingValue(page)).accepted, false, "Returning to a blank signing form clears stale parent acceptance");
      assert.equal((await signingValue(page)).signatureImage, null, "Remount clears the previous drawn signature");
      assert.equal((await signingValue(page)).identity.legalName, "", "Remount does not reuse the previous contracting party");
      assert.equal(await page.getByRole("checkbox").isChecked(), false, "Remounted form starts unchecked");
      console.log(`PASS ${locale}/${subject}: preview, one consent, signer validation, identity reset, re-sign, company representative, remount`);
      await page.close();
    }
  }
  assert.deepEqual(errors, [], "No React errors during signing, including StrictMode");
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
