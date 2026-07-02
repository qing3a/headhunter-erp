// bff/tests/services/aiMatchingService.test.js
// v8 Phase B: AI matching service 单元测试 (15 case)
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { init, isReady, getDb } from '../../src/db/init.js';
import {
  matchCandidateJob,
  matchCandidateToJobs,
  matchJobToCandidates,
  scoreIndustry, scoreCity, scoreSalary, scoreExperience, scoreEducation, stringScore,
  DEFAULT_WEIGHTS,
} from '../../src/services/aiMatchingService.js';

beforeAll(async () => { if (!isReady()) await init(); });

describe('aiMatchingService', () => {
  beforeEach(() => {
    const db = getDb();
    db.prepare('DELETE FROM jobs').run();
    db.prepare('DELETE FROM candidates').run();
  });

  it('完全匹配：100 分', () => {
    const c = { expected_industry: '互联网', expected_position: '高级PM', expected_city: '北京', expected_salary_min: 30, expected_salary_max: 50, years_of_experience: 5, education_level: 'bachelor' };
    const j = { industry: '互联网', title: '高级PM', city: '北京', salary_min: 30, salary_max: 50, experience_min: 3, experience_max: 7, education_level: 'bachelor' };
    const score = matchCandidateJob(c, j, { industry: 100, position: 100, city: 100, salary: 100, experience: 100, education: 100 });
    expect(score).toBe(100);
  });

  it('行业包含匹配：80 分（仅行业维度）', () => {
    const c = { expected_industry: '互联网/游戏' };
    const j = { industry: '互联网' };
    const score = matchCandidateJob(c, j, { industry: 100, position: 0, city: 0, salary: 0, experience: 0, education: 0 });
    expect(score).toBe(80);
  });

  it('行业不匹配：0 分（仅行业维度）', () => {
    const c = { expected_industry: '金融' };
    const j = { industry: '互联网' };
    const score = matchCandidateJob(c, j, { industry: 100, position: 0, city: 0, salary: 0, experience: 0, education: 0 });
    expect(score).toBe(0);
  });

  it('经验超出范围：0 分', () => {
    expect(scoreExperience({ years_of_experience: 1 }, { experience_min: 3, experience_max: 5 })).toBe(0);
    expect(scoreExperience({ years_of_experience: 10 }, { experience_min: 3, experience_max: 5 })).toBe(0);
  });

  it('经验在范围内：100 分', () => {
    expect(scoreExperience({ years_of_experience: 5 }, { experience_min: 3, experience_max: 7 })).toBe(100);
  });

  it('学历高一档：100 分', () => {
    expect(scoreEducation({ education_level: 'master' }, { education_level: 'bachelor' })).toBe(100);
  });

  it('学历低一档：50 分', () => {
    expect(scoreEducation({ education_level: 'bachelor' }, { education_level: 'master' })).toBe(50);
  });

  it('学历低两档：0 分', () => {
    expect(scoreEducation({ education_level: 'highschool' }, { education_level: 'master' })).toBe(0);
  });

  it('matchCandidateToJobs 返排序结果', () => {
    const db = getDb();
    db.prepare(`INSERT INTO users (username, password_hash, role) VALUES ('a', 'x', 'admin')`).run();
    const adminId = db.prepare(`SELECT id FROM users WHERE username = 'a'`).get().id;
    db.prepare(`INSERT INTO candidates (name, expected_industry, expected_position, expected_city, years_of_experience, education_level, user_id) VALUES ('甲', '互联网', 'PM', '北京', 5, 'bachelor', ?)`).run(adminId);
    db.prepare(`INSERT INTO jobs (title, industry, city, salary_min, salary_max, experience_min, experience_max, education_level, owner_user_id) VALUES ('Job A', '互联网', '北京', 30, 50, 3, 7, 'bachelor', ?)`).run(adminId);
    db.prepare(`INSERT INTO jobs (title, industry, city, salary_min, salary_max, experience_min, experience_max, education_level, owner_user_id) VALUES ('Job B', '金融', '北京', 30, 50, 3, 7, 'bachelor', ?)`).run(adminId);
    const candId = db.prepare(`SELECT id FROM candidates LIMIT 1`).get().id;
    const results = matchCandidateToJobs(candId, null);
    expect(results.length).toBe(2);
    expect(results[0].job.title).toBe('Job A');
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('不存在的 candidate → 返空数组', () => {
    const results = matchCandidateToJobs(99999, null);
    expect(results).toEqual([]);
  });

  it('全 0 权重 → 返 0 分', () => {
    const c = { expected_industry: '互联网' };
    const j = { industry: '互联网' };
    expect(matchCandidateJob(c, j, { industry: 0, position: 0, city: 0, salary: 0, experience: 0, education: 0 })).toBe(0);
  });

  it('加权平均算法正确', () => {
    const c = { expected_industry: '互联网' };
    const j = { industry: '互联网' };
    expect(matchCandidateJob(c, j, { industry: 50, position: 50, city: 0, salary: 0, experience: 0, education: 0 })).toBe(50);
  });

  it('matchJobToCandidates 与 matchCandidateToJobs 对称', () => {
    const db = getDb();
    db.prepare(`INSERT INTO users (username, password_hash, role) VALUES ('a2', 'x', 'admin')`).run();
    const adminId = db.prepare(`SELECT id FROM users WHERE username = 'a2'`).get().id;
    db.prepare(`INSERT INTO candidates (name, expected_industry, expected_position, user_id) VALUES ('甲', '互联网', 'PM', ?)`).run(adminId);
    db.prepare(`INSERT INTO jobs (title, industry, owner_user_id) VALUES ('Job A', '互联网', ?)`).run(adminId);
    const candId = db.prepare(`SELECT id FROM candidates LIMIT 1`).get().id;
    const jobId = db.prepare(`SELECT id FROM jobs LIMIT 1`).get().id;
    const a = matchCandidateToJobs(candId, [jobId]);
    const b = matchJobToCandidates(jobId, [candId]);
    expect(a[0].score).toBe(b[0].score);
  });

  it('薪资完全重叠：100 分', () => {
    expect(scoreSalary({ expected_salary_min: 30, expected_salary_max: 50 }, { salary_min: 20, salary_max: 40 })).toBe(100);
  });

  it('城市精确匹配：100 分', () => {
    expect(scoreCity({ expected_city: '北京' }, { city: '北京' })).toBe(100);
    expect(scoreCity({ expected_city: '北京/上海' }, { city: '上海' })).toBe(100);
  });
});