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
      return res.status(400).json({ error: "handle is required" });
    }

    const actorId = process.env.APIFY_ACTOR_ID;
    const token = process.env.APIFY_TOKEN;

    const actorInput = {
      usernames: [handle.replace(/^@/, "")],
      resultsLimit: Math.max(5, Math.min(50, post_count))
    };

    const apifyUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}`;
    const runRes = await fetch(apifyUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(actorInput)
    });

    if (!runRes.ok) {
      const text = await runRes.text();
      return res.status(502).json({ error: "Provider error", detail: text });
    }

    const items = await runRes.json();
    const postsRaw = Array.isArray(items) ? items : (items?.data || []);

    let followerCount = null;
    for (const it of postsRaw) {
      if (it?.owner?.followers) { followerCount = it.owner.followers; break; }
      if (it?.owner?.edge_followed_by?.count) { followerCount = it.owner.edge_followed_by.count; break; }
      if (it?.profile?.followers) { followerCount = it.profile.followers; break; }
      if (it?.followersCount) { followerCount = it.followersCount; break; }
    }

    const recent_posts = postsRaw.map(p => {
      const caption =
        p.caption ||
        p.edge_media_to_caption?.edges?.[0]?.node?.text ||
        p.title ||
        "";

      const likes = p.like_count ?? p.likes ?? p.edge_liked_by?.count ?? null;
      const comments = p.comments_count ?? p.comments ?? p.edge_media_to_comment?.count ?? null;
      const permalink = p.permalink || p.url || p.shortcode_url || null;

      const tsRaw = p.timestamp || p.taken_at_timestamp || p.takenAt || p.publishedAt;
      const publish_time_iso = tsRaw
        ? (typeof tsRaw === "number" ? new Date(tsRaw * 1000).toISOString() : new Date(tsRaw).toISOString())
        : null;

      const rawType = (p.media_type || p.__typename || p.type || "").toString().toLowerCase();
      let type = "static";
      const children_types = [];

      if (rawType.includes("sidecar") || rawType.includes("carousel")) type = "carousel";
      if (rawType.includes("video") || rawType.includes("reel")) type = "reel";
      if (p.is_video || p.video_view_count != null) type = "reel";

      const children = p.children || p.edge_sidecar_to_children?.edges?.map(e => e.node) || [];
      for (const c of children) {
        const ct = (c.media_type || c.__typename || c.type || "").toString().toLowerCase();
        if (ct) children_types.push(ct.includes("video") ? "video" : "image");
      }

      const views = p.views ?? p.play_count ?? p.video_view_count ?? null;

      return {
        id: p.id || p.shortcode || permalink || Math.random().toString(36).slice(2),
        type, // "reel" | "carousel" | "static"
        caption,
        likes,
        comments,
        shares: null,
        saves: null,
        views,
        publish_time_iso,
        permalink,
        children_types
      };
    });

    let posting_cadence_per_week = null;
    if (recent_posts.length >= 5) {
      const sorted = [...recent_posts].sort((a, b) => new Date(a.publish_time_iso) - new Date(b.publish_time_iso));
      const first = new Date(sorted[0].publish_time_iso);
      const last = new Date(sorted[sorted.length - 1].publish_time_iso);
      const days = Math.max(1, (last - first) / (1000 * 60 * 60 * 24));
      const weeks = days / 7;
      posting_cadence_per_week = Math.round((recent_posts.length / weeks) * 10) / 10;
    }

    let avg_engagement_rate = null;
    if (followerCount && followerCount > 0) {
      const erPosts = recent_posts
        .map(p => ((p.likes ?? 0) + (p.comments ?? 0)) / followerCount)
        .filter(v => Number.isFinite(v));
      if (erPosts.length) {
        avg_engagement_rate = Math.round((erPosts.reduce((a, b) => a + b, 0) / erPosts.length) * 10000) / 10000;
      }
    }

    const result = {
      handle,
      follower_count: followerCount,
      avg_engagement_rate,
      posting_cadence_per_week,
      bio: null,
      link_in_bio: null,
      recent_posts
    };

    return res.status(200).json(result);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error", detail: err.message });
  }
}
