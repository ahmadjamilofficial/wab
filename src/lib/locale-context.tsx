import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export const LOCALES = [
  { code: "en", label: "English", native: "English" },
  { code: "zh", label: "Chinese", native: "中文" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "fr", label: "French", native: "Français" },
  { code: "ar", label: "Arabic", native: "العربية" },
  { code: "bn", label: "Bengali", native: "বাংলা" },
  { code: "pt", label: "Portuguese", native: "Português" },
  { code: "ru", label: "Russian", native: "Русский" },
  { code: "ur", label: "Urdu", native: "اردو" },
] as const;

export type LocaleCode = (typeof LOCALES)[number]["code"];

const RTL: ReadonlySet<string> = new Set(["ar", "ur"]);
const LOCALE_KEY = "wab.locale";

const dict: Record<LocaleCode, Record<string, string>> = {
  en: {
    askWab: "Ask Wab",
    workspace: "Workspace",
    portfolio: "Portfolio",
    ledger: "Ledger",
    exceptions: "Exceptions",
    dataSources: "Data Sources",
    integrations: "Integrations",
    taxCenter: "Tax Center",
    auditTrail: "Audit Trail",
    autonomous: "Autonomous",
    activityFeed: "Activity Feed",
    reviewInbox: "Review Inbox",
    account: "Account",
    settings: "Settings",
    billing: "Billing",
    more: "More",
    accountSettings: "Account settings",
    signOut: "Sign out",
    uploadStatement: "Upload statement",
    changeLanguage: "Change language",
    language: "Language",
    expandNav: "Expand navigation",
    collapseNav: "Collapse navigation",
    openNav: "Open navigation",
    closeNav: "Close navigation",
    plan: "plan",
    basic: "BASIC",
  },
  zh: {
    askWab: "询问 Wab",
    workspace: "工作区",
    portfolio: "投资组合",
    ledger: "账本",
    exceptions: "异常",
    dataSources: "数据来源",
    integrations: "集成",
    taxCenter: "税务中心",
    auditTrail: "审计追踪",
    autonomous: "自动化",
    activityFeed: "动态",
    reviewInbox: "审核收件箱",
    account: "账户",
    settings: "设置",
    billing: "账单",
    more: "更多",
    accountSettings: "账户设置",
    signOut: "退出登录",
    uploadStatement: "上传对账单",
    changeLanguage: "更改语言",
    language: "语言",
    expandNav: "展开导航",
    collapseNav: "收起导航",
    openNav: "打开导航",
    closeNav: "关闭导航",
    plan: "套餐",
    basic: "基础",
  },
  hi: {
    askWab: "Wab से पूछें",
    workspace: "कार्यक्षेत्र",
    portfolio: "पोर्टफोलियो",
    ledger: "खाता बही",
    exceptions: "अपवाद",
    dataSources: "डेटा स्रोत",
    integrations: "एकीकरण",
    taxCenter: "कर केंद्र",
    auditTrail: "ऑडिट ट्रेल",
    autonomous: "स्वचालित",
    activityFeed: "गतिविधि",
    reviewInbox: "समीक्षा इनबॉक्स",
    account: "खाता",
    settings: "सेटिंग्स",
    billing: "बिलिंग",
    more: "और",
    accountSettings: "खाता सेटिंग्स",
    signOut: "साइन आउट",
    uploadStatement: "स्टेटमेंट अपलोड करें",
    changeLanguage: "भाषा बदलें",
    language: "भाषा",
    expandNav: "नेविगेशन खोलें",
    collapseNav: "नेविगेशन बंद करें",
    openNav: "नेविगेशन खोलें",
    closeNav: "नेविगेशन बंद करें",
    plan: "योजना",
    basic: "बेसिक",
  },
  es: {
    askWab: "Preguntar a Wab",
    workspace: "Espacio de trabajo",
    portfolio: "Cartera",
    ledger: "Libro mayor",
    exceptions: "Excepciones",
    dataSources: "Fuentes de datos",
    integrations: "Integraciones",
    taxCenter: "Centro fiscal",
    auditTrail: "Pista de auditoría",
    autonomous: "Autónomo",
    activityFeed: "Actividad",
    reviewInbox: "Bandeja de revisión",
    account: "Cuenta",
    settings: "Ajustes",
    billing: "Facturación",
    more: "Más",
    accountSettings: "Ajustes de cuenta",
    signOut: "Cerrar sesión",
    uploadStatement: "Subir extracto",
    changeLanguage: "Cambiar idioma",
    language: "Idioma",
    expandNav: "Expandir navegación",
    collapseNav: "Contraer navegación",
    openNav: "Abrir navegación",
    closeNav: "Cerrar navegación",
    plan: "plan",
    basic: "BÁSICO",
  },
  fr: {
    askWab: "Demander à Wab",
    workspace: "Espace de travail",
    portfolio: "Portefeuille",
    ledger: "Grand livre",
    exceptions: "Exceptions",
    dataSources: "Sources de données",
    integrations: "Intégrations",
    taxCenter: "Centre fiscal",
    auditTrail: "Piste d’audit",
    autonomous: "Autonome",
    activityFeed: "Activité",
    reviewInbox: "Boîte de revue",
    account: "Compte",
    settings: "Paramètres",
    billing: "Facturation",
    more: "Plus",
    accountSettings: "Paramètres du compte",
    signOut: "Se déconnecter",
    uploadStatement: "Téléverser un relevé",
    changeLanguage: "Changer de langue",
    language: "Langue",
    expandNav: "Développer la navigation",
    collapseNav: "Réduire la navigation",
    openNav: "Ouvrir la navigation",
    closeNav: "Fermer la navigation",
    plan: "offre",
    basic: "BASIC",
  },
  ar: {
    askWab: "اسأل Wab",
    workspace: "مساحة العمل",
    portfolio: "المحفظة",
    ledger: "دفتر الأستاذ",
    exceptions: "الاستثناءات",
    dataSources: "مصادر البيانات",
    integrations: "التكاملات",
    taxCenter: "مركز الضرائب",
    auditTrail: "سجل التدقيق",
    autonomous: "ذاتي",
    activityFeed: "النشاط",
    reviewInbox: "صندوق المراجعة",
    account: "الحساب",
    settings: "الإعدادات",
    billing: "الفوترة",
    more: "المزيد",
    accountSettings: "إعدادات الحساب",
    signOut: "تسجيل الخروج",
    uploadStatement: "رفع كشف",
    changeLanguage: "تغيير اللغة",
    language: "اللغة",
    expandNav: "توسيع التنقل",
    collapseNav: "طي التنقل",
    openNav: "فتح التنقل",
    closeNav: "إغلاق التنقل",
    plan: "خطة",
    basic: "أساسي",
  },
  bn: {
    askWab: "Wab-কে জিজ্ঞাসা করুন",
    workspace: "ওয়ার্কস্পেস",
    portfolio: "পোর্টফোলিও",
    ledger: "লেজার",
    exceptions: "ব্যতিক্রম",
    dataSources: "ডেটা উৎস",
    integrations: "ইন্টিগ্রেশন",
    taxCenter: "কর কেন্দ্র",
    auditTrail: "অডিট ট্রেইল",
    autonomous: "স্বয়ংক্রিয়",
    activityFeed: "কার্যকলাপ",
    reviewInbox: "রিভিউ ইনবক্স",
    account: "অ্যাকাউন্ট",
    settings: "সেটিংস",
    billing: "বিলিং",
    more: "আরও",
    accountSettings: "অ্যাকাউন্ট সেটিংস",
    signOut: "সাইন আউট",
    uploadStatement: "স্টেটমেন্ট আপলোড",
    changeLanguage: "ভাষা পরিবর্তন",
    language: "ভাষা",
    expandNav: "নেভিগেশন খুলুন",
    collapseNav: "নেভিগেশন বন্ধ",
    openNav: "নেভিগেশন খুলুন",
    closeNav: "নেভিগেশন বন্ধ",
    plan: "প্ল্যান",
    basic: "বেসিক",
  },
  pt: {
    askWab: "Perguntar ao Wab",
    workspace: "Espaço de trabalho",
    portfolio: "Carteira",
    ledger: "Razão",
    exceptions: "Exceções",
    dataSources: "Fontes de dados",
    integrations: "Integrações",
    taxCenter: "Centro fiscal",
    auditTrail: "Trilha de auditoria",
    autonomous: "Autônomo",
    activityFeed: "Atividade",
    reviewInbox: "Caixa de revisão",
    account: "Conta",
    settings: "Definições",
    billing: "Faturação",
    more: "Mais",
    accountSettings: "Definições da conta",
    signOut: "Terminar sessão",
    uploadStatement: "Carregar extrato",
    changeLanguage: "Mudar idioma",
    language: "Idioma",
    expandNav: "Expandir navegação",
    collapseNav: "Recolher navegação",
    openNav: "Abrir navegação",
    closeNav: "Fechar navegação",
    plan: "plano",
    basic: "BÁSICO",
  },
  ru: {
    askWab: "Спросить Wab",
    workspace: "Рабочая область",
    portfolio: "Портфель",
    ledger: "Журнал",
    exceptions: "Исключения",
    dataSources: "Источники данных",
    integrations: "Интеграции",
    taxCenter: "Налоговый центр",
    auditTrail: "Аудит-след",
    autonomous: "Автономно",
    activityFeed: "Лента",
    reviewInbox: "Входящие проверки",
    account: "Аккаунт",
    settings: "Настройки",
    billing: "Оплата",
    more: "Ещё",
    accountSettings: "Настройки аккаунта",
    signOut: "Выйти",
    uploadStatement: "Загрузить выписку",
    changeLanguage: "Сменить язык",
    language: "Язык",
    expandNav: "Развернуть меню",
    collapseNav: "Свернуть меню",
    openNav: "Открыть меню",
    closeNav: "Закрыть меню",
    plan: "тариф",
    basic: "БАЗОВЫЙ",
  },
  ur: {
    askWab: "Wab سے پوچھیں",
    workspace: "ورک اسپیس",
    portfolio: "پورٹ فولیو",
    ledger: "لیجر",
    exceptions: "استثنیٰ",
    dataSources: "ڈیٹا ذرائع",
    integrations: "انضمام",
    taxCenter: "ٹیکس سینٹر",
    auditTrail: "آڈٹ ٹریل",
    autonomous: "خودکار",
    activityFeed: "سرگرمی",
    reviewInbox: "جائزہ ان باکس",
    account: "اکاؤنٹ",
    settings: "ترتیبات",
    billing: "بلنگ",
    more: "مزید",
    accountSettings: "اکاؤنٹ کی ترتیبات",
    signOut: "سائن آؤٹ",
    uploadStatement: "اسٹیٹمنٹ اپ لوڈ کریں",
    changeLanguage: "زبان تبدیل کریں",
    language: "زبان",
    expandNav: "نیویگیشن کھولیں",
    collapseNav: "نیویگیشن بند کریں",
    openNav: "نیویگیشن کھولیں",
    closeNav: "نیویگیشن بند کریں",
    plan: "پلان",
    basic: "بیسک",
  },
};

