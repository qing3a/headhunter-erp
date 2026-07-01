// tests/utils.test.js - 工具函数单测
import { describe, it, expect } from 'vitest';
import { success, fail, pagination } from '../src/utils/response.js';
import { ApiError, notFound, badRequest, forbidden, conflict, duplicate, rateLimited, internal } from '../src/utils/errors.js';

describe('utils/response', () => {
  it('success 包装', () => {
    const r = success({ a: 1 });
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({ a: 1 });
  });

  it('success 带 meta', () => {
    const r = success([], { total: 0, page: 1 });
    expect(r.ok).toBe(true);
    expect(r.meta).toEqual({ total: 0, page: 1 });
  });

  it('fail 包装', () => {
    const r = fail('NOT_FOUND', '资源不存在');
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('NOT_FOUND');
    expect(r.error.message).toBe('资源不存在');
  });

  it('pagination 包装', () => {
    const r = pagination([1, 2, 3], 10, 1, 3);
    expect(r.data).toEqual([1, 2, 3]);
    expect(r.meta).toEqual({ total: 10, page: 1, pageSize: 3, hasMore: true });
  });
});

describe('utils/errors', () => {
  it('notFound factory', () => {
    const e = notFound('not here');
    expect(e).toBeInstanceOf(ApiError);
    expect(e.code).toBe('NOT_FOUND');
    expect(e.statusCode).toBe(404);
    expect(e.message).toBe('not here');
  });

  it('badRequest factory = VALIDATION_ERROR 400', () => {
    const e = badRequest('bad input');
    expect(e.code).toBe('VALIDATION_ERROR');
    expect(e.statusCode).toBe(400);
  });

  it('forbidden / conflict / duplicate / rateLimited / internal', () => {
    expect(forbidden('x').statusCode).toBe(403);
    expect(conflict('x').code).toBe('CONFLICT');
    expect(duplicate('x').code).toBe('DUPLICATE');
    expect(rateLimited('x').statusCode).toBe(429);
    expect(internal('x').code).toBe('INTERNAL_ERROR');
  });
});
