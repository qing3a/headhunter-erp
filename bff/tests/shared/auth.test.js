// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

let Auth;

beforeAll(async () => {
  // auth.js is an IIFE that attaches to window.Auth. Importing it runs the IIFE.
  await import('../../../shared/auth.js');
  Auth = window.Auth;
  // Stub Router so logout doesn't actually navigate
  window.Router = { navigate: vi.fn() };
});

beforeEach(() => {
  localStorage.clear();
  window.Router.navigate.mockClear();
});

describe('auth utility', () => {
  it('setSession + getToken', () => {
    Auth.setSession('t123', { id: 1, username: 'a', displayName: 'A', role: 'admin' });
    expect(Auth.getToken()).toBe('t123');
  });

  it('getToken 未登录返回 null', () => {
    expect(Auth.getToken()).toBeNull();
  });

  it('isLoggedIn 反映 setSession', () => {
    expect(Auth.isLoggedIn()).toBe(false);
    Auth.setSession('t', { id: 1, role: 'admin' });
    expect(Auth.isLoggedIn()).toBe(true);
  });

  it('logout 清掉 localStorage', () => {
    Auth.setSession('t', { id: 1, role: 'admin' });
    Auth.logout();
    expect(Auth.isLoggedIn()).toBe(false);
    expect(Auth.getToken()).toBeNull();
  });

  it('isAdmin / hasRole', () => {
    Auth.setSession('t', { id: 1, role: 'admin' });
    expect(Auth.isAdmin()).toBe(true);
    expect(Auth.hasRole('admin', 'consultant')).toBe(true);
    Auth.setSession('t2', { id: 2, role: 'consultant' });
    expect(Auth.isAdmin()).toBe(false);
    expect(Auth.hasRole('consultant')).toBe(true);
    expect(Auth.hasRole('admin')).toBe(false);
  });

  it('getUser 反映 setSession', () => {
    Auth.setSession('t', { id: 1, username: 'u', displayName: 'U', role: 'admin' });
    const u = Auth.getUser();
    expect(u.id).toBe(1);
    expect(u.username).toBe('u');
    expect(u.role).toBe('admin');
  });
});