const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
async function redis(command) {
  if (!REDIS_URL || !REDIS_TOKEN) throw new Error("Upstash Redis is not configured");
  const response = await fetch(REDIS_URL, { method: "POST", headers: { Authorization: "Bearer " + REDIS_TOKEN, "Content-Type": "application/json" }, body: JSON.stringify(command) });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error("Redis command failed");
  return data.result;
}
module.exports = { redis };
