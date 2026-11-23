import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import am from './am.json';

const savedLang = localStorage.getItem('yim:lang') ?? 'en';

i18n
  .use(initReactI18next)
  .init({
    lng: savedLang,
    fallbackLng: 'en',
    resources: {
      en: { translation: en },
      am: { translation: am },
    },
    interpolation: {
      escapeValue: false, // React already escapes
    },
  });

export default i18n;
