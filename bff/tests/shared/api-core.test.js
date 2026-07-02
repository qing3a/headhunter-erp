// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

let API;

beforeAll(async () => {
  // api.js IIFE attaches api to window.API. Importing it runs the IIFE.
  await import('../../../shared/api.js');
  API = window.API;
});

describe('api._request 错误处理', () => {
  beforeEach(() => {
    // 模拟 window 上的依赖
    globalThis.alert = vi.fn();
    globalThis.Auth = {
      logout: vi.fn(),
      getToken: () => 'mock-token',
      isLoggedIn: () => true,
      clear: vi.fn(),
    };
    globalThis.UI = { showToast: vi.fn() };
    globalThis.Loading = { show: vi.fn(), hide: vi.fn() };
    globalThis.Toast = { error: vi.fn() };
  });

  it('401 返 UNAUTHORIZED + 触发 Auth.logout', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ status: 401 }));
    const r = await API._request('/candidates');
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('UNAUTHORIZED');
    expect(globalThis.Auth.logout).toHaveBeenCalled();
  });

  it('413 返 PAYLOAD_TOO_LARGE', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ status: 413 }));
    const r = await API._request('/imports/preview');
    expect(r.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('429 返 RATE_LIMITED', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ status: 429 }));
    const r = await API._request('/imports/commit');
    expect(r.error.code).toBe('RATE_LIMITED');
  });

  it('500+ 返 INTERNAL_ERROR', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ status: 503 }));
    const r = await API._request('/candidates');
    expect(r.error.code).toBe('INTERNAL_ERROR');
  });

  it('GET 请求加 Authorization header', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ status: 200, json: () => Promise.resolve({ ok: true, data: [] }) })
    );
    await API._request('/candidates');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer mock-token' }),
      })
    );
  });

  it('skipAuth=true 不加 Authorization', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ status: 200, json: () => Promise.resolve({ ok: true, data: {} }) })
    );
    await API._request('/auth/login', { skipAuth: true });
    const call = globalThis.fetch.mock.calls[0];
    const headers = call[1].headers;
    expect(headers.Authorization).toBeUndefined();
  });
});