function readLocale(): LocaleCode {
  if (typeof window === "undefined") return "en";
  try {
    const stored = localStorage.getItem(LOCALE_KEY);
    if (stored && LOCALES.some((l) => l.code === stored)) return stored as LocaleCode;
  } catch {
    /* ignore */
  }
  return "en";
}

type LocaleContextType = {
  locale: LocaleCode;
  setLocale: (code: LocaleCode) => void;
  t: (key: keyof (typeof dict)["en"]) => string;
  dir: "ltr" | "rtl";
};

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(() => readLocale());
  const dir = RTL.has(locale) ? "rtl" : "ltr";

  const setLocale = (code: LocaleCode) => {
    setLocaleState(code);
    try {
      localStorage.setItem(LOCALE_KEY, code);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = dir;
    root.classList.toggle("rtl", dir === "rtl");
    const id = "wab-locale-font";
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (locale === "ur" || locale === "ar") {
      if (!link) {
        link = document.createElement("link");
        link.id = id;
        link.rel = "stylesheet";
        document.head.appendChild(link);
      }
      link.href =
        locale === "ur"
          ? "https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;600;700&display=swap"
          : "https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;600;700&display=swap";
      document.body.style.fontFamily =
        locale === "ur"
          ? '"Noto Nastaliq Urdu", Inter, sans-serif'
          : '"Noto Naskh Arabic", Inter, sans-serif';
    } else {
      document.body.style.fontFamily = "";
    }
  }, [locale, dir]);

  const value = useMemo<LocaleContextType>(
    () => ({
      locale,
      setLocale,
      dir,
      t: (key) => dict[locale][key] ?? dict.en[key] ?? key,
    }),
    [locale, dir],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
