import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

type LocaleMap = Record<string, string>;

const ROOTS = ["src/app", "src/components"];
const OUTPUT_RU = "src/i18n/ui-phrases.ru.json";
const OUTPUT_EN = "src/i18n/ui-phrases.en.json";
const BATCH_SIZE = 40;
const CONCURRENCY = 3;

const VISIBLE_ATTRIBUTES = new Set([
  "accent",
  "alt",
  "aria-label",
  "description",
  "emptyMessage",
  "helperText",
  "label",
  "placeholder",
  "subtitle",
  "title",
]);

const VISIBLE_PROPERTIES = new Set([
  "accent",
  "answer",
  "cta",
  "count",
  "desc",
  "description",
  "empty",
  "heading",
  "helper",
  "label",
  "message",
  "name",
  "note",
  "question",
  "secondary",
  "subtitle",
  "text",
  "title",
]);

function sourceFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === ".next") return [];
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.(tsx|jsx)$/.test(entry.name) ? [absolute] : [];
  });
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function templateValue(node: ts.TemplateExpression): string {
  let value = node.head.text;
  node.templateSpans.forEach((span, index) => {
    value += `{{${index + 1}}}${span.literal.text}`;
  });
  return normalize(value);
}

function isUseful(value: string): boolean {
  if (value.length < 2 || value.length > 700) return false;
  if (!/[A-Za-zĂÂÎȘȚăâîșțА-Яа-я]/.test(value)) return false;
  if (/^(?:https?:|\/|#|\.|[a-z-]+\/|[A-Z0-9_]+$)/.test(value)) return false;
  if (/^(?:flex|grid|block|hidden|relative|absolute|fixed|sticky)(?:\s|$)/.test(value)) return false;
  if (/\b(?:bg-|text-|border-|hover:|focus:|sm:|md:|lg:|xl:|px-|py-|mt-|mb-|gap-|rounded-)\S*/.test(value)) return false;
  return true;
}

function literalValue(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return normalize(node.text);
  }
  if (ts.isTemplateExpression(node)) return templateValue(node);
  return null;
}

function literalValues(node: ts.Node): string[] {
  const values: string[] = [];
  const visit = (child: ts.Node) => {
    const value = literalValue(child);
    if (value) {
      values.push(value);
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return values;
}

function extractPhrases(): string[] {
  const phrases = new Set<string>();
  const add = (value: string | null) => {
    if (!value) return;
    const normalized = normalize(value);
    if (isUseful(normalized)) phrases.add(normalized);
  };

  for (const file of ROOTS.flatMap(sourceFiles)) {
    const source = fs.readFileSync(file, "utf8");
    const tree = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );

    const visit = (node: ts.Node) => {
      if (ts.isJsxText(node)) add(node.text);

      if (ts.isJsxAttribute(node) && VISIBLE_ATTRIBUTES.has(node.name.getText(tree))) {
        if (node.initializer && ts.isStringLiteral(node.initializer)) add(node.initializer.text);
        if (node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression) {
          literalValues(node.initializer.expression).forEach(add);
        }
      }

      if (ts.isJsxExpression(node) && node.expression) {
        literalValues(node.expression).forEach(add);
      }

      if (ts.isPropertyAssignment(node)) {
        const property = node.name.getText(tree).replace(/["']/g, "");
        if (VISIBLE_PROPERTIES.has(property)) add(literalValue(node.initializer));
      }

      if (ts.isCallExpression(node)) {
        const callee = node.expression.getText(tree);
        if (
          /(?:toast\.(?:error|success|info|warning)|alert|confirm|setError|setMessage)$/.test(
            callee,
          )
        ) {
          add(node.arguments[0] ? literalValue(node.arguments[0]) : null);
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(tree);
  }

  return [...phrases].sort((a, b) => a.localeCompare(b, "ro"));
}

function loadMap(file: string): LocaleMap {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8")) as LocaleMap;
}

async function translateBatch(
  batch: string[],
): Promise<{ ru: string[]; en: string[] }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.I18N_MODEL || "gpt-4.1-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are the localization editor for ePetrecere.md, an event marketplace in Moldova. Translate every UI string into natural Russian and English.

Rules:
- Return strict JSON: {"items":{"0":{"ru":"...","en":"..."},"1":...}}. Include every numeric key from the input array.
- The source is usually Romanian but can contain English UI fragments. Translate either language.
- Keep ePetrecere.md, product names, people, URLs, currencies, emoji, HTML entities and technical identifiers unchanged.
- Preserve every placeholder such as {{1}}, {count}, %s exactly.
- Strings may be sentence fragments; translate them so they remain useful as fragments.
- Use concise, professional interface language suitable for Moldova.
- Do not use the long em dash character. Use punctuation or a short hyphen instead.
- Do not add explanations.`,
        },
        {
          role: "user",
          content: JSON.stringify(
            Object.fromEntries(batch.map((text, index) => [String(index), text])),
          ),
        },
      ],
    }),
  });

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenAI ${response.status}`);
  }
  const content = payload.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(content) as {
    items?: Record<string, { ru?: string; en?: string }>;
  };
  const zeroBased = batch.map((_, index) => parsed.items?.[String(index)]);
  const oneBased = batch.map((_, index) => parsed.items?.[String(index + 1)]);
  const translated = zeroBased.every((item) => item?.ru && item?.en)
    ? zeroBased
    : oneBased;
  if (translated.some((item) => !item?.ru || !item?.en)) {
    throw new Error(`Translation count mismatch: expected ${batch.length}`);
  }
  return {
    ru: translated.map((item) => item!.ru!),
    en: translated.map((item) => item!.en!),
  };
}

async function main() {
  const phrases = extractPhrases();
  const ru = loadMap(OUTPUT_RU);
  const en = loadMap(OUTPUT_EN);
  const pending = phrases.filter((phrase) => !ru[phrase] || !en[phrase]);
  const batches = Array.from(
    { length: Math.ceil(pending.length / BATCH_SIZE) },
    (_, index) => pending.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE),
  );

  console.log(
    `Extracted ${phrases.length} UI phrases; translating ${pending.length} in ${batches.length} batches.`,
  );

  let cursor = 0;
  async function translateRobust(
    batch: string[],
  ): Promise<{ ru: string[]; en: string[] }> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await translateBatch(batch);
      } catch (error) {
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
          continue;
        }
        if (batch.length === 1) throw error;
      }
    }
    const middle = Math.ceil(batch.length / 2);
    const [left, right] = await Promise.all([
      translateRobust(batch.slice(0, middle)),
      translateRobust(batch.slice(middle)),
    ]);
    return {
      ru: [...left.ru, ...right.ru],
      en: [...left.en, ...right.en],
    };
  }

  async function worker() {
    while (cursor < batches.length) {
      const index = cursor++;
      const batch = batches[index];
      const translated = await translateRobust(batch);
      batch.forEach((phrase, itemIndex) => {
        ru[phrase] = translated!.ru[itemIndex] || phrase;
        en[phrase] = translated!.en[itemIndex] || phrase;
      });
      // Persist after every successful batch so a malformed response or
      // timeout never discards completed work.
      fs.writeFileSync(OUTPUT_RU, `${JSON.stringify(ru, null, 2)}\n`);
      fs.writeFileSync(OUTPUT_EN, `${JSON.stringify(en, null, 2)}\n`);
      console.log(`Translated batch ${index + 1}/${batches.length}`);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));

  const orderedRu = Object.fromEntries(phrases.map((phrase) => [phrase, ru[phrase] || phrase]));
  const orderedEn = Object.fromEntries(phrases.map((phrase) => [phrase, en[phrase] || phrase]));
  fs.writeFileSync(OUTPUT_RU, `${JSON.stringify(orderedRu, null, 2)}\n`);
  fs.writeFileSync(OUTPUT_EN, `${JSON.stringify(orderedEn, null, 2)}\n`);
  console.log(`Wrote ${phrases.length} translations per locale.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
