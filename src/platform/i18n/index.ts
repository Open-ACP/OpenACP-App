import { Store } from "@tauri-apps/plugin-store"

// i18n utilities (replaces @solid-primitives/i18n)
type FlatDict = Record<string, string>

function flatten(obj: Record<string, any>, prefix = ""): FlatDict {
  const result: FlatDict = {}
  for (const key of Object.keys(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    const value = obj[key]
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flatten(value, path))
    } else if (typeof value === "string") {
      result[path] = value
    }
  }
  return result
}

function resolveTemplate(raw: string, params?: Record<string, string | number>): string {
  if (!params) return raw
  return raw.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = params[key]
    return val != null ? String(val) : `{{${key}}}`
  })
}

function translator(getDict: () => FlatDict, resolve: typeof resolveTemplate) {
  return (key: string, params?: Record<string, string | number>): string => {
    const dict = getDict()
    const raw = dict[key]
    if (raw == null) return key
    return resolve(raw, params)
  }
}

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


export type Locale =
  | "en"
  | "zh"
  | "zht"
  | "ko"
  | "de"
  | "es"
  | "fr"
  | "da"
  | "ja"
  | "pl"
  | "ru"
  | "ar"
  | "no"
  | "br"
  | "bs"

type Dictionary = FlatDict

const LOCALES: readonly Locale[] = [
  "en",
  "zh",
  "zht",
  "ko",
  "de",
  "es",
  "fr",
  "da",
  "ja",
  "pl",
  "ru",
  "bs",
  "ar",
  "no",
  "br",
]

function detectLocale(): Locale {
  if (typeof navigator !== "object") return "en"

  const languages = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const language of languages) {
    if (!language) continue
    if (language.toLowerCase().startsWith("en")) return "en"
    if (language.toLowerCase().startsWith("zh")) {
      if (language.toLowerCase().includes("hant")) return "zht"
      return "zh"
    }
    if (language.toLowerCase().startsWith("ko")) return "ko"
    if (language.toLowerCase().startsWith("de")) return "de"
    if (language.toLowerCase().startsWith("es")) return "es"
    if (language.toLowerCase().startsWith("fr")) return "fr"
    if (language.toLowerCase().startsWith("da")) return "da"
    if (language.toLowerCase().startsWith("ja")) return "ja"
    if (language.toLowerCase().startsWith("pl")) return "pl"
    if (language.toLowerCase().startsWith("ru")) return "ru"
    if (language.toLowerCase().startsWith("ar")) return "ar"
    if (
      language.toLowerCase().startsWith("no") ||
      language.toLowerCase().startsWith("nb") ||
      language.toLowerCase().startsWith("nn")
    )
      return "no"
    if (language.toLowerCase().startsWith("pt")) return "br"
    if (language.toLowerCase().startsWith("bs")) return "bs"
  }

  return "en"
}

function parseLocale(value: unknown): Locale | null {
  if (!value) return null
  if (typeof value !== "string") return null
  if ((LOCALES as readonly string[]).includes(value)) return value as Locale
  return null
}

function parseRecord(value: unknown) {
  if (!value || typeof value !== "object") return null
  if (Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function parseStored(value: unknown) {
  if (typeof value !== "string") return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

function pickLocale(value: unknown): Locale | null {
  const direct = parseLocale(value)
  if (direct) return direct

  const record = parseRecord(value)
  if (!record) return null

  return parseLocale(record.locale)
}

const base = flatten(desktopEn)

function build(locale: Locale): Dictionary {
  if (locale === "en") return base
  if (locale === "zh") return { ...base, ...flatten(desktopZh) }
  if (locale === "zht") return { ...base, ...flatten(desktopZht) }
  if (locale === "de") return { ...base, ...flatten(desktopDe) }
  if (locale === "es") return { ...base, ...flatten(desktopEs) }
  if (locale === "fr") return { ...base, ...flatten(desktopFr) }
  if (locale === "da") return { ...base, ...flatten(desktopDa) }
  if (locale === "ja") return { ...base, ...flatten(desktopJa) }
  if (locale === "pl") return { ...base, ...flatten(desktopPl) }
  if (locale === "ru") return { ...base, ...flatten(desktopRu) }
  if (locale === "ar") return { ...base, ...flatten(desktopAr) }
  if (locale === "no") return { ...base, ...flatten(desktopNo) }
  if (locale === "br") return { ...base, ...flatten(desktopBr) }
  if (locale === "bs") return { ...base, ...flatten(desktopBs) }
  return { ...base, ...flatten(desktopKo) }
}

const state = {
  locale: detectLocale(),
  dict: base as Dictionary,
  init: undefined as Promise<Locale> | undefined,
}

state.dict = build(state.locale)

const translate = translator(() => state.dict, resolveTemplate)

export function t(key: keyof Dictionary, params?: Record<string, string | number>) {
  return translate(key, params)
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
