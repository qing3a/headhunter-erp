// tests/auth.test.js - 认证模块单测
// 在本文件 beforeAll 里 init，与测试共享同一 worker 的模块状态
import { describe, it, expect, beforeAll } from 'vitest';
import { init, isReady } from '../src/db/init.js';
import authService from '../src/services/authService.js';

describe('authService', () => {
  beforeAll(async () => {
    if (!isReady()) await init();
  });

  describe('createUser + login', () => {
    it('应能创建用户并登录', async () => {
      const username = 'test_' + Date.now();
      const user = await authService.createUser({
        username: username,
        password: 'pwd123',
        displayName: 'Test User',
        role: 'consultant'
      });
      expect(user).toBeTruthy();
      expect(user.username).toBe(username);
      expect(user.role).toBe('consultant');
      // 不应返回 password_hash
      expect(user.password_hash).toBeUndefined();

      // 登录
      const result = await authService.login(username, 'pwd123');
      expect(result.token).toBeTruthy();
      expect(result.user.username).toBe(username);
    });

    it('错误密码应抛错', async () => {
      const username = 'wrong_' + Date.now();
      await authService.createUser({ username, password: 'pwd123', displayName: 'x', role: 'consultant' });
      await expect(authService.login(username, 'wrong_pwd')).rejects.toThrow();
    });

    it('不存在用户应抛错', async () => {
      await expect(authService.login('non_existent_user_xyz', 'any')).rejects.toThrow();
    });

    it('重复用户名应抛错（duplicate）', async () => {
      const username = 'dup_' + Date.now();
      await authService.createUser({ username, password: 'pwd123', displayName: 'A', role: 'consultant' });
      await expect(
        authService.createUser({ username, password: 'pwd123', displayName: 'B', role: 'consultant' })
      ).rejects.toThrow();
    });
  });

  describe('hashPassword + verifyPassword', () => {
    it('bcrypt hash + verify', async () => {
      const hash = await authService.hashPassword('mypassword');
      expect(hash).toBeTruthy();
      expect(hash.length).toBeGreaterThan(50);  // bcrypt hash 长度
      expect(await authService.verifyPassword('mypassword', hash)).toBe(true);
      expect(await authService.verifyPassword('wrong', hash)).toBe(false);
    });
  });
});
