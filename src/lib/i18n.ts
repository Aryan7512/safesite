import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import i18n, { changeLanguage } from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import en from '@/locales/en.json';
import hi from '@/locales/hi.json';

const KEY = 'safesite.lang';
export type Lang = 'en' | 'hi';

const device = (getLocales()[0]?.languageCode ?? 'en') === 'hi' ? 'hi' : 'en';

// eslint-disable-next-line import/no-named-as-default-member
i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi } },
  lng: device,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

AsyncStorage.getItem(KEY)
  .then((v) => {
    if (v === 'en' || v === 'hi') changeLanguage(v);
  })
  .catch(() => {});

export function setLanguage(lang: Lang) {
  changeLanguage(lang);
  AsyncStorage.setItem(KEY, lang).catch(() => {});
}

export function useLang() {
  const { i18n: inst } = useTranslation();
  return (inst.language === 'hi' ? 'hi' : 'en') as Lang;
}

export default i18n;
