import { CookieStore, sessionMiddleware } from 'hono-sessions';
import { allTranslations, getCurrentLanguage, t } from './i18n';

import { Hono } from 'hono';
import { Resend } from 'resend';
import attachmentsApi from './api/attachments';
import diagnosticApi from './api/diagnostic';
import { html } from 'hono/html';
import { renderAttachmentUploader } from './components/AttachmentUploader';
import { renderSettingsPanel } from './components/SettingsPanel';
import { serveStatic } from 'hono/cloudflare-workers';
import settingsApi from './api/settings';
import { verifyUser } from './db/auth';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

// 初始化 Hono 应用
const app = new Hono();

// 设置静态资源目录
app.use('/static/*', serveStatic({
  root: './public'
}));

// 设置会话中间件
app.use(
  '*',
  sessionMiddleware({
    store: new CookieStore(),
    encryptionKey: 'password_at_least_32_characters_long', // 加密密钥，至少32个字符
    expireAfterSeconds: 86400, // 24小时有效期
    cookieOptions: {
      name: 'email-system-session',
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      path: '/'
    }
  })
);

// 创建存储邮件的函数
async function storeEmail(env, email) {
  const timestamp = Date.now().toString();
  const id = `email:${timestamp}`;
  await env.EMAIL_STORE.put(id, JSON.stringify(email));
  return { id, ...email };
}

// 获取所有邮件
async function getAllEmails(env, page = 1, pageSize = 10, type = null) {
  const list = await env.EMAIL_STORE.list({ prefix: 'email:' });
  let emails = [];
  
  for (const key of list.keys) {
    const emailData = await env.EMAIL_STORE.get(key.name);
    if (emailData) {
      emails.push({
        id: key.name,
        ...JSON.parse(emailData)
      });
    }
  }
  
  // 按时间倒序排序
  emails = emails.sort((a, b) => {
    const aTime = a.id.split(':')[1];
    const bTime = b.id.split(':')[1];
    return bTime - aTime;
  });
  
  // 如果指定了类型，进行过滤
  if (type) {
    emails = emails.filter(email => email.type === type);
  }
  
  // 计算总页数
  const totalCount = emails.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  
  // 进行分页
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedEmails = emails.slice(startIndex, endIndex);
  
  return {
    emails: paginatedEmails,
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages
    }
  };
}

// 创建 Resend 发邮件客户端
function createResendClient(env) {
  return new Resend(env.RESEND_API_KEY);
}

// 检查认证中间件
async function authMiddleware(c, next) {
  // 从会话中获取用户信息
  const session = c.get('session');
  const user = session.get('user');
  
  // 如果用户未登录且不是访问登录页或登录API
  if (!user) {
    // 如果是访问API
    if (c.req.path.startsWith('/api/') && c.req.path !== '/api/login') {
      return c.json({ success: false, message: '未授权访问' }, 401);
    }
    // 如果访问的不是登录页且不是静态资源
    if (c.req.path !== '/login' && 
        !c.req.path.startsWith('/static/')) {
      return c.redirect('/login');
    }
  }
  
  // 将用户信息添加到上下文中
  c.set('user', user);
  await next();
}

// API 路由
// 发送邮件
const sendEmailSchema = z.object({
  to: z.string().min(1), // 修改为允许名称 <邮箱> 格式
  subject: z.string().min(1),
  html: z.string().optional(),
  text: z.string().min(1),
  from: z.string().min(1).optional(), // 允许名称 <邮箱> 格式
  attachments: z.array(z.object({
    path: z.string().url(),
    filename: z.string().min(1)
  })).optional(), // 添加附件支持
});

app.post('/api/send', authMiddleware, zValidator('json', sendEmailSchema), async (c) => {
  const env = c.env;
  const resend = createResendClient(env);
  const body = c.req.valid('json');
  
  try {
    const from = body.from || 'onboarding@resend.dev';
    const emailData = {
      from,
      to: body.to,
      subject: body.subject,
      html: body.html || `<p>${body.text.replace(new RegExp('\\n', 'g'), '</p><p>')}</p>`,
      text: body.text,
    };

    // 添加附件
    if (body.attachments && body.attachments.length > 0) {
      emailData.attachments = body.attachments;
    }

    const result = await resend.emails.send(emailData);
    
    // 检查Resend API响应中是否有错误
    if (result.error) {
      return c.json({ 
        success: false, 
        error: result.error.message || result.error.name || '邮件发送失败'
      }, 400);
    }
    
    // 存储发送的邮件
    await storeEmail(env, {
      ...emailData,
      type: 'sent',
      timestamp: new Date().toISOString(),
    });

    return c.json({ success: true, data: result });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 400);
  }
});

