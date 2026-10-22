import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en.json";
import sv from "@/locales/sv.json";

const resources = {
  en: { translation: en },
  sv: { translation: sv },
};

const instance = i18n.use(initReactI18next);
void instance.init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
