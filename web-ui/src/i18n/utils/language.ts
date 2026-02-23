/**
 * 语言检测工具函数
 */

const STORAGE_KEY = 'mantis-language';

/**
 * 获取浏览器默认语言
 */
export function getBrowserLanguage(): string {
  const lang = navigator.language.toLowerCase();
  if (lang.startsWith('zh')) return 'zh';
  if (lang.startsWith('en')) return 'en';
  return 'en'; // 默认英文
}

/**
 * 获取保存的语言偏好
 */
export function getSavedLanguage(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

/**
 * 保存语言偏好
 */
export function saveLanguage(lang: string): void {
  localStorage.setItem(STORAGE_KEY, lang);
}

/**
 * 获取初始语言（优先级：缓存 > 浏览器 > 默认）
 */
export function getInitialLanguage(): { language: string; showSelector: boolean } {
  const saved = getSavedLanguage();
  if (saved && (saved === 'zh' || saved === 'en')) {
    return { language: saved, showSelector: false };
  }

  const browserLang = getBrowserLanguage();
  if (browserLang === 'zh' || browserLang === 'en') {
    return { language: browserLang, showSelector: false };
  }

  // 其他语言，显示选择器
  return { language: 'en', showSelector: true };
}
