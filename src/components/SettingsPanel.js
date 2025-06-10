import { supportedLanguages, t } from '../i18n';

import { THEMES } from '../utils/theme';
// 设置面板组件
import { html } from 'hono/html';

// 设置面板组件
export function renderSettingsPanel(isOpen = false) {
  return html`
    <div id="settings-panel" class="fixed inset-0 z-50 overflow-y-auto ${isOpen ? '' : 'hidden'}">
      <div class="flex items-center justify-center min-h-screen p-4">
        <div class="fixed inset-0 bg-black bg-opacity-50 transition-opacity" id="settings-backdrop"></div>
        
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-auto z-10 relative transform transition-all">
          <div class="p-6">
            <div class="flex justify-between items-center mb-6">
              <h2 class="text-xl font-semibold text-gray-900 dark:text-white">${t('settings_title')}</h2>
              <button id="close-settings" class="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
            
            <!-- 主题设置 -->
            <div class="mb-6">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">${t('settings_theme')}</label>
              <div class="grid grid-cols-3 gap-3">
                <button 
                  data-theme="${THEMES.LIGHT}"
                  class="theme-btn flex flex-col items-center justify-center p-3 border rounded-lg border-gray-200 dark:border-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-blue-600 dark:hover:text-white"
                >
                  <svg class="w-6 h-6 mb-2 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707a1 1 0 001.414 0z" clip-rule="evenodd"></path>
                  </svg>
                  <span class="text-sm font-medium text-gray-900 dark:text-white">${t('settings_theme_light')}</span>
                </button>
                
                <button 
                  data-theme="${THEMES.DARK}" 
                  class="theme-btn flex flex-col items-center justify-center p-3 border rounded-lg border-gray-200 dark:border-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-blue-600 dark:hover:text-white"
                >
                  <svg class="w-6 h-6 mb-2 text-gray-900 dark:text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path>
                  </svg>
                  <span class="text-sm font-medium text-gray-900 dark:text-white">${t('settings_theme_dark')}</span>
                </button>
                
                <button 
                  data-theme="${THEMES.SYSTEM}" 
                  class="theme-btn flex flex-col items-center justify-center p-3 border rounded-lg border-gray-200 dark:border-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-blue-600 dark:hover:text-white"
                >
                  <svg class="w-6 h-6 mb-2 text-gray-700 dark:text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clip-rule="evenodd"></path>
                  </svg>
                  <span class="text-sm font-medium text-gray-900 dark:text-white">${t('settings_theme_system')}</span>
                </button>
              </div>
            </div>
            
            <!-- 语言设置 -->
            <div class="mb-6">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">${t('settings_language')}</label>
              <div class="grid grid-cols-2 gap-3">
                ${Object.entries(supportedLanguages).map(([code, name]) => html`
                  <button 
                    data-lang="${code}" 
                    class="lang-btn flex items-center justify-center p-3 border rounded-lg border-gray-200 dark:border-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-blue-600 dark:hover:text-white"
                  >
                    <span class="text-sm font-medium text-gray-900 dark:text-white">${name}</span>
                  </button>
                `).join('')}
              </div>
            </div>
            
            <div class="flex justify-end">
              <button id="save-settings" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                ${t('save')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <script>
      document.addEventListener('DOMContentLoaded', () => {
        // 获取元素
        const settingsPanel = document.getElementById('settings-panel');
        const settingsBackdrop = document.getElementById('settings-backdrop');
        const closeSettings = document.getElementById('close-settings');
        const saveSettings = document.getElementById('save-settings');
        const themeButtons = document.querySelectorAll('.theme-btn');
        const langButtons = document.querySelectorAll('.lang-btn');
        
        // 添加自定义样式，确保深色模式下按钮悬停样式不被覆盖
        const customStyle = document.createElement('style');
        customStyle.textContent = 
          '.dark .theme-btn:hover,' + 
          '.dark .lang-btn:hover {' + 
          '  background-color: #2563eb !important;' + 
          '  color: #ffffff !important;' + 
          '}';
        document.head.appendChild(customStyle);
        
        // 获取当前主题
        function getCurrentTheme() {
          // 优先从本地存储获取
          const savedTheme = localStorage.getItem('email-system-theme');
          if (savedTheme && ['light', 'dark', 'system'].includes(savedTheme)) {
            return savedTheme;
          }
          
          // 默认使用系统主题
          return 'system';
        }
        
        // 获取当前语言
        function getCurrentLanguage() {
          // 优先从会话存储中获取
          const savedLang = localStorage.getItem('email-system-language');
          if (savedLang && ['zh-CN', 'en-US'].includes(savedLang)) {
            return savedLang;
          }
          
          // 其次从浏览器语言获取
          const browserLang = navigator.language;
          if (browserLang && ['zh-CN', 'en-US'].includes(browserLang)) {
            return browserLang;
          }
          
          // 最后使用默认语言
          return 'zh-CN';
        }
        
        // 获取当前设置
        const currentTheme = getCurrentTheme();
        const currentLanguage = getCurrentLanguage();
        
        // 设置初始选中状态
        themeButtons.forEach(btn => {
          if (btn.dataset.theme === currentTheme) {
            btn.classList.remove('border-gray-200', 'dark:border-gray-700');
            btn.classList.add('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900');
          }
        });
        
        langButtons.forEach(btn => {
          if (btn.dataset.lang === currentLanguage) {
            btn.classList.remove('border-gray-200', 'dark:border-gray-700');
            btn.classList.add('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900');
          }
        });
        
        // 选中的设置
        let selectedTheme = currentTheme;
        let selectedLang = currentLanguage;
        
        // 关闭设置面板
        function closeSettingsPanel() {
          settingsPanel.classList.add('hidden');
        }
        
        // 主题按钮点击事件
        themeButtons.forEach(btn => {
          btn.addEventListener('click', () => {
            // 移除所有选中状态
            themeButtons.forEach(b => {
              b.classList.remove('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900');
              b.classList.add('border-gray-200', 'dark:border-gray-700');
            });
            
            // 添加选中状态
            btn.classList.remove('border-gray-200', 'dark:border-gray-700');
            btn.classList.add('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900');
            
            // 更新选中的主题
            selectedTheme = btn.dataset.theme;
          });
        });
        
        // 语言按钮点击事件
        langButtons.forEach(btn => {
          btn.addEventListener('click', () => {
            // 移除所有选中状态
            langButtons.forEach(b => {
              b.classList.remove('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900');
              b.classList.add('border-gray-200', 'dark:border-gray-700');
            });
            
            // 添加选中状态
            btn.classList.remove('border-gray-200', 'dark:border-gray-700');
            btn.classList.add('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900');
            
            // 更新选中的语言
            selectedLang = btn.dataset.lang;
          });
        });
        
        // 保存设置
        saveSettings.addEventListener('click', function() {
          // 等待toast系统初始化，如果不存在则延迟执行
          function waitForToast(callback, attempts = 0) {
            if (window.toast) {
              callback();
            } else if (attempts < 50) { // 最多等待5秒 (50 * 100ms)
              setTimeout(() => waitForToast(callback, attempts + 1), 100);
            } else {
              console.error('Toast系统初始化超时');
              callback();
            }
          }
          
          waitForToast(function() {
            
            // 发送设置到服务器
            fetch('/api/settings', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                theme: selectedTheme,
                language: selectedLang
              }),
            })
            .then(function(response) {
              return response.json();
            })
            .then(function(data) {
              
              if (data.success) {
                // 先更新本地存储
                localStorage.setItem('email-system-theme', selectedTheme);
                localStorage.setItem('email-system-language', selectedLang);
                
                // 设置cookie (作为备份)
                document.cookie = 'email-system-theme=' + selectedTheme + '; path=/; max-age=2592000; SameSite=Strict';
                document.cookie = 'email-system-language=' + selectedLang + '; path=/; max-age=2592000; SameSite=Strict';
                
                // 应用主题
                if (selectedTheme === 'system') {
                  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  document.documentElement.classList.toggle('dark', prefersDark);
                } else {
                  document.documentElement.classList.toggle('dark', selectedTheme === 'dark');
                }
                
                // 使用全局toast系统显示成功消息
                if (window.toast && window.i18n) {
                  const currentLang = window.i18n.getCurrentLanguage();
                  window.toast.success(window.i18n.t('settings_save_success', currentLang));
                } else if (window.toast) {
                  window.toast.success('设置已保存');
                } else {
                  alert('设置已保存');
                }
              } else {
                console.error('Failed to save settings:', data);
                if (window.toast && window.i18n) {
                  const currentLang = window.i18n.getCurrentLanguage();
                  window.toast.error(window.i18n.t('settings_save_error', currentLang));
                } else if (window.toast) {
                  window.toast.error('保存设置失败');
                } else {
                  alert('保存设置失败');
                }
              }
            })
            .catch(function(error) {
              console.error('Error saving settings:', error);
              if (window.toast && window.i18n) {
                const currentLang = window.i18n.getCurrentLanguage();
                window.toast.error(window.i18n.t('settings_save_error', currentLang) + ': ' + error.message);
              } else if (window.toast) {
                window.toast.error('保存设置错误: ' + error.message);
              } else {
                alert('保存设置错误: ' + error.message);
              }
            });
          });
        });
        
        // 关闭按钮点击事件
        closeSettings.addEventListener('click', closeSettingsPanel);
        
        // 点击背景关闭
        settingsBackdrop.addEventListener('click', closeSettingsPanel);
      });
    </script>
  `;
}

// 设置按钮组件
export function renderSettingsButton() {
  return html`
    <button id="open-settings" class="text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
      </svg>
    </button>
    
    <script>
      document.addEventListener('DOMContentLoaded', () => {
        const openSettings = document.getElementById('open-settings');
        const settingsPanel = document.getElementById('settings-panel');
        
        openSettings.addEventListener('click', () => {
          settingsPanel.classList.remove('hidden');
        });
      });
    </script>
  `;
}

export default {
  renderSettingsPanel,
  renderSettingsButton
}; 