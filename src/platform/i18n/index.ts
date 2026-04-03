import { Store } from "@tauri-apps/plugin-store"

import { dict as desktopEn } from "./en"
import { dict as desktopZh } from "./zh"
import { dict as desktopZht } from "./zht"
import { dict as desktopKo } from "./ko"
import { dict as desktopDe } from "./de"
import { dict as desktopEs } from "./es"
import { dict as desktopFr } from "./fr"
import { dict as desktopDa } from "./da"
import { dict as desktopJa } from "./ja"
import { dict as desktopPl } from "./pl"
import { dict as desktopRu } from "./ru"
import { dict as desktopAr } from "./ar"
import { dict as desktopNo } from "./no"
import { dict as desktopBr } from "./br"
import { dict as desktopBs } from "./bs"

import { dict as appEn } from "../../app/i18n/en"
import { dict as appZh } from "../../app/i18n/zh"
import { dict as appZht } from "../../app/i18n/zht"
import { dict as appKo } from "../../app/i18n/ko"
import { dict as appDe } from "../../app/i18n/de"
import { dict as appEs } from "../../app/i18n/es"
import { dict as appFr } from "../../app/i18n/fr"
import { dict as appDa } from "../../app/i18n/da"
import { dict as appJa } from "../../app/i18n/ja"
import { dict as appPl } from "../../app/i18n/pl"
import { dict as appRu } from "../../app/i18n/ru"
import { dict as appAr } from "../../app/i18n/ar"
import { dict as appNo } from "../../app/i18n/no"
import { dict as appBr } from "../../app/i18n/br"
import { dict as appBs } from "../../app/i18n/bs"

export type Locale = "en" | "zh" | "zht" | "ko" | "de" | "es" | "fr" | "da" | "ja" | "pl" | "ru" | "ar" | "no" | "br" | "bs"

// Simple flatten utility (replaces @solid-primitives/i18n flatten)
function flatten(obj: Record<string, any>, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {}
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    const value = obj[key]
    if (typeof value === "string") {
      result[fullKey] = value
    } else if (typeof value === "object" && value !== null) {
      Object.assign(result, flatten(value, fullKey))
    }
  }
  return result
}

type Dictionary = Record<string, string>

const LOCALES: readonly Locale[] = ["en", "zh", "zht", "ko", "de", "es", "fr", "da", "ja", "pl", "ru", "bs", "ar", "no", "br"]

function detectLocale(): Locale {
  if (typeof navigator !== "object") return "en"
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const language of languages) {
    if (!language) continue
    if (language.toLowerCase().startsWith("en")) return "en"
    if (language.toLowerCase().startsWith("zh")) return language.toLowerCase().includes("hant") ? "zht" : "zh"
    if (language.toLowerCase().startsWith("ko")) return "ko"
    if (language.toLowerCase().startsWith("de")) return "de"
    if (language.toLowerCase().startsWith("es")) return "es"
    if (language.toLowerCase().startsWith("fr")) return "fr"
    if (language.toLowerCase().startsWith("da")) return "da"
    if (language.toLowerCase().startsWith("ja")) return "ja"
    if (language.toLowerCase().startsWith("pl")) return "pl"
    if (language.toLowerCase().startsWith("ru")) return "ru"
    if (language.toLowerCase().startsWith("ar")) return "ar"
    if (language.toLowerCase().startsWith("no") || language.toLowerCase().startsWith("nb") || language.toLowerCase().startsWith("nn")) return "no"
    if (language.toLowerCase().startsWith("pt")) return "br"
    if (language.toLowerCase().startsWith("bs")) return "bs"
  }
  return "en"
}

function parseLocale(value: unknown): Locale | null {
  if (!value || typeof value !== "string") return null
  if ((LOCALES as readonly string[]).includes(value)) return value as Locale
  return null
}

function parseStored(value: unknown) {
  if (typeof value !== "string") return value
  try { return JSON.parse(value) as unknown } catch { return value }
}

function pickLocale(value: unknown): Locale | null {
  const direct = parseLocale(value)
  if (direct) return direct
  if (value && typeof value === "object" && !Array.isArray(value)) return parseLocale((value as Record<string, unknown>).locale)
  return null
}

const base: Dictionary = { ...flatten(appEn), ...flatten(desktopEn) }

function build(locale: Locale): Dictionary {
  if (locale === "en") return base
  const dicts: Record<string, [Record<string, any>, Record<string, any>]> = {
    zh: [appZh, desktopZh], zht: [appZht, desktopZht], de: [appDe, desktopDe],
    es: [appEs, desktopEs], fr: [appFr, desktopFr], da: [appDa, desktopDa],
    ja: [appJa, desktopJa], pl: [appPl, desktopPl], ru: [appRu, desktopRu],
    ar: [appAr, desktopAr], no: [appNo, desktopNo], br: [appBr, desktopBr],
    bs: [appBs, desktopBs], ko: [appKo, desktopKo],
  }
  const pair = dicts[locale] ?? dicts.ko
  return { ...base, ...flatten(pair[0]), ...flatten(pair[1]) }
}

const state = {
  locale: detectLocale(),
  dict: base as Dictionary,
  init: undefined as Promise<Locale> | undefined,
}
state.dict = build(state.locale)

// Simple template resolver
function resolveTemplate(value: string, params?: Record<string, string | number>): string {
  if (!params) return value
  return value.replace(/\{\{(\w+)\}\}/g, (_, key) => String(params[key] ?? `{{${key}}}`))
}

export function t(key: string, params?: Record<string, string | number>): string {
  const value = state.dict[key] ?? key
  return resolveTemplate(value, params)
}

export function initI18n(): Promise<Locale> {
  const cached = state.init
  if (cached) return cached

  const promise = (async () => {
    const store = await Store.load("openacp.global.dat").catch(() => null)
    if (!store) return state.locale
    const raw = await store.get("language").catch(() => null)
    const value = parseStored(raw)
    const next = pickLocale(value) ?? state.locale
    state.locale = next
    state.dict = build(next)
    return next
  })().catch(() => state.locale)

  state.init = promise
  return promise
}
