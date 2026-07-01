// ── RETRY UTILITY ─────────────────────────────────────────────────────────────
async function withRetry(fn, maxAttempts = 5, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn(); }
    catch (err) {
      if (attempt === maxAttempts) throw err;
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.warn(`Attempt ${attempt}/${maxAttempts} failed: ${err.message} — retrying in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

module.exports = { withRetry };