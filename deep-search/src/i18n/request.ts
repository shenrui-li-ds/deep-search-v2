import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { defaultLocale, isValidLocale, type Locale } from './config';

// Parse Accept-Language header and find best matching locale
function detectLocaleFromHeader(acceptLanguage: string | null): Locale | null {
  if (!acceptLanguage) return null;

  // Parse Accept-Language header (e.g., "zh-CN,zh;q=0.9,en;q=0.8")
  const languages = acceptLanguage
    .split(',')
    .map((lang) => {
      const [code, qValue] = lang.trim().split(';q=');
      return {
        code: code.toLowerCase(),
        q: qValue ? parseFloat(qValue) : 1.0,
      };
    })
    .sort((a, b) => b.q - a.q);

  // Find first matching supported locale
  for (const { code } of languages) {
    if (code.startsWith('zh')) {
      return 'zh';
    }
    if (code.startsWith('en')) {
      return 'en';
    }
  }

  return null;
}

export default getRequestConfig(async () => {
  // Read locale from cookie first (user preference)
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get('locale')?.value;

  let locale: Locale;

  if (localeCookie && isValidLocale(localeCookie)) {
    // Use saved user preference
    locale = localeCookie;
  } else {
    // Auto-detect from Accept-Language header
    const headerStore = await headers();
    const acceptLanguage = headerStore.get('accept-language');
    const detectedLocale = detectLocaleFromHeader(acceptLanguage);
    locale = detectedLocale || defaultLocale;
  }

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
