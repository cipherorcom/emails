// 设置API处理模块
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { THEMES } from '../utils/theme';
import { supportedLanguages } from '../i18n';

// 创建设置API路由
const settingsApi = new Hono();

// 设置验证模式
const settingsSchema = z.object({
  theme: z.enum([THEMES.LIGHT, THEMES.DARK, THEMES.SYSTEM]),
  language: z.string().refine(lang => Object.keys(supportedLanguages).includes(lang), {
    message: '不支持的语言'
  })
});

// 保存设置
settingsApi.post('/', zValidator('json', settingsSchema), async (c) => {
  try {
    const { theme, language } = c.req.valid('json');
    
    // 获取会话
    const session = c.get('session');
    
    // 保存设置到会话
    const settings = session.get('settings') || {};
    settings.theme = theme;
    settings.language = language;
    session.set('settings', settings);
    
    // 同时设置Cookie以确保持久化
    c.header('Set-Cookie', 'email-system-theme=' + theme + '; Path=/; Max-Age=2592000; SameSite=Strict');
    c.header('Set-Cookie', 'email-system-language=' + language + '; Path=/; Max-Age=2592000; SameSite=Strict');
    
    // 返回设置
    return c.json({ 
      success: true, 
      settings: {
        theme,
        language
      }
    });
  } catch (error) {
    return c.json({ success: false, message: '保存设置失败', error: error.message }, 500);
  }
});

// 获取设置
settingsApi.get('/', async (c) => {
  try {
    // 从Cookie中获取设置
    const cookieHeader = c.req.header('cookie') || '';
    
    // 获取主题设置
    const themeMatch = cookieHeader.match(/email-system-theme=([^;]+)/);
    const theme = themeMatch ? themeMatch[1] : 'system';
    
    // 获取语言设置
    const langMatch = cookieHeader.match(/email-system-language=([^;]+)/);
    const language = langMatch ? langMatch[1] : 'zh-CN';
    
    return c.json({
      success: true,
      data: {
        theme,
        language
      }
    });
  } catch (error) {
    return c.json({
      success: false,
      message: '获取设置失败',
      error: error.message
    }, 500);
  }
});

export default settingsApi; 