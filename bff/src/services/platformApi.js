const axios = require('axios');

const BASE_URL = process.env.PLATFORM_API_BASE || 'http://localhost:3000/v1/admin';
const ADMIN_KEY = process.env.PLATFORM_ADMIN_KEY || '';

async function request(path, options = {}) {
  const url = `${BASE_URL}/${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (ADMIN_KEY) {
    headers['Authorization'] = `Bearer ${ADMIN_KEY}`;
  }

  try {
    const res = await axios({
      url,
      method: options.method || 'GET',
      headers,
      data: options.body,
      params: options.params,
      timeout: 15000,
    });
    return res.data;
  } catch (err) {
    if (err.response) {
      return err.response.data || { ok: false, error: { code: 'API_ERROR', message: err.message } };
    }
    return { ok: false, error: { code: 'NETWORK_ERROR', message: err.message } };
  }
}

const platformApi = {
  dashboard: {
    async getStats() {
      return request('dashboard/stats');
    },
  },

  candidates: {
    async list(params = {}) {
      return request('candidates', { params });
    },
    async get(id) {
      return request(`candidates/${id}`);
    },
  },

  jobs: {
    async list(params = {}) {
      return request('jobs', { params });
    },
    async get(id) {
      return request(`jobs/${id}`);
    },
  },

  users: {
    async list(params = {}) {
      return request('users', { params });
    },
    async get(id) {
      return request(`users/${id}`);
    },
  },

  recommendations: {
    async list(params = {}) {
      return request('recommendations', { params });
    },
    async get(id) {
      return request(`recommendations/${id}`);
    },
  },

  placements: {
    async list(params = {}) {
      return request('placements', { params });
    },
  },

  config: {
    async list() {
      return request('config');
    },
  },

  isAvailable() {
    return !!ADMIN_KEY;
  },
};

module.exports = platformApi;
