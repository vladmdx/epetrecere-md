"use client";

import { useEffect } from "react";
import type { Locale } from "@/types";
import { localizeMoldovaCity } from "@/lib/moldova-cities";
import ruPhrases from "./ui-phrases.ru.json";
import enPhrases from "./ui-phrases.en.json";

type PhraseMap = Record<string, string>;

const maps: Record<Exclude<Locale, "ro">, PhraseMap> = {
  ru: ruPhrases,
  en: enPhrases,
};

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

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function patternsFor(locale: Exclude<Locale, "ro">): PatternTranslation[] {
  const cached = patternCache.get(locale);
  if (cached) return cached;

  const patterns = Object.entries(maps[locale])
    .filter(([source]) => /\{\{\d+\}\}/.test(source))
    .map(([source, translated]) => {
      const tokens = source.match(/\{\{\d+\}\}/g) ?? [];
      const segments = source.split(/\{\{\d+\}\}/g).map(escapeRegex);
      return {
        regex: new RegExp(`^${segments.join("(.+?)")}$`, "u"),
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

  const exact = maps[locale][source];
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
    applyElement(root, locale);

    const titleSource = document.title;
    const translatedTitle = translateLegacyPhrase(titleSource, locale);
    if (translatedTitle) document.title = translatedTitle;

    const observer = new MutationObserver((mutations) => {
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
    return () => observer.disconnect();
  }, [locale]);
}
