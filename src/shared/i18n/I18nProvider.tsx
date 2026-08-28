import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  normalizeLocale,
  translate,
  type Locale,
  type TranslationKey,
  type TranslationVariables,
  type Translator
} from './messages'

interface I18nValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: Translator
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [locale, setLocale] = useState<Locale>(readStoredLocale)
  const t = useCallback(
    (key: TranslationKey, variables?: TranslationVariables) => translate(locale, key, variables),
    [locale]
  )

  useEffect(() => {
    document.documentElement.lang = locale
    document.title = translate(locale, 'app.windowTitle')
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    } catch {
      // Persistence is optional when browser storage is unavailable.
    }
  }, [locale])

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside I18nProvider')
  return value
}

function readStoredLocale(): Locale {
  try {
    return normalizeLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY))
  } catch {
    return DEFAULT_LOCALE
  }
}
