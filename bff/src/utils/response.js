function success(data, meta) {
  const res = { ok: true, data };
  if (meta) res.meta = meta;
  return res;
}

function fail(code, message, details) {
  const error = { code, message };
  if (details !== undefined) error.details = details;
  return { ok: false, error };
}

function pagination(data, total, page, pageSize) {
  return success(data, {
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  });
}

module.exports = { success, fail, pagination };