// 获取所有邮件
app.get('/api/emails', authMiddleware, async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const pageSize = parseInt(c.req.query('pageSize') || '10');
    const type = c.req.query('type');
    
    const result = await getAllEmails(c.env, page, pageSize, type);
    return c.json({ success: true, ...result });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 获取单个邮件详情
app.get('/api/emails/:id', authMiddleware, async (c) => {
  try {
    const emailId = c.req.param('id');
    const email = await c.env.EMAIL_STORE.get(emailId);
    
    if (!email) {
      return c.json({ success: false, error: 'Email not found' }, 404);
    }
    
    return c.json({ success: true, data: JSON.parse(email) });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 认证相关API
const loginSchema = z.object({
  username: z.string().min(1, { message: '用户名不能为空' }),
  password: z.string().min(1, { message: '密码不能为空' }),
});

app.post('/api/login', zValidator('json', loginSchema), async (c) => {
  const { username, password } = c.req.valid('json');
  const result = await verifyUser(c.env, username, password);
  
  if (result.success) {
    // 设置会话
    const session = c.get('session');
    session.set('user', result.user);
    return c.json({ success: true, user: result.user });
  } else {
    return c.json({ success: false, message: result.message }, 401);
  }
});

app.post('/api/logout', async (c) => {
  // 清除会话
  const session = c.get('session');
  session.set('user', null);
  return c.json({ success: true });
});

// 注册API路由
app.route('/api/settings', settingsApi);
app.route('/api/attachments', attachmentsApi);
app.route('/api/diagnostic', diagnosticApi);

// 通用页面头部
function renderHeader(user, currentPage, request) {
  if (!user) {
    return '';
  }
  
  // 获取当前语言的翻译
  const currentLang = getCurrentLanguage(request);
  
  // 设置导航链接的样式
  const navLinkBaseClass = "font-medium px-4 py-2 rounded-lg transition-colors duration-200";
  const inboxClass = currentPage === 'inbox' 
    ? `${navLinkBaseClass} bg-blue-600 text-white` 
    : `${navLinkBaseClass} text-gray-700 hover:bg-blue-100 dark:text-gray-300 dark:hover:bg-blue-600 dark:hover:text-white`;
  
  const sentClass = currentPage === 'sent' 
    ? `${navLinkBaseClass} bg-blue-600 text-white` 
    : `${navLinkBaseClass} text-gray-700 hover:bg-blue-100 dark:text-gray-300 dark:hover:bg-blue-600 dark:hover:text-white`;
  
  const composeClass = currentPage === 'compose' 
    ? `${navLinkBaseClass} bg-blue-600 text-white` 
    : `${navLinkBaseClass} text-gray-700 hover:bg-blue-100 dark:text-gray-300 dark:hover:bg-blue-600 dark:hover:text-white`;

  const diagnosticClass = currentPage === 'diagnostic' 
    ? `${navLinkBaseClass} bg-blue-600 text-white` 
    : `${navLinkBaseClass} text-gray-700 hover:bg-blue-100 dark:text-gray-300 dark:hover:bg-blue-600 dark:hover:text-white`;
  
  return html`
    <div class="container mx-auto px-4 mb-8">
      <h1 class="text-3xl font-bold text-blue-600 dark:text-blue-400 text-center mt-6 mb-6" data-i18n="app_name">${t('app_name', currentLang)}</h1>
      
      <div class="bg-white dark:bg-gray-800 shadow rounded-lg p-4 mb-6">
        <div class="flex flex-col sm:flex-row justify-between items-center">
          <nav class="flex space-x-2 mb-4 sm:mb-0">
            <a href="/" class="${inboxClass} nav-link" data-i18n="nav_inbox">${t('nav_inbox', currentLang)}</a>
            <a href="/sent" class="${sentClass} nav-link" data-i18n="nav_sent">${t('nav_sent', currentLang)}</a>
            <a href="/compose" class="${composeClass} nav-link" data-i18n="nav_compose">${t('nav_compose', currentLang)}</a>
            <a href="/diagnostic" class="${diagnosticClass} nav-link" data-i18n="nav_diagnostic">${t('nav_diagnostic', currentLang)}</a>
          </nav>
          
          <div class="flex items-center space-x-4">
            <!-- 主题切换按钮 -->
            <div class="relative" id="theme-dropdown">
              <button class="text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white flex items-center">
                <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path>
                </svg>
                <span class="text-sm" data-i18n="settings_theme">${t('settings_theme', currentLang)}</span>
              </button>
              <div class="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg hidden z-20 border border-gray-200 dark:border-gray-700" id="theme-menu">
                <div class="py-1">
                  <button data-theme="light" class="theme-option block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-blue-600 dark:hover:text-white">
                    <div class="flex items-center">
                      <svg class="w-4 h-4 mr-2 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707a1 1 0 001.414 0z" clip-rule="evenodd"></path>
                      </svg>
                      <span data-i18n="settings_theme_light">${t('settings_theme_light', currentLang)}</span>
                    </div>
                  </button>
                  <button data-theme="dark" class="theme-option block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-blue-600 dark:hover:text-white">
                    <div class="flex items-center">
                      <svg class="w-4 h-4 mr-2 text-gray-900 dark:text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path>
                      </svg>
                      <span data-i18n="settings_theme_dark">${t('settings_theme_dark', currentLang)}</span>
                    </div>
                  </button>
                  <button data-theme="system" class="theme-option block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-blue-600 dark:hover:text-white">
                    <div class="flex items-center">
                      <svg class="w-4 h-4 mr-2 text-gray-700 dark:text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clip-rule="evenodd"></path>
                      </svg>
                      <span data-i18n="settings_theme_system">${t('settings_theme_system', currentLang)}</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
            
            <!-- 语言切换按钮 -->
            <div class="relative" id="lang-dropdown">
              <button class="text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white flex items-center">
                <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"></path>
                </svg>
                <span class="text-sm" data-i18n="settings_language">${t('settings_language', currentLang)}</span>
              </button>
              <div class="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg hidden z-20 border border-gray-200 dark:border-gray-700" id="lang-menu">
                <div class="py-1">
                  <button data-lang="zh-CN" class="lang-option block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-blue-600 dark:hover:text-white">
                    <span data-i18n="settings_language_zh">${t('settings_language_zh', currentLang)}</span>
                  </button>
                  <button data-lang="en-US" class="lang-option block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-blue-600 dark:hover:text-white">
                    <span data-i18n="settings_language_en">${t('settings_language_en', currentLang)}</span>
                  </button>
                </div>
              </div>
            </div>
            
            <span class="text-gray-700 dark:text-gray-300 font-medium"><span data-i18n="nav_welcome">${t('nav_welcome', currentLang)}</span>, ${user.username || t('guest', currentLang)}</span>
            <button id="logout-btn" class="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium" data-i18n="nav_logout">${t('nav_logout', currentLang)}</button>
          </div>
        </div>
      </div>
      
      <script>
        document.addEventListener('DOMContentLoaded', () => {
          // 确保导航栏按钮在深色模式下有正确的样式
          const navLinks = document.querySelectorAll('nav a.nav-link');
          
          function updateNavStyles() {
            const isDarkMode = document.documentElement.classList.contains('dark');
            
            // 强制应用样式到所有导航链接
            navLinks.forEach(link => {
              // 如果是当前选中的导航项
              if (link.classList.contains('bg-blue-600')) {
                link.style.setProperty('background-color', '#2563eb', 'important');
                link.style.setProperty('color', '#ffffff', 'important');
              }
              
              // 添加悬停事件
              link.addEventListener('mouseenter', function() {
                if (isDarkMode && !this.classList.contains('bg-blue-600')) {
                  this.style.setProperty('background-color', '#2563eb', 'important');
                  this.style.setProperty('color', '#ffffff', 'important');
                }
              });
              
              link.addEventListener('mouseleave', function() {
                if (isDarkMode && !this.classList.contains('bg-blue-600')) {
                  this.style.backgroundColor = '';
                  this.style.color = '';
                }
              });
            });
          }
          
          // 初始化导航样式
          setTimeout(() => {
            updateNavStyles();
          }, 100);
          
          // 监听主题变化
          const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
              if (mutation.attributeName === 'class') {
                updateNavStyles();
              }
            });
          });
          
          observer.observe(document.documentElement, { attributes: true });
          
          // 登出功能
          document.getElementById('logout-btn').addEventListener('click', async () => {
            try {
              const response = await fetch('/api/logout', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                }
              });
              
              if (response.ok) {
                window.location.href = '/login';
              }
            } catch (error) {
              console.error('退出失败:', error);
            }
          });
          
          // 主题切换功能
          const themeDropdown = document.getElementById('theme-dropdown');
          const themeMenu = document.getElementById('theme-menu');
          const themeOptions = document.querySelectorAll('.theme-option');
          
          // 获取当前主题
          function getCurrentTheme() {
            const savedTheme = localStorage.getItem('email-system-theme');
            if (savedTheme && ['light', 'dark', 'system'].includes(savedTheme)) {
              return savedTheme;
            }
            return 'system';
          }
          
          // 应用主题
          function applyTheme(theme) {
            if (theme === 'dark') {
              document.documentElement.classList.add('dark');
            } else if (theme === 'light') {
              document.documentElement.classList.remove('dark');
            } else if (theme === 'system') {
              const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
              document.documentElement.classList.toggle('dark', prefersDark);
            }
          }
          
          // 初始应用主题
          applyTheme(getCurrentTheme());
          
          // 切换主题下拉菜单
          themeDropdown.addEventListener('click', (e) => {
            e.stopPropagation();
            themeMenu.classList.toggle('hidden');
            if (langMenu) langMenu.classList.add('hidden');
          });
          
          // 选择主题
          themeOptions.forEach(option => {
            option.addEventListener('click', async () => {
              const theme = option.dataset.theme;
              
              try {
                // 获取当前语言设置，确保不会被重置
                let currentLanguage = 'zh-CN'; // 默认值
                
                // 尝试从localStorage获取
                const localStorageLang = localStorage.getItem('email-system-language');
                if (localStorageLang) {
                  currentLanguage = localStorageLang;
                } else {
                  // 尝试从cookie获取
                  const cookies = document.cookie.split(';');
                  for (const cookie of cookies) {
                    const [name, value] = cookie.trim().split('=');
                    if (name === 'email-system-language') {
                      currentLanguage = value;
                      break;
                    }
                  }
                }
                
                // 使用window.i18n作为备选方案
                if (window.i18n && typeof window.i18n.getCurrentLanguage === 'function') {
                  const i18nLang = window.i18n.getCurrentLanguage();
                  if (i18nLang) {
                    currentLanguage = i18nLang;
                  }
                }
                
                const response = await fetch('/api/settings', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    theme,
                    language: currentLanguage
                  }),
                });
                
                if (response.ok) {
                  localStorage.setItem('email-system-theme', theme);
                  applyTheme(theme);
                  themeMenu.classList.add('hidden');
                }
              } catch (error) {
                console.error('设置主题失败:', error);
              }
            });
          });
          
          // 语言切换功能
          const langDropdown = document.getElementById('lang-dropdown');
          const langMenu = document.getElementById('lang-menu');
          const langOptions = document.querySelectorAll('.lang-option');
          
          // 切换语言下拉菜单
          langDropdown.addEventListener('click', function(e) {
            e.stopPropagation();
            langMenu.classList.toggle('hidden');
            if (themeMenu) themeMenu.classList.add('hidden');
          });
          
          // 选择语言
          langOptions.forEach(function(option) {
            option.addEventListener('click', function() {
              const language = this.dataset.lang;
              
              // 保存语言设置
              fetch('/api/settings', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  theme: getCurrentTheme(),
                  language: language
                })
              })
              .then(function(response) {
                return response.json();
              })
              .then(function(data) {
                if (data.success) {
                  // 先更新本地存储
                  localStorage.setItem('email-system-language', language);
                  
                  // 设置cookie (作为备份)
                  document.cookie = 'email-system-language=' + language + '; path=/; max-age=2592000; SameSite=Strict';
                  
                  // 隐藏菜单
                  langMenu.classList.add('hidden');
                  
                  // 直接刷新页面以应用新语言
                  window.location.reload();
                } else {
                  console.error('Failed to save language setting:', data);
                  alert('保存语言设置失败');
                }
              })
              .catch(function(error) {
                console.error('Error saving language setting:', error);
                alert('保存语言设置失败: ' + error.message);
              });
            });
          });
          
          // 点击页面其他地方关闭下拉菜单
          document.addEventListener('click', () => {
            themeMenu.classList.add('hidden');
            langMenu.classList.add('hidden');
          });
        });
      </script>
    </div>
  `;
}

// 前端页面路由
app.get('/', authMiddleware, (c) => {
  const user = c.get('user');
  return c.html(renderHomePage(user, c.req));
});

app.get('/sent', authMiddleware, (c) => {
  const user = c.get('user');
  return c.html(renderSentPage(user, c.req));
});

app.get('/compose', authMiddleware, (c) => {
  const user = c.get('user');
  return c.html(renderComposePage(user, c.req));
});

// 邮件详情页面
app.get('/email/:id', authMiddleware, (c) => {
  const user = c.get('user');
  const emailId = c.req.param('id');
  return c.html(renderEmailDetailPage(user, emailId, c.req));
});

// 诊断页面
app.get('/diagnostic', authMiddleware, (c) => {
  const user = c.get('user');
  return c.html(renderDiagnosticPage(user, c.req));
});

// 登录页面
app.get('/login', (c) => {
  // 如果用户已登录，重定向到首页
  const session = c.get('session');
  const user = session.get('user');
  if (user) {
    return c.redirect('/');
  }
  return c.html(renderLoginPage(c.req));
});

// 主页模板
function renderHomePage(user, request) {
  const currentLang = getCurrentLanguage(request);
  const content = html`
    <div class="container mx-auto px-4">
      <div class="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
        <h2 class="text-xl font-semibold mb-4 dark:text-white" data-i18n="inbox_title">${t('inbox_title', currentLang)}</h2>
        <div id="emails-list" class="space-y-4">
          <p class="text-gray-500 dark:text-gray-400" data-i18n="loading">${t('loading', currentLang)}</p>
        </div>
        
        <!-- 分页控件 -->
        <div id="pagination-controls" class="mt-6 flex justify-between items-center hidden">
          <div class="text-sm text-gray-500 dark:text-gray-400">
            <span data-i18n="pagination_showing">${t('pagination_showing', currentLang)}</span>
            <span id="page-info"></span>
          </div>
          <div class="flex space-x-2">
            <button id="prev-page" class="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-white rounded hover:bg-gray-300 hover:text-gray-900 dark:hover:bg-blue-600 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
              </svg>
            </button>
            <div id="page-numbers" class="flex space-x-1"></div>
            <button id="next-page" class="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-white rounded hover:bg-gray-300 hover:text-gray-900 dark:hover:bg-blue-600 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <style>
      /* 确保深色模式下邮件悬停样式为蓝色 */
      .dark .email-item:hover {
        background-color: rgba(37, 99, 235, 0.1) !important;
        border-color: #3b82f6 !important;
      }
      
      /* 自定义邮件分隔线样式 */
      .email-divider {
        border-bottom: 1px solid #e5e7eb;
        margin: 0;
      }
      
      .dark .email-divider {
        border-bottom: 1px solid #374151;
      }
      
      /* 确保最后一个邮件项没有分隔线 */
      .email-item:last-child + .email-divider {
        display: none;
      }
    </style>
    
    <script>
      document.addEventListener('DOMContentLoaded', () => {
        const emailsList = document.getElementById('emails-list');
        const paginationControls = document.getElementById('pagination-controls');
        const pageInfo = document.getElementById('page-info');
        const prevPageBtn = document.getElementById('prev-page');
        const nextPageBtn = document.getElementById('next-page');
        const pageNumbers = document.getElementById('page-numbers');
        
        let currentPage = 1;
        const pageSize = 10;
        let totalPages = 0;
        let totalCount = 0;
        
        // 加载邮件列表
        async function loadEmails(page = 1) {
          emailsList.innerHTML = '<p class="text-gray-500 dark:text-gray-400" data-i18n="loading">' + (window.i18n ? window.i18n.t('loading') : '${t('loading', currentLang)}') + '</p>';
          
          try {
            const response = await fetch(\`/api/emails?page=\${page}&pageSize=\${pageSize}&type=received\`);
            const result = await response.json();
            
            if (result.success) {
              const receivedEmails = result.emails;
              totalPages = result.pagination.totalPages;
              totalCount = result.pagination.totalCount;
              currentPage = result.pagination.page;
              
              // 更新分页信息
              updatePagination();
              
              if (receivedEmails.length === 0) {
                emailsList.innerHTML = '<p class="text-gray-500 dark:text-gray-400" data-i18n="inbox_empty">' + (window.i18n ? window.i18n.t('inbox_empty') : '${t('inbox_empty', currentLang)}') + '</p>';
                paginationControls.classList.add('hidden');
                return;
              }
              
              // 显示邮件列表
              let emailsHTML = '';
              receivedEmails.forEach((email, index) => {
                const date = new Date(email.timestamp).toLocaleString();
                emailsHTML += \`
                  <a href="/email/\${email.id}" class="email-item block py-4 px-3 hover:bg-gray-50 dark:hover:bg-blue-600/10 rounded-lg transition-colors duration-200">
                    <div class="flex justify-between">
                      <p class="font-semibold dark:text-white">\${email.from}</p>
                      <p class="text-gray-500 dark:text-gray-400 text-sm">\${date}</p>
                    </div>
                    <p class="text-lg font-medium dark:text-white">\${email.subject}</p>
                    <p class="text-gray-700 dark:text-gray-300 mb-3">\${email.text.length > 100 ? email.text.substring(0, 100) + '...' : email.text}</p>
                    
                    <div class="flex flex-wrap gap-2">
                      <button class="quick-reply-btn bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm font-medium" 
                        data-email-id="\${email.id}" 
                        data-email-from="\${email.from}" 
                        data-email-subject="\${email.subject}" 
                        data-i18n="email_detail_reply">${t('email_detail_reply', currentLang)}</button>
                    </div>
                  </a>
                  \${index < receivedEmails.length - 1 ? '<hr class="email-divider">' : ''}
                \`;
              });
              emailsList.innerHTML = emailsHTML;
              
              // 如果有多页，显示分页控件
              if (totalPages > 1) {
                paginationControls.classList.remove('hidden');
              } else {
                paginationControls.classList.add('hidden');
              }
              
              // 为所有快速回复按钮添加事件
              addQuickReplyEvents();
            } else {
              emailsList.innerHTML = '<p class="text-red-500 dark:text-red-400" data-i18n="inbox_load_error">' + (window.i18n ? window.i18n.t('inbox_load_error') : '${t('inbox_load_error', currentLang)}') + '</p>';
              paginationControls.classList.add('hidden');
            }
          } catch (error) {
            emailsList.innerHTML = \`<p class="text-red-500 dark:text-red-400">\${window.i18n ? window.i18n.t('inbox_load_error') : '${t('inbox_load_error', currentLang)}'}: \${error.message}</p>\`;
            paginationControls.classList.add('hidden');
          }
        }
        
        // 添加快速回复按钮事件
        function addQuickReplyEvents() {
          document.querySelectorAll('.quick-reply-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
              // 阻止事件冒泡，防止点击回复按钮时触发父元素的链接跳转
              e.stopPropagation();
              
              const emailId = btn.dataset.emailId;
              const from = btn.dataset.emailFrom;
              const subject = btn.dataset.emailSubject;
              
              try {
                // 获取完整的邮件内容
                const response = await fetch('/api/emails/' + emailId);
                const result = await response.json();
                
                if (result.success) {
                  const email = result.data;
                  const date = new Date(email.timestamp).toLocaleString();
                  
                  // 跳转到写邮件页面并预填写回复信息
                  const replyUrl = \`/compose?to=\${encodeURIComponent(email.from)}&subject=\${encodeURIComponent('Re: ' + email.subject)}&text=\${encodeURIComponent('\\n\\n---------- 原始邮件 ----------\\nFrom: ' + email.from + '\\nDate: ' + date + '\\nSubject: ' + email.subject + '\\nTo: ' + email.to + '\\n\\n' + email.text)}\`;
                  window.location.href = replyUrl;
                }
              } catch (error) {
                console.error('获取邮件详情失败:', error);
                // 如果获取详情失败，仍然跳转但只带基本信息
                const replyUrl = \`/compose?to=\${encodeURIComponent(from)}&subject=\${encodeURIComponent('Re: ' + subject)}\`;
                window.location.href = replyUrl;
              }
            });
          });
        }
        
        // 更新分页控件
        function updatePagination() {
          // 更新页面信息文本
          const showingFrom = ((currentPage - 1) * pageSize) + 1;
          const showingTo = Math.min(currentPage * pageSize, totalCount);
          pageInfo.textContent = \`\${showingFrom}-\${showingTo} / \${totalCount}\`;
          
          // 更新上一页/下一页按钮状态
          prevPageBtn.disabled = currentPage <= 1;
          nextPageBtn.disabled = currentPage >= totalPages;
          
          // 生成页码按钮
          pageNumbers.innerHTML = '';
          
          // 确定要显示哪些页码
          let startPage = Math.max(1, currentPage - 2);
          let endPage = Math.min(totalPages, startPage + 4);
          
          // 如果页数不足5页，调整起始页
          if (endPage - startPage < 4) {
            startPage = Math.max(1, endPage - 4);
          }
          
          // 添加第一页
          if (startPage > 1) {
            const btn = document.createElement('button');
            btn.className = 'px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-white rounded hover:bg-gray-300 hover:text-gray-900 dark:hover:bg-blue-600 dark:hover:text-white';
            btn.textContent = '1';
            btn.addEventListener('click', () => loadEmails(1));
            pageNumbers.appendChild(btn);
            
            // 添加省略号
            if (startPage > 2) {
              const ellipsis = document.createElement('span');
              ellipsis.className = 'px-2 py-1 text-gray-500 dark:text-gray-400';
              ellipsis.textContent = '...';
              pageNumbers.appendChild(ellipsis);
            }
          }
          
          // 添加页码按钮
          for (let i = startPage; i <= endPage; i++) {
            const btn = document.createElement('button');
            if (i === currentPage) {
              btn.className = 'px-3 py-1 bg-blue-500 text-white rounded';
              // 确保在深色模式下选中按钮的样式正确
              if (document.documentElement.classList.contains('dark')) {
                btn.style.backgroundColor = '#3b82f6';
                btn.style.color = '#ffffff';
              }
            } else {
              btn.className = 'px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-white rounded hover:bg-gray-300 hover:text-gray-900 dark:hover:bg-blue-600 dark:hover:text-white';
            }
            btn.textContent = i.toString();
            btn.addEventListener('click', () => loadEmails(i));
            pageNumbers.appendChild(btn);
          }
          
          // 添加最后一页
          if (endPage < totalPages) {
            // 添加省略号
            if (endPage < totalPages - 1) {
              const ellipsis = document.createElement('span');
              ellipsis.className = 'px-2 py-1 text-gray-500 dark:text-gray-400';
              ellipsis.textContent = '...';
              pageNumbers.appendChild(ellipsis);
            }
            
            const btn = document.createElement('button');
            btn.className = 'px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-white rounded hover:bg-gray-300 hover:text-gray-900 dark:hover:bg-blue-600 dark:hover:text-white';
            btn.textContent = totalPages.toString();
            btn.addEventListener('click', () => loadEmails(totalPages));
            pageNumbers.appendChild(btn);
          }
        }
        
        // 绑定上一页/下一页按钮事件
        prevPageBtn.addEventListener('click', () => {
          if (currentPage > 1) {
            loadEmails(currentPage - 1);
          }
        });
        
        nextPageBtn.addEventListener('click', () => {
          if (currentPage < totalPages) {
            loadEmails(currentPage + 1);
          }
        });
        
        // 初始加载
        loadEmails();
      });
    </script>
  `;
  
  return renderPageTemplate(t('app_name', currentLang) + ' - ' + t('inbox_title', currentLang), content, user, 'inbox', request);
}

// 已发送页面模板
function renderSentPage(user, request) {
  const currentLang = getCurrentLanguage(request);
  const content = html`
    <div class="container mx-auto px-4">
      <div class="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
        <h2 class="text-xl font-semibold mb-4 dark:text-white" data-i18n="sent_title">${t('sent_title', currentLang)}</h2>
        <div id="sent-emails-list" class="space-y-4">
          <p class="text-gray-500 dark:text-gray-400" data-i18n="loading">${t('loading', currentLang)}</p>
        </div>
        
        <!-- 分页控件 -->
        <div id="pagination-controls" class="mt-6 flex justify-between items-center hidden">
          <div class="text-sm text-gray-500 dark:text-gray-400">
            <span data-i18n="pagination_showing">${t('pagination_showing', currentLang)}</span>
            <span id="page-info"></span>
          </div>
          <div class="flex space-x-2">
            <button id="prev-page" class="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-white rounded hover:bg-gray-300 hover:text-gray-900 dark:hover:bg-blue-600 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
              </svg>
            </button>
            <div id="page-numbers" class="flex space-x-1"></div>
            <button id="next-page" class="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-white rounded hover:bg-gray-300 hover:text-gray-900 dark:hover:bg-blue-600 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <style>
      /* 确保深色模式下邮件悬停样式为蓝色 */
      .dark .email-item:hover {
        background-color: rgba(37, 99, 235, 0.1) !important;
        border-color: #3b82f6 !important;
      }
      
      /* 自定义邮件分隔线样式 */
      .email-divider {
        border-bottom: 1px solid #e5e7eb;
        margin: 0;
      }
      
      .dark .email-divider {
        border-bottom: 1px solid #374151;
      }
      
      /* 确保最后一个邮件项没有分隔线 */
      .email-item:last-child + .email-divider {
        display: none;
      }
    </style>
    
    <script>
      document.addEventListener('DOMContentLoaded', () => {
        const sentEmailsList = document.getElementById('sent-emails-list');
        const paginationControls = document.getElementById('pagination-controls');
        const pageInfo = document.getElementById('page-info');
        const prevPageBtn = document.getElementById('prev-page');
        const nextPageBtn = document.getElementById('next-page');
        const pageNumbers = document.getElementById('page-numbers');
        
        let currentPage = 1;
        const pageSize = 10;
        let totalPages = 0;
        let totalCount = 0;
        
        // 加载已发送邮件列表
        async function loadSentEmails(page = 1) {
          sentEmailsList.innerHTML = '<p class="text-gray-500 dark:text-gray-400" data-i18n="loading">' + (window.i18n ? window.i18n.t('loading') : '${t('loading', currentLang)}') + '</p>';
          
          try {
            const response = await fetch(\`/api/emails?page=\${page}&pageSize=\${pageSize}&type=sent\`);
            const result = await response.json();
            
            if (result.success) {
              const sentEmails = result.emails;
              totalPages = result.pagination.totalPages;
              totalCount = result.pagination.totalCount;
              currentPage = result.pagination.page;
              
              // 更新分页信息
              updatePagination();
              
              if (sentEmails.length === 0) {
                sentEmailsList.innerHTML = '<p class="text-gray-500 dark:text-gray-400" data-i18n="sent_empty">' + (window.i18n ? window.i18n.t('sent_empty') : '${t('sent_empty', currentLang)}') + '</p>';
                paginationControls.classList.add('hidden');
                return;
              }
              
              // 显示邮件列表
              let emailsHTML = '';
              sentEmails.forEach((email, index) => {
                const date = new Date(email.timestamp).toLocaleString();
                const sentTo = window.i18n ? window.i18n.t('sent_to') : '${t('sent_to', currentLang)}';
                emailsHTML += \`
                  <a href="/email/\${email.id}" class="email-item block py-4 px-3 hover:bg-gray-50 dark:hover:bg-blue-600/10 rounded-lg transition-colors duration-200">
                    <div class="flex justify-between">
                      <p class="font-semibold dark:text-white"><span data-i18n="sent_to">\${sentTo}</span>: \${email.to}</p>
                      <p class="text-gray-500 dark:text-gray-400 text-sm">\${date}</p>
                    </div>
                    <p class="text-lg font-medium dark:text-white">\${email.subject}</p>
                    <p class="text-gray-700 dark:text-gray-300 mb-3">\${email.text.length > 100 ? email.text.substring(0, 100) + '...' : email.text}</p>
                  </a>
                  \${index < sentEmails.length - 1 ? '<hr class="email-divider">' : ''}
                \`;
              });
              sentEmailsList.innerHTML = emailsHTML;
              
              // 如果有多页，显示分页控件
              if (totalPages > 1) {
                paginationControls.classList.remove('hidden');
              } else {
                paginationControls.classList.add('hidden');
              }
            } else {
              sentEmailsList.innerHTML = '<p class="text-red-500 dark:text-red-400" data-i18n="sent_load_error">' + (window.i18n ? window.i18n.t('sent_load_error') : '${t('sent_load_error', currentLang)}') + '</p>';
              paginationControls.classList.add('hidden');
            }
          } catch (error) {
            sentEmailsList.innerHTML = \`<p class="text-red-500 dark:text-red-400">\${window.i18n ? window.i18n.t('sent_load_error') : '${t('sent_load_error', currentLang)}'}: \${error.message}</p>\`;
            paginationControls.classList.add('hidden');
          }
        }
        
        // 更新分页控件
        function updatePagination() {
          // 更新页面信息文本
          const showingFrom = ((currentPage - 1) * pageSize) + 1;
          const showingTo = Math.min(currentPage * pageSize, totalCount);
          pageInfo.textContent = \`\${showingFrom}-\${showingTo} / \${totalCount}\`;
          
          // 更新上一页/下一页按钮状态
          prevPageBtn.disabled = currentPage <= 1;
          nextPageBtn.disabled = currentPage >= totalPages;
          
          // 生成页码按钮
          pageNumbers.innerHTML = '';
          
          // 确定要显示哪些页码
          let startPage = Math.max(1, currentPage - 2);
          let endPage = Math.min(totalPages, startPage + 4);
          
          // 如果页数不足5页，调整起始页
          if (endPage - startPage < 4) {
            startPage = Math.max(1, endPage - 4);
          }
          
          // 添加第一页
          if (startPage > 1) {
            const btn = document.createElement('button');
            btn.className = 'px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-white rounded hover:bg-gray-300 hover:text-gray-900 dark:hover:bg-blue-600 dark:hover:text-white';
            btn.textContent = '1';
            btn.addEventListener('click', () => loadSentEmails(1));
            pageNumbers.appendChild(btn);
            
            // 添加省略号
            if (startPage > 2) {
              const ellipsis = document.createElement('span');
              ellipsis.className = 'px-2 py-1 text-gray-500 dark:text-gray-400';
              ellipsis.textContent = '...';
              pageNumbers.appendChild(ellipsis);
            }
          }
          
          // 添加页码按钮
          for (let i = startPage; i <= endPage; i++) {
            const btn = document.createElement('button');
            if (i === currentPage) {
              btn.className = 'px-3 py-1 bg-blue-500 text-white rounded';
              // 确保在深色模式下选中按钮的样式正确
              if (document.documentElement.classList.contains('dark')) {
                btn.style.backgroundColor = '#3b82f6';
                btn.style.color = '#ffffff';
              }
            } else {
              btn.className = 'px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-white rounded hover:bg-gray-300 hover:text-gray-900 dark:hover:bg-blue-600 dark:hover:text-white';
            }
            btn.textContent = i.toString();
            btn.addEventListener('click', () => loadSentEmails(i));
            pageNumbers.appendChild(btn);
          }
          
          // 添加最后一页
          if (endPage < totalPages) {
            // 添加省略号
            if (endPage < totalPages - 1) {
              const ellipsis = document.createElement('span');
              ellipsis.className = 'px-2 py-1 text-gray-500 dark:text-gray-400';
              ellipsis.textContent = '...';
              pageNumbers.appendChild(ellipsis);
            }
            
            const btn = document.createElement('button');
            btn.className = 'px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-white rounded hover:bg-gray-300 hover:text-gray-900 dark:hover:bg-blue-600 dark:hover:text-white';
            btn.textContent = totalPages.toString();
            btn.addEventListener('click', () => loadSentEmails(totalPages));
            pageNumbers.appendChild(btn);
          }
        }
        
        // 绑定上一页/下一页按钮事件
        prevPageBtn.addEventListener('click', () => {
          if (currentPage > 1) {
            loadSentEmails(currentPage - 1);
          }
        });
        
        nextPageBtn.addEventListener('click', () => {
          if (currentPage < totalPages) {
            loadSentEmails(currentPage + 1);
          }
        });
        
        // 初始加载
        loadSentEmails();
      });
    </script>
  `;
  
  return renderPageTemplate(t('app_name', currentLang) + ' - ' + t('sent_title', currentLang), content, user, 'sent', request);
}

// 写邮件页面模板
function renderComposePage(user, request) {
  const currentLang = getCurrentLanguage(request);
  const content = html`
    <div class="container mx-auto px-4">
      <div class="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
        <h2 class="text-xl font-semibold mb-4 dark:text-white" data-i18n="compose_title">${t('compose_title', currentLang)}</h2>
        <form id="compose-form" class="space-y-4">
          <div>
            <label for="from" class="block mb-1 font-medium dark:text-white" data-i18n="compose_from">${t('compose_from', currentLang)}</label>
            <input type="text" id="from" name="from" placeholder="${user && user.username ? user.username + ' <' + (user.email || 'from@example.com') + '>' : 'Your Name <from@example.com>'}" value="${user && user.email ? (user.username ? user.username + ' <' + user.email + '>' : user.email) : ''}" class="w-full px-4 py-2 border rounded-lg">
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1" data-i18n="compose_default_from">${t('compose_default_from', currentLang)}</p>
          </div>
          
          <div>
            <label for="to" class="block mb-1 font-medium dark:text-white" data-i18n="compose_to">${t('compose_to', currentLang)}</label>
            <input type="text" id="to" name="to" placeholder="Name <to@example.com>" class="w-full px-4 py-2 border rounded-lg" required>
          </div>
          
          <div>
            <label for="subject" class="block mb-1 font-medium dark:text-white" data-i18n="compose_subject">${t('compose_subject', currentLang)}</label>
            <input type="text" id="subject" name="subject" placeholder="${t('compose_subject', currentLang)}" class="w-full px-4 py-2 border rounded-lg" required>
          </div>
          
          <div>
            <label for="text" class="block mb-1 font-medium dark:text-white" data-i18n="compose_text">${t('compose_text', currentLang)}</label>
            <textarea id="text" name="text" placeholder="${t('compose_text', currentLang)}" class="w-full px-4 py-2 border rounded-lg h-24" required></textarea>
          </div>
          
          <div>
            <label for="html" class="block mb-1 font-medium dark:text-white" data-i18n="compose_html">${t('compose_html', currentLang)}</label>
            <textarea id="html" name="html" placeholder="<p>${t('compose_html', currentLang)}</p>" class="w-full px-4 py-2 border rounded-lg h-48"></textarea>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1" data-i18n="compose_html_tip">${t('compose_html_tip', currentLang)}</p>
          </div>
          
          <!-- 附件上传组件 -->
          <div>
            <div class="flex items-center mb-2">
              <label class="block mb-1 font-medium dark:text-white" data-i18n="compose_attachments">${t('compose_attachments', currentLang)}</label>
              <span class="text-xs text-gray-500 dark:text-gray-400 ml-2">(${t('optional', currentLang) || '可选'})</span>
            </div>
            ${renderAttachmentUploader(currentLang)}
            <input type="hidden" id="attachments-data" name="attachments-data" value="[]">
          </div>
          
          <div class="flex justify-end">
            <button type="submit" class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium" data-i18n="compose_send">
              ${t('compose_send', currentLang)}
            </button>
          </div>
        </form>
      </div>
    </div>
    
    <script>
      document.addEventListener('DOMContentLoaded', () => {
        const composeForm = document.getElementById('compose-form');
        const attachmentsDataInput = document.getElementById('attachments-data');
        
        // 从URL参数中获取预填值
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('to')) {
          document.getElementById('to').value = urlParams.get('to');
        }
        if (urlParams.has('subject')) {
          document.getElementById('subject').value = urlParams.get('subject');
        }
        if (urlParams.has('text')) {
          document.getElementById('text').value = urlParams.get('text');
        }
        
        // 更新附件输入字段的函数
        window.updateAttachmentsInput = function(attachments) {
          attachmentsDataInput.value = JSON.stringify(attachments || []);
        };
        
        composeForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          
          // 显示发送中的提示
          if (window.toast) {
            window.toast.info(window.i18n ? window.i18n.t('compose_sending') : \`${t('compose_sending', currentLang)}\`);
          }
          
          const formData = new FormData(composeForm);
          const emailData = {
            to: formData.get('to'),
            subject: formData.get('subject'),
            text: formData.get('text'),
          };
          
          // 只有当HTML内容不为空时才添加到邮件数据中
          const htmlContent = formData.get('html');
          if (htmlContent && htmlContent.trim()) {
            emailData.html = htmlContent;
          } else {
            // 如果没有HTML内容，使用纯文本内容构建简单的HTML
            emailData.html = '<p>' + formData.get('text').replace(new RegExp('\\n', 'g'), '</p><p>') + '</p>';
          }
          
          if (formData.get('from')) {
            emailData.from = formData.get('from');
          }
          
          // 添加附件
          const attachmentsData = formData.get('attachments-data');
          if (attachmentsData && attachmentsData !== '[]') {
            try {
              const attachments = JSON.parse(attachmentsData);
              if (attachments && attachments.length > 0) {
                emailData.attachments = attachments.map(attachment => ({
                  path: attachment.url, // 使用附件的URL
                  filename: attachment.name // 使用原始文件名
                }));
              }
            } catch (error) {
              console.error('解析附件数据失败:', error);
            }
          }
          
          try {
            const response = await fetch('/api/send', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(emailData),
            });
            
            const result = await response.json();
            
            if (result.success) {
              // 显示成功提示
              if (window.toast) {
                window.toast.success(window.i18n ? window.i18n.t('compose_success') : \`${t('compose_success', currentLang)}\`);
              }
              composeForm.reset();
              // 清空附件列表
              if (window.clearAttachments) {
                window.clearAttachments();
              }
            } else {
              // 显示错误提示
              const errorMsg = window.i18n ? window.i18n.t('compose_error') : \`${t('compose_error', currentLang)}\`;
              const unknownError = window.i18n ? window.i18n.t('error_unknown') : \`${t('error_unknown', currentLang)}\`;
              if (window.toast) {
                window.toast.error(errorMsg + ': ' + (result.error || unknownError));
              }
            }
          } catch (error) {
            // 显示错误提示
            const errorMsg = window.i18n ? window.i18n.t('compose_error') : \`${t('compose_error', currentLang)}\`;
            if (window.toast) {
              window.toast.error(errorMsg + ': ' + error.message);
            }
          }
        });
      });
    </script>
  `;
  
  return renderPageTemplate(t('app_name', currentLang) + ' - ' + t('compose_title', currentLang), content, user, 'compose', request);
}

// 邮件详情页面模板
function renderEmailDetailPage(user, emailId, request) {
  const currentLang = getCurrentLanguage(request);
  const content = html`
    <div class="container mx-auto px-4">
      <div class="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-xl font-semibold dark:text-white" data-i18n="email_detail_title">${t('email_detail_title', currentLang)}</h2>
          <div class="flex flex-wrap gap-2">
            <button id="reply-btn-top" class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-lg font-medium flex items-center text-sm" data-i18n="email_detail_reply">
              <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"></path>
              </svg>
              ${t('email_detail_reply', currentLang)}
            </button>
            <button id="forward-btn-top" class="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded-lg font-medium flex items-center text-sm" data-i18n="email_detail_forward">
              <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
              </svg>
              ${t('email_detail_forward', currentLang)}
            </button>
          </div>
        </div>
        
        <div id="email-detail" class="space-y-4">
          <p class="text-gray-500 dark:text-gray-400" data-i18n="loading">${t('loading', currentLang)}</p>
        </div>
        
        <div class="mt-6 text-center">
          <button id="back-btn" class="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 px-4 py-2" data-i18n="email_detail_back">${t('email_detail_back', currentLang)}</button>
        </div>
      </div>
    </div>
    
    <script>
      document.addEventListener('DOMContentLoaded', async () => {
        const emailDetail = document.getElementById('email-detail');
        
        // 返回按钮的事件监听
        document.getElementById('back-btn').addEventListener('click', () => {
          // 使用浏览器历史记录返回上一页
          window.history.back();
        });
        
        // HTML转义函数，防止特殊字符被解析为HTML标签
        function escapeHtml(unsafe) {
          return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
        }
        
        // 获取邮件详情
        try {
          const response = await fetch('/api/emails/${emailId}');
          const result = await response.json();
          
          if (result.success) {
            const email = result.data;
            const date = new Date(email.timestamp).toLocaleString();
            
            // 转义发件人和收件人，防止HTML标签被错误解析
            const safeFrom = escapeHtml(email.from);
            const safeTo = escapeHtml(email.to);
            
            // 构建邮件详情HTML
            let detailHTML = \`
              <div class="border-b dark:border-gray-700 pb-4">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p class="text-sm text-gray-500 dark:text-gray-400" data-i18n="email_detail_from">${t('email_detail_from', currentLang)}</p>
                    <p class="font-semibold dark:text-white break-all">\${safeFrom}</p>
                  </div>
                  <div>
                    <p class="text-sm text-gray-500 dark:text-gray-400" data-i18n="email_detail_to">${t('email_detail_to', currentLang)}</p>
                    <p class="font-semibold dark:text-white break-all">\${safeTo}</p>
                  </div>
                  <div>
                    <p class="text-sm text-gray-500 dark:text-gray-400" data-i18n="email_detail_date">${t('email_detail_date', currentLang)}</p>
                    <p class="font-semibold dark:text-white">\${date}</p>
                  </div>
                </div>
                <div class="mt-4">
                  <p class="text-sm text-gray-500 dark:text-gray-400" data-i18n="email_detail_subject">${t('email_detail_subject', currentLang)}</p>
                  <p class="text-xl font-semibold dark:text-white">\${escapeHtml(email.subject)}</p>
                </div>
              </div>
              
              <div class="mt-6">
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-2" data-i18n="email_detail_content">${t('email_detail_content', currentLang)}</p>
                <div class="prose dark:prose-invert max-w-none">
                  \${email.html || '<p>' + escapeHtml(email.text) + '</p>'}
                </div>
              </div>
            \`;
            
            // 添加附件部分
            if (email.attachments && email.attachments.length > 0) {
              detailHTML += \`
                <div class="mt-6 border-t dark:border-gray-700 pt-4">
                  <p class="text-sm text-gray-500 dark:text-gray-400 mb-2" data-i18n="email_detail_attachments">${t('email_detail_attachments', currentLang)}</p>
                  <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              \`;
              
              email.attachments.forEach(attachment => {
                const fileName = attachment.filename || (attachment.path ? attachment.path.split('/').pop() : 'file');
                detailHTML += \`
                  <a href="\${attachment.path}" target="_blank" class="flex items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    <svg class="w-6 h-6 text-blue-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                    <span class="text-sm font-medium text-gray-900 dark:text-white truncate">\${escapeHtml(fileName)}</span>
                  </a>
                \`;
              });
              
              detailHTML += \`
                  </div>
                </div>
              \`;
            }
            
            emailDetail.innerHTML = detailHTML;
            
            // 设置回复按钮事件
            document.getElementById('reply-btn-top').addEventListener('click', () => {
              // 构建回复邮件的URL，带上原始邮件的信息
              const replyUrl = \`/compose?to=\${encodeURIComponent(email.from)}&subject=\${encodeURIComponent('Re: ' + email.subject)}&text=\${encodeURIComponent('\\n\\n---------- 原始邮件 ----------\\nFrom: ' + email.from + '\\nDate: ' + date + '\\nSubject: ' + email.subject + '\\nTo: ' + email.to + '\\n\\n' + email.text)}\`;
              window.location.href = replyUrl;
            });
            
            // 设置转发按钮事件
            document.getElementById('forward-btn-top').addEventListener('click', () => {
              // 构建转发邮件的URL，带上原始邮件的信息
              const forwardUrl = \`/compose?subject=\${encodeURIComponent('Fw: ' + email.subject)}&text=\${encodeURIComponent('---------- 转发邮件 ----------\\nFrom: ' + email.from + '\\nDate: ' + date + '\\nSubject: ' + email.subject + '\\nTo: ' + email.to + '\\n\\n' + email.text)}\`;
              window.location.href = forwardUrl;
            });
          } else {
            emailDetail.innerHTML = \`<p class="text-red-500 dark:text-red-400" data-i18n="email_detail_not_found">${t('email_detail_not_found', currentLang)}</p>\`;
          }
        } catch (error) {
          emailDetail.innerHTML = \`<p class="text-red-500 dark:text-red-400">\${error.message}</p>\`;
        }
      });
    </script>
  `;
  
  return renderPageTemplate(t('app_name', currentLang) + ' - ' + t('email_detail_title', currentLang), content, user, null, request);
}

// 诊断页面模板
function renderDiagnosticPage(user, request) {
  const currentLang = getCurrentLanguage(request);
  const content = html`
    <div class="container mx-auto px-4">
      <div class="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
        <h2 class="text-xl font-semibold mb-4 dark:text-white" data-i18n="diagnostic_title">系统诊断</h2>
        
        <!-- 环境信息检查 -->
        <div class="mb-8">
          <h3 class="text-lg font-medium mb-3 dark:text-white" data-i18n="diagnostic_env_title">环境配置检查</h3>
          <button id="check-env-btn" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg mb-4" data-i18n="diagnostic_check_env">检查环境</button>
          <div id="env-results" class="hidden">
            <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
              <pre id="env-output" class="text-sm dark:text-gray-300 whitespace-pre-wrap"></pre>
            </div>
          </div>
        </div>
        
        <!-- 附件上传测试 -->
        <div class="mb-8">
          <h3 class="text-lg font-medium mb-3 dark:text-white" data-i18n="diagnostic_upload_title">附件上传测试</h3>
          <div class="mb-4">
            <input type="file" id="test-file-input" class="block w-full text-sm text-gray-500 dark:text-gray-400
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100 dark:file:bg-blue-900 dark:file:text-blue-300">
          </div>
          <button id="test-upload-btn" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg mb-4" data-i18n="diagnostic_test_upload">测试上传</button>
          <div id="upload-results" class="hidden">
            <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
              <pre id="upload-output" class="text-sm dark:text-gray-300 whitespace-pre-wrap"></pre>
            </div>
          </div>
        </div>
        
        <!-- 操作指南 -->
        <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
          <h4 class="text-md font-medium text-yellow-800 dark:text-yellow-200 mb-2" data-i18n="diagnostic_guide_title">使用指南</h4>
          <ul class="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
            <li data-i18n="diagnostic_guide_1">• 环境检查将显示 KV 存储、R2 存储和 API 密钥的配置状态</li>
            <li data-i18n="diagnostic_guide_2">• 附件上传测试将验证文件上传到 R2 存储的完整流程</li>
            <li data-i18n="diagnostic_guide_3">• 如果测试失败，请检查 Cloudflare Workers 的绑定配置</li>
            <li data-i18n="diagnostic_guide_4">• 测试文件会在测试完成后自动删除</li>
          </ul>
        </div>
      </div>
    </div>
    
    <script>
      document.addEventListener('DOMContentLoaded', () => {
        const checkEnvBtn = document.getElementById('check-env-btn');
        const envResults = document.getElementById('env-results');
        const envOutput = document.getElementById('env-output');
        
        const testUploadBtn = document.getElementById('test-upload-btn');
        const testFileInput = document.getElementById('test-file-input');
        const uploadResults = document.getElementById('upload-results');
        const uploadOutput = document.getElementById('upload-output');
        
        // 环境检查

        checkEnvBtn.addEventListener('click', async () => {
          try {
            checkEnvBtn.disabled = true;
            checkEnvBtn.textContent = '检查中...';
            
            const response = await fetch('/api/diagnostic/env');
            const result = await response.json();
            
            envOutput.textContent = JSON.stringify(result, null, 2);
            envResults.classList.remove('hidden');
            
            // 显示友好的状态信息
            let statusMessage = '环境检查结果:\\n\\n';
            statusMessage += \`KV 存储 (EMAIL_STORE): \${result.hasEmailStore ? '✅ 已配置' : '❌ 未配置'}\\n\`;
            statusMessage += \`R2 存储 (EMAIL_ATTACHMENTS): \${result.hasEmailAttachments ? '✅ 已配置' : '❌ 未配置'}\\n\`;
            statusMessage += \`Resend API Key: \${result.hasResendApiKey ? '✅ 已配置' : '❌ 未配置'}\\n\\n\`;
            
            if (result.kvTest) {
              statusMessage += \`KV 存储测试: \${result.kvTest.success ? '✅ 正常' : '❌ 失败'}\\n\`;
              if (!result.kvTest.success && result.kvTest.error) {
                statusMessage += \`  错误: \${result.kvTest.error}\\n\`;
              }
            }
            
            if (result.r2Test) {
              statusMessage += \`R2 存储测试: \${result.r2Test.success ? '✅ 正常' : '❌ 失败'}\\n\`;
              if (!result.r2Test.success && result.r2Test.error) {
                statusMessage += \`  错误: \${result.r2Test.error}\\n\`;
              }
            }
            
            statusMessage += '\\n' + '详细信息:' + '\\n' + JSON.stringify(result, null, 2);
            envOutput.textContent = statusMessage;
            
          } catch (error) {
            envOutput.textContent = \`检查失败: \${error.message}\\n\\n详细错误:\\n\${error.stack || error}\`;
            envResults.classList.remove('hidden');
          } finally {
            checkEnvBtn.disabled = false;
            checkEnvBtn.textContent = '检查环境';
          }
        });
        
        // 附件上传测试
        testUploadBtn.addEventListener('click', async () => {
          const file = testFileInput.files[0];
          if (!file) {
            if (window.toast) {
              window.toast.warning('请先选择要测试的文件');
            } else {
              alert('请先选择要测试的文件');
            }
            return;
          }
          
          try {
            testUploadBtn.disabled = true;
            testUploadBtn.textContent = '测试中...';
            
            const formData = new FormData();
            formData.append('file', file);
            
            const response = await fetch('/api/diagnostic/upload-test', {
              method: 'POST',
              body: formData
            });
            
            const result = await response.json();
            
            // 显示友好的状态信息
            let statusMessage = '附件上传测试结果:\\n\\n';
            statusMessage += \`文件信息:\\n\`;
            statusMessage += \`  名称: \${result.file ? result.file.name : '无'}\\n\`;
            statusMessage += \`  大小: \${result.file ? result.file.size + ' bytes' : '无'}\\n\`;
            statusMessage += \`  类型: \${result.file ? result.file.type : '无'}\\n\\n\`;
            
            if (result.file) {
              statusMessage += \`文件读取: \${result.file.readSuccess ? '✅ 成功' : '❌ 失败'}\\n\`;
              if (!result.file.readSuccess && result.file.readError) {
                statusMessage += \`  错误: \${result.file.readError}\\n\`;
              }
            }
            
            if (result.upload) {
              statusMessage += \`R2 上传: \${result.upload.success ? '✅ 成功' : '❌ 失败'}\\n\`;
              if (result.upload.success) {
                statusMessage += \`  上传文件名: \${result.upload.filename}\\n\`;
                statusMessage += \`  上传大小: \${result.upload.uploadedSize} bytes\\n\`;
              } else if (result.upload.error) {
                statusMessage += \`  错误: \${result.upload.error}\\n\`;
              }
            }
            
            statusMessage += '\\n' + '详细信息:' + '\\n' + JSON.stringify(result, null, 2);
            uploadOutput.textContent = statusMessage;
            uploadResults.classList.remove('hidden');
            
            if (result.upload && result.upload.success) {
              if (window.toast) {
                window.toast.success('附件上传测试成功！');
              }
            } else {
              if (window.toast) {
                window.toast.error('附件上传测试失败，请检查配置');
              }
            }
            
          } catch (error) {
            uploadOutput.textContent = \`测试失败: \${error.message}\\n\\n详细错误:\\n\${error.stack || error}\`;
            uploadResults.classList.remove('hidden');
            
            if (window.toast) {
              window.toast.error('附件上传测试失败: ' + error.message);
            }
          } finally {
            testUploadBtn.disabled = false;
            testUploadBtn.textContent = '测试上传';
          }
        });
      });
    </script>
  `;
  
  return renderPageTemplate(t('app_name', currentLang) + ' - 系统诊断', content, user, 'diagnostic', request);
}

// 登录页面模板
function renderLoginPage(request) {
  const currentLang = getCurrentLanguage(request);
  const content = html`
    <div class="container mx-auto px-4 flex items-center justify-center" style="min-height: calc(100vh - 2rem);">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 w-full max-w-md">
        <h1 class="text-2xl font-bold text-center text-blue-600 dark:text-blue-400 mt-4 mb-8" data-i18n="app_name">${t('app_name', currentLang)}</h1>
        
        <form id="login-form" class="space-y-6">
          <div>
            <label for="username" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" data-i18n="login_username">${t('login_username', currentLang)}</label>
            <input type="text" id="username" name="username" required class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
          </div>
          
          <div>
            <label for="password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" data-i18n="login_password">${t('login_password', currentLang)}</label>
            <input type="password" id="password" name="password" required class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
          </div>
          
          <div class="flex items-center">
            <div class="flex items-center">
              <input id="remember-me" name="remember-me" type="checkbox" class="h-4 w-4 text-blue-600">
              <label for="remember-me" class="ml-2 block text-sm text-gray-700 dark:text-gray-300" data-i18n="login_remember">${t('login_remember', currentLang)}</label>
            </div>
          </div>
          
          <div>
            <button type="submit" class="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500" data-i18n="login_button">
              ${t('login_button', currentLang)}
            </button>
          </div>
        </form>
        
        <div id="login-status" class="mt-4 hidden"></div>
        
        <div class="mt-6">
          <p class="text-center text-xs text-gray-500 dark:text-gray-400 mt-2" data-i18n="login_info">
            ${t('login_info', currentLang)}
          </p>
        </div>
        
        <!-- 添加语言切换功能到登录页面 -->
        <div class="mt-6 flex justify-center">
          <div class="relative" id="login-lang-dropdown">
            <button class="text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg">
              <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"></path>
              </svg>
              <span class="text-sm" data-i18n="settings_language">${t('settings_language', currentLang)}</span>
            </button>
            <div class="absolute mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg hidden z-20 border border-gray-200 dark:border-gray-700" id="login-lang-menu">
              <div class="py-1">
                <button data-lang="zh-CN" class="login-lang-option block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-blue-600 dark:hover:text-white">
                  <span data-i18n="settings_language_zh">${t('settings_language_zh', currentLang)}</span>
                </button>
                <button data-lang="en-US" class="login-lang-option block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-blue-600 dark:hover:text-white">
                  <span data-i18n="settings_language_en">${t('settings_language_en', currentLang)}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <script>
        document.addEventListener('DOMContentLoaded', () => {
          const loginForm = document.getElementById('login-form');
          const loginStatus = document.getElementById('login-status');
          
          // 添加自定义样式，确保深色模式下按钮悬停样式不被覆盖
          const customStyle = document.createElement('style');
          customStyle.textContent = 
            '.dark .login-lang-option:hover {' + 
            '  background-color: #2563eb !important;' + 
            '  color: #ffffff !important;' + 
            '}';
          document.head.appendChild(customStyle);
          
          loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            
            loginStatus.className = 'mt-4 p-4 bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 rounded-lg';
            loginStatus.innerHTML = '<span data-i18n="login_processing">' + (window.i18n ? window.i18n.t('login_processing') : '${t('login_processing', currentLang)}') + '</span>';
            loginStatus.classList.remove('hidden');
            
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            
            try {
              const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password }),
              });
              
              const result = await response.json();
              
              if (result.success) {
                loginStatus.className = 'mt-4 p-4 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-lg';
                loginStatus.innerHTML = '<span data-i18n="login_success">' + (window.i18n ? window.i18n.t('login_success') : '${t('login_success', currentLang)}') + '</span>';
                window.location.href = '/';
              } else {
                loginStatus.className = 'mt-4 p-4 bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 rounded-lg';
                const errorMsg = window.i18n ? window.i18n.t('login_error') : '${t('login_error', currentLang)}';
                const unknownError = window.i18n ? window.i18n.t('error_unknown') : '${t('error_unknown', currentLang)}';
                loginStatus.innerHTML = \`<span data-i18n="login_error">\${errorMsg}</span>: \${result.message || unknownError}\`;
              }
            } catch (error) {
              loginStatus.className = 'mt-4 p-4 bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 rounded-lg';
              const errorMsg = window.i18n ? window.i18n.t('login_error') : '${t('login_error', currentLang)}';
              loginStatus.innerHTML = \`<span data-i18n="login_error">\${errorMsg}</span>: \${error.message}\`;
            }
          });
          
          // 登录页面的语言切换功能
          const langDropdown = document.getElementById('login-lang-dropdown');
          const langMenu = document.getElementById('login-lang-menu');
          const langOptions = document.querySelectorAll('.login-lang-option');
          
          if (langDropdown) {
            langDropdown.addEventListener('click', function(e) {
              e.stopPropagation();
              langMenu.classList.toggle('hidden');
            });
            
            langOptions.forEach(function(option) {
              option.addEventListener('click', function() {
                const language = this.dataset.lang;
                
                // 保存语言设置
                localStorage.setItem('email-system-language', language);
                document.cookie = 'email-system-language=' + language + '; path=/; max-age=2592000; SameSite=Strict';
                
                // 隐藏菜单
                langMenu.classList.add('hidden');
                
                // 应用翻译
                if (window.i18n && typeof window.i18n.applyTranslations === 'function') {
                  window.i18n.applyTranslations();
                } else {
                  // 如果没有i18n对象，刷新页面
                  window.location.reload();
                }
              });
            });
            
            // 点击页面其他地方关闭下拉菜单
            document.addEventListener('click', () => {
              langMenu.classList.add('hidden');
            });
          }
        });
      </script>
    </div>
  `;
  
  return renderPageTemplate(t('app_name', currentLang) + ' - ' + t('login_title', currentLang), content, null, null, request);
}

// 页面模板基础
function renderPageTemplate(title, content, user = null, currentPage = null, request = null) {
  // 获取当前语言，确保在服务器端渲染时也能正确工作
  const currentLang = getCurrentLanguage(request);
  
  return html`
    <!DOCTYPE html>
    <html lang="${currentLang}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="language" content="${currentLang}">
      <title>${title}</title>
      <link rel="icon" href="/static/favicon.ico" type="image/x-icon">
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
      <style>
        /* 暗黑模式样式 */
        .dark body {
          background-color: #1a202c;
          color: #e2e8f0;
        }
        
        /* 确保深色模式下面板和文字颜色正确 */
        .dark .bg-white {
          background-color: #2d3748 !important;
        }
        
        .dark .text-gray-700 {
          color: #e2e8f0 !important;
        }
        
        .dark .text-gray-900 {
          color: #f7fafc !important;
        }
        
        .dark .border-gray-200 {
          border-color: #4a5568 !important;
        }
        
        /* 确保深色模式下选中的按钮显示为蓝色 */
        .dark .bg-blue-500 {
          background-color: #3b82f6 !important;
        }
        
        /* 确保附件在深色模式下有正确的背景颜色 - 使用更高的优先级 */
        .dark .bg-gray-50 {
          background-color: #374151 !important; /* dark:bg-gray-800 equivalent */
        }
        
        /* 附件悬停状态 */
        .dark .bg-gray-50:hover,
        .dark .hover\\:bg-gray-100:hover {
          background-color: #4b5563 !important; /* dark:hover:bg-gray-700 equivalent */
        }
        
        /* 确保主页样式正确生效 */
        .container {
          max-width: 1200px !important;
          margin-left: auto !important;
          margin-right: auto !important;
        }
        
        /* 导航栏按钮样式 - 使用最高优先级 */
        .dark nav a.nav-link:hover {
          background-color: #2563eb !important; /* bg-blue-600 */
          color: #ffffff !important; /* text-white */
        }
        
        /* 导航栏当前选中按钮样式 */
        .dark nav a.bg-blue-600,
        .dark nav a.nav-link.bg-blue-600 {
          background-color: #2563eb !important; /* bg-blue-600 */
          color: #ffffff !important; /* text-white */
        }
        
        /* 更具体的导航栏按钮悬停样式 */
        .dark nav a[data-i18n="nav_inbox"]:hover,
        .dark nav a[data-i18n="nav_sent"]:hover,
        .dark nav a[data-i18n="nav_compose"]:hover {
          background-color: #2563eb !important; /* bg-blue-600 */
          color: #ffffff !important; /* text-white */
        }
        
        /* 深色模式下输入框样式 */
        .dark input[type="text"],
        .dark input[type="email"],
        .dark input[type="password"],
        .dark textarea {
          background-color: #4a5568 !important;
          border-color: #4b5563 !important;
          color: #f3f4f6 !important;
        }
        
        .dark input::placeholder,
        .dark textarea::placeholder {
          color: #9ca3af !important;
        }
        
        .dark input:focus,
        .dark textarea:focus {
          border-color: #3b82f6 !important;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3) !important;
        }
        
        /* 复选框样式 */
        .dark input[type="checkbox"] {
          background-color: #4a5568;
          border-color: #6b7280;
        }
        
        .dark input[type="checkbox"]:checked {
          background-color: #3b82f6;
          border-color: #3b82f6;
        }
        
        /* 深色模式下按钮悬停样式 - 使用高优先级确保不被覆盖 */
        .dark button:hover, 
        .dark .theme-option:hover, 
        .dark .lang-option:hover, 
        .dark .login-lang-option:hover,
        .dark .theme-btn:hover,
        .dark .lang-btn:hover {
          background-color: #2563eb !important; /* bg-blue-600 */
          color: #ffffff !important; /* text-white */
        }
        
        /* 禁用状态的按钮不应用悬停效果 */
        .dark button:disabled:hover {
          background-color: #4b5563 !important; /* dark:bg-gray-700 with opacity */
          color: rgba(255, 255, 255, 0.5) !important; /* dark:text-white with opacity */
          opacity: 0.5;
        }
        
        /* 分页按钮特定样式 */
        .dark #prev-page,
        .dark #next-page,
        .dark #page-numbers button {
          background-color: #4b5563 !important; /* dark:bg-gray-700 */
          color: #ffffff !important; /* dark:text-white */
        }
        
        /* 选中状态的页码按钮保持蓝色背景 */
        .dark #page-numbers button.bg-blue-500,
        .dark #page-numbers button[class*="bg-blue-500"] {
          background-color: #3b82f6 !important; /* bg-blue-500 */
          color: #ffffff !important; /* text-white */
        }
        
        .dark #prev-page:hover:not(:disabled),
        .dark #next-page:hover:not(:disabled),
        .dark #page-numbers button:hover:not(:disabled) {
          background-color: #2563eb !important; /* bg-blue-600 */
          color: #ffffff !important; /* text-white */
        }
        
        /* 下拉菜单选项特定样式 */
        .dark #theme-menu button:hover,
        .dark #lang-menu button:hover,
        .dark #login-lang-menu button:hover {
          background-color: #2563eb !important; /* bg-blue-600 */
          color: #ffffff !important; /* text-white */
        }
        
        /* 弹窗样式 */
        .toast-container {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 99999;
          max-width: 350px;
          pointer-events: none;
        }
        
        .toast {
          padding: 16px;
          border-radius: 8px;
          margin-bottom: 10px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          display: flex;
          align-items: center;
          animation: slideIn 0.3s ease-out forwards;
          pointer-events: auto;
        }
        
        .toast-success {
          background-color: #d1fae5;
          color: #065f46;
          border-left: 4px solid #10b981;
        }
        
        .toast-error {
          background-color: #fee2e2;
          color: #b91c1c;
          border-left: 4px solid #ef4444;
        }
        
        .toast-warning {
          background-color: #fef3c7;
          color: #92400e;
          border-left: 4px solid #f59e0b;
        }
        
        .toast-info {
          background-color: #e0f2fe;
          color: #0369a1;
          border-left: 4px solid #0ea5e9;
        }
        
        .dark .toast-success {
          background-color: #064e3b;
          color: #a7f3d0;
          border-left: 4px solid #10b981;
        }
        
        .dark .toast-error {
          background-color: #7f1d1d;
          color: #fecaca;
          border-left: 4px solid #ef4444;
        }
        
        .dark .toast-warning {
          background-color: #78350f;
          color: #fde68a;
          border-left: 4px solid #f59e0b;
        }
        
        .dark .toast-info {
          background-color: #0c4a6e;
          color: #bae6fd;
          border-left: 4px solid #0ea5e9;
        }
        
        .toast-icon {
          margin-right: 12px;
          flex-shrink: 0;
        }
        
        .toast-content {
          flex-grow: 1;
        }
        
        .toast-close {
          flex-shrink: 0;
          cursor: pointer;
          margin-left: 12px;
        }
        
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        
        @keyframes fadeOut {
          from {
            opacity: 1;
          }
          to {
            opacity: 0;
          }
        }
        
        /* 导航栏按钮样式 */
        .dark nav a.nav-link:hover {
          background-color: #2563eb !important; /* bg-blue-600 */
          color: #ffffff !important; /* text-white */
        }
        
        /* 导航栏当前选中按钮样式 */
        .dark nav a.bg-blue-600,
        .dark nav a.nav-link.bg-blue-600 {
          background-color: #2563eb !important; /* bg-blue-600 */
          color: #ffffff !important; /* text-white */
        }
        
        /* 更具体的导航栏按钮悬停样式 */
        .dark nav a[data-i18n="nav_inbox"]:hover,
        .dark nav a[data-i18n="nav_sent"]:hover,
        .dark nav a[data-i18n="nav_compose"]:hover,
        .dark nav a[data-i18n="nav_diagnostic"]:hover {
          background-color: #2563eb !important; /* bg-blue-600 */
          color: #ffffff !important; /* text-white */
        }
      </style>
      <script>
        // 立即初始化toast系统，不等待DOMContentLoaded
        window.toast = {
          container: null,
          
          init: function() {
            // 创建toast容器
            if (!this.container) {
              this.container = document.createElement('div');
              this.container.className = 'toast-container';
              document.body.appendChild(this.container);
            }
          },
          
          show: function(message, type = 'info', duration = 3000) {
            this.init();
            
            // 创建toast元素
            const toast = document.createElement('div');
            toast.className = 'toast toast-' + type;
            
            // 根据类型设置图标
            let iconSvg = '';
            switch (type) {
              case 'success':
                iconSvg = '<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>';
                break;
              case 'error':
                iconSvg = '<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path></svg>';
                break;
              case 'warning':
                iconSvg = '<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707a1 1 0 001.414 0z" clip-rule="evenodd"></path>';
                break;
              default:
                iconSvg = '<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path></svg>';
            }
            
            // 设置toast内容 - 使用字符串拼接而不是模板字符串
            toast.innerHTML = '<div class="toast-icon">' + iconSvg + '</div>' +
                              '<div class="toast-content">' + message + '</div>' +
                              '<div class="toast-close">' +
                                '<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">' +
                                  '<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>' +
                                '</svg>' +
                              '</div>';
            
            // 添加到容器
            this.container.appendChild(toast);
            
            // 添加关闭事件
            const closeBtn = toast.querySelector('.toast-close');
            closeBtn.addEventListener('click', () => {
              this.close(toast);
            });
            
            // 自动关闭
            if (duration > 0) {
              setTimeout(() => {
                if (toast.parentNode) {
                  this.close(toast);
                }
              }, duration);
            }
            
            return toast;
          },
          
          success: function(message, duration = 3000) {
            return this.show(message, 'success', duration);
          },
          
          error: function(message, duration = 3000) {
            return this.show(message, 'error', duration);
          },
          
          warning: function(message, duration = 3000) {
            return this.show(message, 'warning', duration);
          },
          
          info: function(message, duration = 3000) {
            return this.show(message, 'info', duration);
          },
          
          close: function(toast) {
            toast.style.animation = 'fadeOut 0.3s ease-out forwards';
            setTimeout(() => {
              if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
              }
            }, 300);
          }
        };
        
        // 初始化主题
        (function() {
          // 获取保存的主题设置
          function getCookie(name) {
            const value = '; ' + document.cookie;
            const parts = value.split('; ' + name + '=');
            if (parts.length === 2) return parts.pop().split(';').shift();
            return null;
          }
          
          // 优先从cookie获取
          const cookieTheme = getCookie('email-system-theme');
          // 其次从localStorage获取
          const savedTheme = cookieTheme || localStorage.getItem('email-system-theme');
          
          if (savedTheme === 'dark') {
            document.documentElement.classList.add('dark');
          } else if (savedTheme === 'light') {
            document.documentElement.classList.remove('dark');
          } else if (savedTheme === 'system' || !savedTheme) {
            // 系统主题或未设置
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
              document.documentElement.classList.add('dark');
            } else {
              document.documentElement.classList.remove('dark');
            }
            
            // 监听系统主题变化
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
              document.documentElement.classList.toggle('dark', e.matches);
            });
          }
        })();
      </script>
      <!-- 添加客户端国际化支持 -->
      <script>
        // 所有翻译数据
        window.translations = ${JSON.stringify(allTranslations).replace(/&quot;/g, '"')};
        
        // 客户端国际化初始化
        document.addEventListener('DOMContentLoaded', function() {
          // 如果window.i18n不存在（说明i18n模块的客户端部分没有正确加载），则手动实现
          if (!window.i18n) {
            window.i18n = {
              getCurrentLanguage: function() {
                // 优先从localStorage获取
                const savedLang = localStorage.getItem('email-system-language');
                if (savedLang && window.translations[savedLang]) {
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
                if (cookieLang && window.translations[cookieLang]) {
                  return cookieLang;
                }
                
                // 从浏览器语言获取
                const browserLang = navigator.language;
                if (browserLang && window.translations[browserLang]) {
                  return browserLang;
                }
                
                // 检查语言主要部分
                const mainLang = browserLang.split('-')[0];
                for (const lang in window.translations) {
                  if (lang.startsWith(mainLang)) {
                    return lang;
                  }
                }
                
                // 默认语言
                return 'zh-CN';
              },
              
              t: function(key) {
                const currentLang = this.getCurrentLanguage();
                const trans = window.translations[currentLang] || window.translations['zh-CN'];
                return trans[key] || window.translations['zh-CN'][key] || key;
              },
              
              setLanguage: function(lang) {
                if (window.translations[lang]) {
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
          }
          
          // 应用客户端语言
          const clientLang = window.i18n.getCurrentLanguage();
          
          // 如果客户端语言与HTML语言不一致，需要重新应用翻译
          if (clientLang !== document.documentElement.lang) {
            window.i18n.applyTranslations();
          }
        });
      </script>
    </head>
    <body class="bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen">
      ${renderSettingsPanel()}
      ${user ? renderHeader(user, currentPage, request) : ''}
      ${content}
    </body>
    </html>
  `;
}

// 添加中间件来处理语言
app.use('*', async (c, next) => {
  // 将请求对象添加到上下文中，供i18n模块使用
  c.set('request', c.req);
  await next();
});

// 处理静态文件
app.get('/static/*', serveStatic({ root: './' }));

// 导出应用
export default {
  fetch: app.fetch,
};
