import fetch from "node-fetch";

/**
 * ENV you must set in Vercel:
 * - AGENT_API_KEY: any long random string (your GPT must send this in `x-api-key`)
 * - APIFY_TOKEN: your Apify token
 * - APIFY_ACTOR_ID: the Apify actor for Instagram posts (e.g., "epctex~instagram-posts-scraper")
 */

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const apiKey = req.headers["x-api-key"];
    if (!apiKey || apiKey !== process.env.AGENT_API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { platform, handle, post_count = 20 } = req.body || {};
    if (platform !== "instagram") {
      return res.status(400).json({ error: "platform must be 'instagram'" });
    }
    if (!handle) {
      return res.status(400).json({ error: "handle is requir
