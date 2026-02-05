export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export const apiUrl = (path: string) => (API_BASE_URL ? `${API_BASE_URL}${path}` : path);

const ADMIN_TOKEN_STORAGE_KEY = 'moonshot_admin_token';

export const getAdminToken = () => {
  try {
    return localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
};

export const setAdminToken = (token: string) => {
  try {
    if (token) localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
  } catch {
    // ignore
  }
};

export const clearAdminToken = () => {
  try {
    localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
};

export const withAdminAuth = (init: RequestInit = {}): RequestInit => {
  const token = getAdminToken();
  if (!token) return init;

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return { ...init, headers };
};
