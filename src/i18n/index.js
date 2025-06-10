// 国际化模块入口
import zhCN from './zh-CN';
import enUS from './en-US';

// 支持的语言列表
export const supportedLanguages = {
  'zh-CN': '中文',
  'en-US': 'English'
};

// 语言包映射
const translations = {
  'zh-CN': zhCN,
  'en-US': enUS
};

// 检查是否在浏览器环境中
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

// 从请求中获取语言
export function getLanguageFromRequest(request) {
  try {
    // 尝试从Cookie获取
    const cookieHeader = request.header('cookie') || '';
    const match = cookieHeader.match(/email-system-language=([^;]+)/);
    const langFromCookie = match ? match[1] : null;
    
    if (langFromCookie && translations[langFromCookie]) {
      return langFromCookie;
    }
    
    // 尝试从Accept-Language头获取
    const acceptLanguage = request.header('Accept-Language') || '';
    
    // 简单解析Accept-Language
    const preferredLang = acceptLanguage.split(',')[0].trim().split(';')[0].trim();
    
    if (preferredLang) {
      // 检查完全匹配
      if (translations[preferredLang]) {
        return preferredLang;
      }
      
      // 检查语言主要部分
      const mainLang = preferredLang.split('-')[0];
      for (const lang in translations) {
        if (lang.startsWith(mainLang)) {
          return lang;
        }
      }
    }
  } catch (error) {
    console.error('[i18n] 从请求获取语言出错:', error);
  }
  
  // 默认语言
  return 'zh-CN';
}

// 获取当前语言 - 服务器端实现
export function getCurrentLanguage(request) {
  // 如果在浏览器环境中，尝试从cookie获取
  // 实际只能通过request获取，但我也懒得删了
  if (isBrowser) {
    try {
      // 优先从localStorage获取
      const savedLang = localStorage.getItem('email-system-language');
      if (savedLang && translations[savedLang]) {
        return savedLang;
      }
      
      // 其次从cookie获取
      const cookieValue = document.cookie.split('; ').find(row => row.startsWith('email-system-language='));
      if (cookieValue) {
        const lang = cookieValue.split('=')[1];
        if (translations[lang]) {
          return lang;
        }
      }
    } catch (error) {
      console.error('[i18n] 从浏览器获取语言出错:', error);
    }
  }

  // 从请求中获取
  if (request) {
    return getLanguageFromRequest(request);
  }
  
  // 默认语言
  return 'zh-CN';
}

// 翻译函数
export function t(key, lang = null) {
  // 在服务器端，使用传入的语言或默认语言
  const currentLang = lang || 'zh-CN';
  const trans = translations[currentLang] || translations['zh-CN'];
  
  if (!trans[key]) {
    // 如果当前语言没有这个键，尝试使用中文版本
    if (currentLang !== 'zh-CN' && translations['zh-CN'][key]) {
      return translations['zh-CN'][key];
    }
  }
  
  return trans[key] || key;
}

// 导出所有翻译，供客户端使用
export const allTranslations = translations;

// 客户端专用函数 - 将在浏览器中加载后执行
if (isBrowser) {
  // 在window对象上暴露国际化功能
  window.i18n = {
    getCurrentLanguage: function() {
      // 优先从localStorage获取
      const savedLang = localStorage.getItem('email-system-language');
      if (savedLang && translations[savedLang]) {
        return savedLang;
      }
      
      // 其次从cookie获取
      function getCookie(name) {
        const value = '; ' + document.cookie;
        const parts = value.split('; ' + name + '=');
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
      }
      
      const cookieLang = getCookie('email-system-language');
      if (cookieLang && translations[cookieLang]) {
        return cookieLang;
      }
      
      // 从浏览器语言获取
      const browserLang = navigator.language;
      if (browserLang && translations[browserLang]) {
        return browserLang;
      }
      
      // 检查语言主要部分
      const mainLang = browserLang.split('-')[0];
      for (const lang in translations) {
        if (lang.startsWith(mainLang)) {
          return lang;
        }
      }
      
      // 默认语言
      return 'zh-CN';
    },
    
    t: function(key) {
      const currentLang = this.getCurrentLanguage();
      const trans = translations[currentLang] || window.translations['zh-CN'];
      return trans[key] || translations['zh-CN'][key] || key;
    },
    
    setLanguage: function(lang) {
      if (translations[lang]) {
        localStorage.setItem('email-system-language', lang);
        document.cookie = 'email-system-language=' + lang + '; path=/; max-age=2592000; SameSite=Strict';
        return true;
      }
      return false;
    },
    
    applyTranslations: function() {
      const elements = document.querySelectorAll('[data-i18n]');
      const currentLang = this.getCurrentLanguage();
      
      elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) {
          el.textContent = this.t(key);
        }
      });
      
      // 更新HTML语言属性
      document.documentElement.lang = currentLang;
    }
  };
  
  // 页面加载完成后自动应用翻译
  document.addEventListener('DOMContentLoaded', function() {
    window.i18n.applyTranslations();
  });
}

export default {
  supportedLanguages,
  getCurrentLanguage,
  getLanguageFromRequest,
  t,
  allTranslations
}; 