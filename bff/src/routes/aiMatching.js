// bff/src/routes/aiMatching.js
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { badRequest, notFound } = require('../utils/errors');
const { success } = require('../utils/response');
const { getDb } = require('../db/init');
const asyncHandler = require('../utils/asyncHandler');
const aiService = require('../services/aiMatchingService');

const router = express.Router();
router.use(requireAuth);

// POST /api/v1/ai-matching/candidate/:candidateId/match
// body: { job_ids?: number[], weights?: { industry, position, city, salary, experience, education } }
router.post('/candidate/:candidateId/match', asyncHandler(async (req, res) => {
  const candidateId = parseInt(req.params.candidateId);
  if (!candidateId) throw badRequest('无效的候选人 ID');
  const db = getDb();
  const candidate = db.prepare('SELECT id FROM candidates WHERE id = ? AND deleted_at IS NULL').get(candidateId);
  if (!candidate) throw notFound('候选人不存在');

  const { job_ids, weights } = req.body || {};
  const results = aiService.matchCandidateToJobs(candidateId, job_ids, weights);
  res.json(success({
    candidate_id: candidateId,
    total: results.length,
    matches: results.slice(0, 50),
  }));
}));

// POST /api/v1/ai-matching/job/:jobId/match
// body: { candidate_ids?: number[], weights?: ... }
router.post('/job/:jobId/match', asyncHandler(async (req, res) => {
  const jobId = parseInt(req.params.jobId);
  if (!jobId) throw badRequest('无效的职位 ID');
  const db = getDb();
  const job = db.prepare('SELECT id FROM jobs WHERE id = ? AND deleted_at IS NULL').get(jobId);
  if (!job) throw notFound('职位不存在');

  const { candidate_ids, weights } = req.body || {};
  const results = aiService.matchJobToCandidates(jobId, candidate_ids, weights);
  res.json(success({
    job_id: jobId,
    total: results.length,
    matches: results.slice(0, 50),
  }));
}));

module.exports = router;