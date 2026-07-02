// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fakeHtml = `
  <aside class="shell-sidebar" data-dom-id="sidebar">
    <div data-dom-id="nav-list"></div>
    <div data-dom-id="sidebar-system"></div>
  </aside>
  <header class="shell-header" data-dom-id="top-header"></header>
  <main class="shell-main" data-dom-id="main-content">
    <div class="content-wrapper">
      <div data-slot="pageContent"></div>
    </div>
  </main>
`;

describe('layout loadLayout (partial fetch)', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    // Mock UI + lucide so loadLayout doesn't blow up
    globalThis.UI = { initDropdowns: vi.fn(), showToast: vi.fn() };
    globalThis.lucide = { createIcons: vi.fn() };
    // Reset Auth each test
    globalThis.Auth = {
      requireLogin: vi.fn(),
      isLoggedIn: () => false,
      getUser: () => null,
      logout: vi.fn(),
    };
    // Re-import layout.js fresh (Vitest module cache: only first import runs).
    // To make tests independent, we use vi.resetModules before each import.
    vi.resetModules();
  });

  it('partial 加载后 fetch 被调用，注入到 DOM', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, text: () => Promise.resolve(fakeHtml) })
    );
    globalThis.fetch = fetchMock;

    await import('../../../shared/layout.js');
    // layout.js IIFE registers DOMContentLoaded handler.
    // happy-dom's document.readyState at import may already be 'complete',
    // which causes loadLayout() to run synchronously. Either way,
    // we wait a microtask for the inner fetch promise to resolve.
    document.dispatchEvent(new Event('DOMContentLoaded'));

    // Wait for fetch promise chain
    await new Promise((r) => setTimeout(r, 10));

    expect(fetchMock).toHaveBeenCalled();
    const url = fetchMock.mock.calls[0][0];
    expect(url).toMatch(/project-shell\.html/);
  });

  it('partialCache 第二次 DOMContentLoaded 复用同一份 promise（只 fetch 一次）', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, text: () => Promise.resolve(fakeHtml) })
    );
    globalThis.fetch = fetchMock;

    await import('../../../shared/layout.js');

    // Fire DOMContentLoaded twice quickly
    document.dispatchEvent(new Event('DOMContentLoaded'));
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await new Promise((r) => setTimeout(r, 20));

    // partialCache should mean fetch was only called once
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});