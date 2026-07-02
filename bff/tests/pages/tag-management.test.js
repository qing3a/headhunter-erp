// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('tag-management page', () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.API = {
      tags: {
        list: vi.fn(),
        candidates: vi.fn(),
        rename: vi.fn(),
        remove: vi.fn(),
        merge: vi.fn(),
      },
    };
    globalThis.UI = {
      showToast: vi.fn(),
      showModal: vi.fn(),
      showConfirm: vi.fn(({ onConfirm }) => onConfirm && onConfirm()),
    };
    globalThis.Auth = {
      isLoggedIn: vi.fn(() => true),
      requireLogin: vi.fn(),
      getUser: vi.fn(() => ({ id: 1 })),
    };

    document.body.innerHTML = `
      <div id="pageContent">
        <input type="text" id="searchInput" placeholder="搜索标签名...">
        <button id="mergeBtn" class="btn btn-secondary" style="display:none;">合并所选</button>
        <span id="selectInfo" style="display:none;"></span>
        <div class="tag-grid" id="tagGrid"></div>
      </div>
    `;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('init: loadTags calls API.tags.list + renders tag grid', async () => {
    globalThis.API.tags.list.mockResolvedValue({
      ok: true,
      data: [
        { name: 'VIP', count: 5 },
        { name: '重点关注', count: 3 },
      ],
    });

    await import('../../public/pages/tag-management.js');
    await new Promise((r) => setTimeout(r, 80));

    expect(globalThis.API.tags.list).toHaveBeenCalled();
    expect(document.getElementById('tagGrid').innerHTML).toContain('VIP');
    expect(document.getElementById('tagGrid').innerHTML).toContain('重点关注');
  });

  it('search: keyword input triggers API.tags.list with params.keyword (debounced)', async () => {
    globalThis.API.tags.list.mockResolvedValue({ ok: true, data: [] });

    await import('../../public/pages/tag-management.js');
    await new Promise((r) => setTimeout(r, 80));

    const input = document.getElementById('searchInput');
    input.value = 'VIP';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    await new Promise((r) => setTimeout(r, 400));

    expect(globalThis.API.tags.list.mock.calls.length).toBeGreaterThanOrEqual(2);
    const lastCall = globalThis.API.tags.list.mock.calls.slice(-1)[0][0];
    expect(lastCall.keyword).toBe('VIP');
  });
});