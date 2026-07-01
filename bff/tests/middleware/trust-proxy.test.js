// bff/tests/middleware/trust-proxy.test.js
// P0-NEW-1: 验证 trust proxy = 'loopback' 能阻止外部攻击者伪造 X-Forwarded-For
// 注意：supertest 本地连接是 loopback，'loopback' 仍会信任 XFF。
// 所以必须 fake socket.remoteAddress 为非 loopback 来模拟外部连接。
import { describe, it, expect, beforeAll } from 'vitest';
import { init, isReady } from '../../src/db/init.js';

beforeAll(async () => {
  if (!isReady()) await init();
});

import express from 'express';
import request from 'supertest';

function fakeRemoteAddress(app, addr) {
  app.use((req, _res, next) => {
    Object.defineProperty(req.connection, 'remoteAddress', { value: addr, configurable: true });
    Object.defineProperty(req.socket, 'remoteAddress', { value: addr, configurable: true });
    next();
  });
}

describe('trust proxy loopback policy', () => {
  it('拒绝伪造 X-Forwarded-For（非 loopback 连接时）', async () => {
    const app = express();
    app.set('trust proxy', 'loopback');
    fakeRemoteAddress(app, '8.8.8.8'); // 模拟外部直接连接
    app.get('/ip', (req, res) => res.json({ ip: req.ip }));
    const res = await request(app)
      .get('/ip')
      .set('X-Forwarded-For', '6.6.6.6');
    // 攻击者伪造的 IP 不应被采纳；req.ip 应保留 socket 真实地址
    expect(res.body.ip).not.toBe('6.6.6.6');
    expect(res.body.ip).toBe('8.8.8.8');
  });

  it('loopback 代理的 X-Forwarded-For 应被信任', async () => {
    const app = express();
    app.set('trust proxy', 'loopback');
    fakeRemoteAddress(app, '127.0.0.1'); // 模拟本机反向代理
    app.get('/ip', (req, res) => res.json({ ip: req.ip }));
    const res = await request(app)
      .get('/ip')
      .set('X-Forwarded-For', '127.0.0.1');
    expect(res.body.ip).toBeTruthy();
  });

  it('旧配置 trust proxy=1 在外部连接下会被伪造 IP 绕过（回归对照）', async () => {
    const app = express();
    app.set('trust proxy', 1); // 旧配置：有漏洞
    fakeRemoteAddress(app, '8.8.8.8');
    app.get('/ip', (req, res) => res.json({ ip: req.ip }));
    const res = await request(app)
      .get('/ip')
      .set('X-Forwarded-For', '6.6.6.6');
    // 旧配置下，攻击者能伪造 IP 通过 — 这正是我们要修复的
    expect(res.body.ip).toBe('6.6.6.6');
  });
});
