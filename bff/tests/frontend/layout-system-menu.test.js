import { describe, it, expect, beforeAll } from 'vitest';
import { init, isReady } from '../../src/db/init.js';
import fs from 'fs';
import path from 'path';

beforeAll(async () => {
  if (!isReady()) await init();
});

describe('P3-8: partial system 占位清理', () => {
  it('partial 不再含 system 占位 a', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../partials/project-shell.html'),
      'utf8'
    );
    expect(src).not.toMatch(/<a[^>]*data-nav-key="settings"/);
  });

  it('partial 含 sidebar-system 容器', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../partials/project-shell.html'),
      'utf8'
    );
    expect(src).toContain('data-dom-id="sidebar-system"');
  });

  it('layout.js system 菜单独立渲染（不依赖占位）', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../shared/layout.js'),
      'utf8'
    );
    expect(src).toMatch(/sidebar-system/);
    // 不再 querySelector('data-nav-key=...') 复用
    expect(src).not.toMatch(/querySelector\(['"]\.shell-sidebar \[data-nav-key=/);
  });

  it('menu-config system group 有 settings + tags 2 项', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../shared/menu-config.js'),
      'utf8'
    );
    expect(src).toMatch(/group:\s*['"]system['"]/);
    expect(src).toMatch(/key:\s*['"]settings['"]/);
    expect(src).toMatch(/key:\s*['"]tags['"]/);
  });
});
