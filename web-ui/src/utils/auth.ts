// web-ui/src/utils/auth.ts
// 前端鉴权工具：token 存取 + fetch 请求 header 注入

const AUTH_TOKEN_KEY = 'mantis_auth_token';

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

/**
 * 返回需要附加到 fetch 请求的 Authorization header
 * 若无 token 则返回空对象
 */
export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/**
 * 带鉴权 header 的 fetch 包装
 * 若收到 401，自动清除 token 并派发 auth:unauthorized 事件（由 App 监听后跳转登录页）
 * 不再使用 window.location.reload()，避免在首次加载时造成无限重载循环
 */
export async function authFetch(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
  const headers = {
    ...getAuthHeaders(),
    ...(init.headers as Record<string, string> || {}),
  };
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) {
    clearAuthToken();
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  }
  return res;
}

/**
 * 在 WebSocket URL 上附加 token query param
 */
export function appendTokenToWsUrl(url: string): string {
  const token = getAuthToken();
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}
