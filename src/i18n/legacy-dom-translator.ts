"use client";

import { useEffect } from "react";
import type { Locale } from "@/types";
import { localizeMoldovaCity } from "@/lib/moldova-cities";
type PhraseMap = Record<string, string>;

/**
 * The two phrase maps are 406 KB and 296 KB of JSON. Imported statically they
 * landed in a "use client" chunk that every visitor downloaded and parsed on
 * every page — including Romanian visitors, for whom this module does nothing
 * at all. They are now fetched only for the locale that needs one, after the
 * page has painted.
 */
const maps: Partial<Record<Exclude<Locale, "ro">, PhraseMap>> = {};

async function loadPhrases(locale: Exclude<Locale, "ro">): Promise<PhraseMap> {
  const cached = maps[locale];
  if (cached) return cached;
  const mod =
    locale === "ru"
      ? await import("./ui-phrases.ru.json")
      : await import("./ui-phrases.en.json");
  const map = mod.default as PhraseMap;
  maps[locale] = map;
  return map;
}

const protectedPhrases = new Set(["Petrecere", "ePetrecere", "ePetrecere.md"]);

const manualOverrides: Record<Exclude<Locale, "ro">, PhraseMap> = {
  ru: {
    Alege: "Выберите",
    "data și locația evenimentului": "дату и место события",
    Autentificare: "Войти",
    "Confirmați": "Подтверждено",
    Preferințe: "Дополнительно",
    Planifică: "Запланировать",
  },
  en: {
    Alege: "Choose",
    "Confirmați": "Confirmed",
    "data și locația evenimentului": "the event date and location",
    Autentificare: "Sign in",
    Preferințe: "Preferences",
    Planifică: "Plan event",
  },
};

const translatedAttributes = [
  "alt",
  "aria-label",
  "aria-description",
  "placeholder",
  "title",
] as const;

const blockedParents = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE"]);

type PatternTranslation = {
  regex: RegExp;
  tokens: string[];
  translated: string;
};

const patternCache = new Map<Exclude<Locale, "ro">, PatternTranslation[]>();

const MIN_PATTERN_LITERAL = 6;

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whether a phrase carries enough text of its own to be matched by regex.
 * The harvester reduces template literals to placeholders, so `${hours}h`
 * arrived here as the "phrase" `{{1}}h{{2}}` — and `^(.+?)h(.+?)$` matches
 * every Latin string on the page. Under Russian it rewrote the first h of
 * each one into the ч of its translation: "Sign in with Google" came out as
 * "Sign in witч Google". A thin phrase is only trusted when every placeholder
 * stands as its own word ("Ora {{1}}") rather than being fused into one.
 */
function isSafePattern(source: string): boolean {
  if (source.replace(/\{\{\d+\}\}/g, "").length >= MIN_PATTERN_LITERAL) return true;
  return !/\S\{\{\d+\}\}|\{\{\d+\}\}\S/.test(source);
}

function patternsFor(locale: Exclude<Locale, "ro">): PatternTranslation[] {
  const cached = patternCache.get(locale);
  if (cached) return cached;

  const map = maps[locale];
  if (!map) return [];

  const patterns = Object.entries(map)
    .filter(([source]) => /\{\{\d+\}\}/.test(source) && isSafePattern(source))
    .map(([source, translated]) => {
      const tokens = source.match(/\{\{\d+\}\}/g) ?? [];
      const segments = source.split(/\{\{\d+\}\}/g);
      let pattern = escapeRegex(segments[0]);
      tokens.forEach((_, index) => {
        // A placeholder fused into a word stands for a compact value — `3h`,
        // `12px`, `msg-4` — never a phrase, so it must not swallow the spaces
        // around it and turn the pattern into a whole-sentence match.
        const fused =
          /[\p{L}\p{N}]$/u.test(segments[index]) ||
          /^[\p{L}\p{N}]/u.test(segments[index + 1]);
        pattern += `${fused ? "(\\S+?)" : "(.+?)"}${escapeRegex(segments[index + 1])}`;
      });
      return {
        regex: new RegExp(`^${pattern}$`, "u"),
        tokens,
        translated,
      };
    })
    .sort((a, b) => b.regex.source.length - a.regex.source.length);
  patternCache.set(locale, patterns);
  return patterns;
}

/**
 * Translate a legacy hardcoded UI phrase. New components should still use
 * `useLocale().t(...)`; this function is the compatibility layer that keeps
 * older public and dashboard screens fully localized while they are migrated.
 */
