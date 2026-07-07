// bff/src/services/aiMatchingService.js
// AI 匹配：6 维度加权算法
// 历史: 算法源自 v8 之前 pages/ai-matching.html 的 client-side 逻辑，v8-B 迁到后端
// v9.0-alpha: 前端迁到 sibling 项目后, 此处不再引用 pages/
const { getDb } = require('../db/init');

const EDUCATION_RANK = { highschool: 1, bachelor: 2, master: 3, phd: 4 };
const DEFAULT_WEIGHTS = { industry: 16, position: 16, city: 16, salary: 16, experience: 16, education: 16 };

// 字符串匹配：100 = 完全相同/包含，70 = 部分包含，0 = 不匹配
function stringScore(a, b) {
  if (!a || !b) return 0;
  const sa = String(a).toLowerCase().trim();
  const sb = String(b).toLowerCase().trim();
  if (sa === sb) return 100;
  if (sa.includes(sb) || sb.includes(sa)) return 70;
  return 0;
}

// 行业匹配：exact 100 / 包含 80 / 不匹配 0
function scoreIndustry(c, j) {
  if (!c.expected_industry || !j.industry) return 0;
  if (c.expected_industry === j.industry) return 100;
  if (c.expected_industry.includes(j.industry) || j.industry.includes(c.expected_industry)) return 80;
  return 0;
}

// 城市匹配：候选 expected_city 支持 "北京/上海" 多期望
function scoreCity(c, j) {
  if (!c.expected_city || !j.city) return 0;
  const cities = c.expected_city.split(/[,\/]/).map(s => s.trim());
  return cities.includes(j.city) ? 100 : 0;
}

// 薪资匹配：区间重叠 100 / 接近（< 30%）70 / 不匹配 0
function scoreSalary(c, j) {
  if (!c.expected_salary_min || !c.expected_salary_max || !j.salary_min || !j.salary_max) return 0;
  const overlap = Math.max(c.expected_salary_min, j.salary_min) <= Math.min(c.expected_salary_max, j.salary_max);
  if (overlap) return 100;
  const diff = Math.abs(c.expected_salary_max - j.salary_min) / Math.max(c.expected_salary_max, j.salary_min);
  return diff < 0.3 ? 70 : 0;
}

// 经验匹配：在职位区间内 100 / 超出 0
function scoreExperience(c, j) {
  if (c.years_of_experience == null) return 0;
  if (j.experience_min != null && c.years_of_experience < j.experience_min) return 0;
  if (j.experience_max != null && c.years_of_experience > j.experience_max) return 0;
  return 100;
}

// 学历匹配：>= 100 / 低 1 档 50 / 低 2+ 档 0
function scoreEducation(c, j) {
  if (!c.education_level || !j.education_level) return 0;
  const cr = EDUCATION_RANK[c.education_level] || 0;
  const jr = EDUCATION_RANK[j.education_level] || 0;
  if (cr >= jr) return 100;
  if (cr === jr - 1) return 50;
  return 0;
}

// 计算单 candidate-job match score
function matchCandidateJob(c, j, weights) {
  const dims = {
    industry: scoreIndustry(c, j),
    position: stringScore(c.expected_position, j.title),
    city: scoreCity(c, j),
    salary: scoreSalary(c, j),
    experience: scoreExperience(c, j),
    education: scoreEducation(c, j),
  };
  let total = 0, weightSum = 0;
  for (const [k, w] of Object.entries(weights)) {
    if (w > 0 && dims[k] != null) {
      total += dims[k] * w;
      weightSum += w;
    }
  }
  return weightSum > 0 ? Math.round(total / weightSum) : 0;
}

// 给定 candidate_id 匹配多个 jobs
function matchCandidateToJobs(candidateId, jobIds, weights) {
  const w = weights || DEFAULT_WEIGHTS;
  const db = getDb();
  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ? AND deleted_at IS NULL').get(candidateId);
  if (!candidate) return [];
  let jobs;
  if (jobIds && jobIds.length > 0) {
    const placeholders = jobIds.map(() => '?').join(',');
    jobs = db.prepare(`SELECT * FROM jobs WHERE id IN (${placeholders}) AND deleted_at IS NULL`).all(...jobIds);
  } else {
    jobs = db.prepare(`SELECT * FROM jobs WHERE deleted_at IS NULL AND status = 'open'`).all();
  }
  const results = jobs.map(j => ({
    job: j,
    score: matchCandidateJob(candidate, j, w),
    breakdown: {
      industry: scoreIndustry(candidate, j),
      position: stringScore(candidate.expected_position, j.title),
      city: scoreCity(candidate, j),
      salary: scoreSalary(candidate, j),
      experience: scoreExperience(candidate, j),
      education: scoreEducation(candidate, j),
    }
  }));
  results.sort((a, b) => b.score - a.score);
  return results;
}

// 给定 job_id 匹配多个 candidates
function matchJobToCandidates(jobId, candidateIds, weights) {
  const w = weights || DEFAULT_WEIGHTS;
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND deleted_at IS NULL').get(jobId);
  if (!job) return [];
  let cands;
  if (candidateIds && candidateIds.length > 0) {
    const placeholders = candidateIds.map(() => '?').join(',');
    cands = db.prepare(`SELECT * FROM candidates WHERE id IN (${placeholders}) AND deleted_at IS NULL`).all(...candidateIds);
  } else {
    cands = db.prepare(`SELECT * FROM candidates WHERE deleted_at IS NULL`).all();
  }
  return cands.map(c => ({
    candidate: c,
    score: matchCandidateJob(c, job, w),
    breakdown: {
      industry: scoreIndustry(c, job),
      position: stringScore(c.expected_position, job.title),
      city: scoreCity(c, job),
      salary: scoreSalary(c, job),
      experience: scoreExperience(c, job),
      education: scoreEducation(c, job),
    }
  })).sort((a, b) => b.score - a.score);
}

module.exports = {
  matchCandidateJob,
  matchCandidateToJobs,
  matchJobToCandidates,
  scoreIndustry, scoreCity, scoreSalary, scoreExperience, scoreEducation, stringScore,
  DEFAULT_WEIGHTS,
};