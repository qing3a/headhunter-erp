import { describe, it, expect, beforeAll } from 'vitest';
import { init, isReady } from '../../src/db/init.js';
import fs from 'fs';
import path from 'path';

beforeAll(async () => {
  if (!isReady()) await init();
});

const SHARED_CSS = path.join(__dirname, '../../../shared/shared.css');
const PAGE = (p) => path.join(__dirname, '../../../pages', p);

function readPageStyle(src) {
  const m = src.match(/<style id="pageStyle">([\s\S]+?)<\/style>/);
  return m ? m[1] : null;
}

describe('P3-9: 真公共 class 抽到 shared.css (.status-pill + .empty-state dedup)', () => {
  const sharedCss = fs.readFileSync(SHARED_CSS, 'utf8');

  it('shared.css 含 .status-pill (4-page common base)', () => {
    expect(sharedCss).toMatch(/^\.status-pill\s*\{/m);
    // at least one variant in shared.css
    expect(sharedCss).toMatch(/\.status-pill\.active\b/);
    expect(sharedCss).toMatch(/\.status-pill\.inactive\b/);
  });

  it('shared.css 含 .empty-state (dedup target, already shared)', () => {
    expect(sharedCss).toMatch(/^\.empty-state\s*\{/m);
    expect(sharedCss).toMatch(/^\.empty-state-icon\s*\{/m);
    expect(sharedCss).toMatch(/^\.empty-state-title\s*\{/m);
    expect(sharedCss).toMatch(/^\.empty-state-desc\s*\{/m);
  });

  it('candidate-pool.html pageStyle 不再含 .status-pill CSS rule', () => {
    const src = fs.readFileSync(PAGE('candidate-pool.html'), 'utf8');
    const ps = readPageStyle(src);
    expect(ps).not.toBeNull();
    expect(ps).not.toMatch(/^\s*\.status-pill\s*\{/m);
    expect(ps).not.toMatch(/^\s*\.status-pill\.active\s*\{/m);
  });

  it('candidate-detail.html pageStyle 不再含 .status-pill CSS rule', () => {
    const src = fs.readFileSync(PAGE('candidate-detail.html'), 'utf8');
    const ps = readPageStyle(src);
    expect(ps).not.toBeNull();
    expect(ps).not.toMatch(/^\s*\.status-pill\s*\{/m);
    expect(ps).not.toMatch(/^\s*\.status-pill\.withdrawn\s*\{/m);
  });

  it('client-management.html pageStyle 不再含 .status-pill CSS rule', () => {
    const src = fs.readFileSync(PAGE('client-management.html'), 'utf8');
    const ps = readPageStyle(src);
    expect(ps).not.toBeNull();
    expect(ps).not.toMatch(/^\s*\.status-pill\s*\{/m);
  });

  it('job-detail.html pageStyle 不再含通用 .status-pill CSS rule (page-specific .job-header .status-pill 可保留)', () => {
    const src = fs.readFileSync(PAGE('job-detail.html'), 'utf8');
    const ps = readPageStyle(src);
    expect(ps).not.toBeNull();
    // Top-level .status-pill { ... } must be gone
    expect(ps).not.toMatch(/^\s*\.status-pill\s*\{/m);
  });

  it('candidate-pool.html pageStyle 不再含 .empty-state CSS rule (already in shared.css)', () => {
    const src = fs.readFileSync(PAGE('candidate-pool.html'), 'utf8');
    const ps = readPageStyle(src);
    expect(ps).not.toBeNull();
    expect(ps).not.toMatch(/^\s*\.empty-state\s*\{/m);
    expect(ps).not.toMatch(/^\s*\.empty-state-icon\s*\{/m);
    expect(ps).not.toMatch(/^\s*\.empty-state-title\s*\{/m);
    expect(ps).not.toMatch(/^\s*\.empty-state-desc\s*\{/m);
  });

  it('tag-management.html pageStyle 不再含 .empty-state CSS rule (already in shared.css)', () => {
    const src = fs.readFileSync(PAGE('tag-management.html'), 'utf8');
    const ps = readPageStyle(src);
    expect(ps).not.toBeNull();
    expect(ps).not.toMatch(/^\s*\.empty-state\s*\{/m);
  });

  it('所有 16 个 page 都 link shared.css', () => {
    const pages = fs.readdirSync(path.dirname(PAGE('a.html'))).filter((f) => f.endsWith('.html'));
    for (const p of pages) {
      const src = fs.readFileSync(PAGE(p), 'utf8');
      if (src.includes('pageStyle')) {
        expect(src).toMatch(/<link[^>]+shared\.css/);
      }
    }
  });

  it('job-detail.html 保留 .job-header .status-pill (page-specific override)', () => {
    const src = fs.readFileSync(PAGE('job-detail.html'), 'utf8');
    const ps = readPageStyle(src);
    expect(ps).not.toBeNull();
    // job-header scoped override is page-specific, should stay
    expect(ps).toMatch(/^\s*\.job-header \.status-pill\s*\{/m);
  });
});