export function translateLegacyPhrase(value: string, locale: Locale): string | null {
  if (locale === "ro") return null;
  const source = normalize(value);
  if (!source) return null;
  if (protectedPhrases.has(source)) return null;

  const override = manualOverrides[locale][source];
  if (override) return override;

  const localizedCity = localizeMoldovaCity(source, locale);
  if (localizedCity !== source) return localizedCity;

  // Nothing to do until the map for this locale has arrived.
  const map = maps[locale];
  if (!map) return null;

  const exact = map[source];
  if (exact && exact !== source) return exact;

  for (const pattern of patternsFor(locale)) {
    const match = source.match(pattern.regex);
    if (!match) continue;
    const replacements = new Map<string, string>();
    pattern.tokens.forEach((token, index) => replacements.set(token, match[index + 1]));
    const translated = pattern.translated.replace(
      /\{\{\d+\}\}/g,
      (token) => replacements.get(token) ?? token,
    );
    return translated === source ? null : translated;
  }

  return null;
}

function preserveOuterWhitespace(source: string, translated: string): string {
  const leading = source.match(/^\s*/)?.[0] ?? "";
  const trailing = source.match(/\s*$/)?.[0] ?? "";
  return `${leading}${translated}${trailing}`;
}

type TranslationState = { source: string; lastApplied: string };

const textState = new WeakMap<Text, TranslationState>();
const attributeState = new WeakMap<Element, Map<string, TranslationState>>();

function shouldSkip(element: Element | null): boolean {
  if (!element) return true;
  if (blockedParents.has(element.tagName)) return true;
  if (element.closest("[data-no-auto-translate], [contenteditable='true']")) return true;
  return false;
}

function applyText(node: Text, locale: Locale) {
  if (shouldSkip(node.parentElement)) return;
  const current = node.nodeValue ?? "";
  let state = textState.get(node);

  // React may reuse a text node for a new dynamic value. Only retain the old
  // Romanian source while the DOM still contains the value we last applied.
  if (state && current !== state.lastApplied && current !== state.source) {
    textState.delete(node);
    state = undefined;
  }

  const source = state?.source ?? current;
  const translated = translateLegacyPhrase(source, locale);
  const target = locale === "ro" || !translated
    ? source
    : preserveOuterWhitespace(source, translated);

  if (!state && !translated) return;
  if (!state) {
    state = { source, lastApplied: current };
    textState.set(node, state);
  }
  if (current !== target) node.nodeValue = target;
  state.lastApplied = target;
}

function applyAttribute(element: Element, attribute: string, locale: Locale) {
  const current = element.getAttribute(attribute);
  if (!current) return;
  let states = attributeState.get(element);
  let state = states?.get(attribute);

  if (state && current !== state.lastApplied && current !== state.source) {
    states?.delete(attribute);
    state = undefined;
  }

  const source = state?.source ?? current;
  const translated = translateLegacyPhrase(source, locale);
  const target = locale === "ro" || !translated ? source : translated;
  if (!state && !translated) return;

  if (!states) {
    states = new Map();
    attributeState.set(element, states);
  }
  if (!state) {
    state = { source, lastApplied: current };
    states.set(attribute, state);
  }
  if (current !== target) element.setAttribute(attribute, target);
  state.lastApplied = target;
}

function applyElement(element: Element, locale: Locale) {
  if (shouldSkip(element)) return;
  translatedAttributes.forEach((attribute) => applyAttribute(element, attribute, locale));
  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) applyText(child as Text, locale);
    else if (child.nodeType === Node.ELEMENT_NODE) applyElement(child as Element, locale);
  }
}

/** Apply legacy translations to all rendered app surfaces and future React updates. */
export function useLegacyUiTranslation(locale: Locale) {
  useEffect(() => {
    const root = document.body;
    if (!root) return;
    document.documentElement.lang = locale;

    // Romanian is the source language: there is nothing to translate and no
    // reason to download a phrase map.
    if (locale === "ro") return;

    let cancelled = false;
    let observer: MutationObserver | null = null;

    void loadPhrases(locale).then(() => {
      if (cancelled) return;
      start();
    });

    function start() {
      applyElement(root, locale);

      const titleSource = document.title;
      const translatedTitle = translateLegacyPhrase(titleSource, locale);
      if (translatedTitle) document.title = translatedTitle;

      observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === "characterData") {
            applyText(mutation.target as Text, locale);
            continue;
          }
          if (mutation.type === "attributes") {
            const attribute = mutation.attributeName;
            if (attribute) applyAttribute(mutation.target as Element, attribute, locale);
            continue;
          }
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) applyText(node as Text, locale);
            else if (node.nodeType === Node.ELEMENT_NODE) applyElement(node as Element, locale);
          });
        }
      });
      observer.observe(root, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: [...translatedAttributes],
      });
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [locale]);
}
