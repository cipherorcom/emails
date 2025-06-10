// 主题管理模块

// 支持的主题
export const THEMES = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system'
};

// 获取当前主题
export function getCurrentTheme() {

  // 优先从本地存储获取
  const savedTheme = localStorage.getItem('email-system-theme');
  if (savedTheme && Object.values(THEMES).includes(savedTheme)) {
    return savedTheme;
  }
  
  // 默认使用系统主题
  return THEMES.SYSTEM;
}

// 设置主题
export function setTheme(theme) {
  
  if (Object.values(THEMES).includes(theme)) {
    localStorage.setItem('email-system-theme', theme);
    applyTheme(theme);
    return true;
  }
  return false;
}

// 应用主题到DOM
export function applyTheme(theme = null) {
  
  const currentTheme = theme || getCurrentTheme();
  
  // 如果是跟随系统
  if (currentTheme === THEMES.SYSTEM) {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', prefersDark);
    return prefersDark ? THEMES.DARK : THEMES.LIGHT;
  }
  
  // 明确设置为深色或浅色
  const isDark = currentTheme === THEMES.DARK;
  document.documentElement.classList.toggle('dark', isDark);
  return currentTheme;
}

// 监听系统主题变化
export function setupThemeListener() {
  
  const currentTheme = getCurrentTheme();
  
  // 如果是跟随系统，则需要监听系统主题变化
  if (currentTheme === THEMES.SYSTEM) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    // 初始应用
    applyTheme();
    
    // 监听变化
    mediaQuery.addEventListener('change', () => {
      applyTheme();
    });
  } else {
    // 直接应用保存的主题
    applyTheme();
  }
}

export default {
  THEMES,
  getCurrentTheme,
  setTheme,
  applyTheme,
  setupThemeListener
}; 