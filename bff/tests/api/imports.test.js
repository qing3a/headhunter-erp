import { describe, it, expect } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { createTestApp, setupTests } from './_helpers.js';
import router from '../../src/routes/imports.js';

setupTests();
const app = createTestApp('/api/v1/imports', router);

async function makeExcelBuffer(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('candidates');
  ws.columns = [
    { header: '姓名', key: 'name' },
    { header: '手机号', key: 'phone' },
    { header: '邮箱', key: 'email' },
  ];
  rows.forEach(r => ws.addRow(r));
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

async function makeFakeXlsxBuffer() {
  return await makeExcelBuffer([{ name: '候选人甲', phone: '13800000001', email: 'a@e2e.com' }]);
}

describe('imports routes (supertest)', () => {
  it('GET /imports/template 下载模板', async () => {
    const r = await request(app).get('/api/v1/imports/template').buffer(true).parse((res, cb) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/spreadsheetml/);
    expect(Buffer.isBuffer(r.body)).toBe(true);
    expect(r.body.length).toBeGreaterThan(0);
  });

  it('POST /imports/preview 解析 xlsx 前 5 行', async () => {
    const buf = await makeFakeXlsxBuffer();
    const r = await request(app)
      .post('/api/v1/imports/preview')
      .attach('file', buf, { filename: 'cands.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data.headers)).toBe(true);
    expect(r.body.data.headers.length).toBeGreaterThan(0);
  });

  it('POST /imports/commit 空 mapping → 400 (v7.5 fix)', async () => {
    const buf = await makeFakeXlsxBuffer();
    const r = await request(app)
      .post('/api/v1/imports/commit')
      .attach('file', buf, { filename: 'cands.xlsx' })
      .field('mapping', '{}');
    expect(r.status).toBe(400);
    expect(r.body.ok).toBe(false);
  });

  it('POST /imports/commit 非 Excel 文件 → 400 (v7.5 fix)', async () => {
    const txtBuf = Buffer.from('hello world this is plain text');
    const r = await request(app)
      .post('/api/v1/imports/commit')
      .attach('file', txtBuf, { filename: 'fake.xlsx' })
      .field('mapping', JSON.stringify({ '姓名': 'name' }));
    expect(r.status).toBe(400);
    expect(r.body.ok).toBe(false);
    expect(r.body.error.message).toMatch(/文件格式|zip|excel/);
  });
});
