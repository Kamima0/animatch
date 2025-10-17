function lower(s) { return (s || "").toString().trim().toLowerCase(); }
function clamp(v, a = 0, b = 1) { return Math.max(a, Math.min(b, v)); }
function shrink(raw, count, K) { return raw * ((count || 0) / ((count || 0) + K)); }

function isRelatedToWatched(anime, watchedIds) {
  const RELATED = [
    "PREQUEL",
    "SEQUEL",
    "ALTERNATIVE",
    "PARENT",
    "SIDE_STORY",
    "SUMMARY",
    "COMPILATION",
  ];
  return (anime.relations?.edges || []).some(r =>
    RELATED.includes(r.relationType) && watchedIds.has(r.node?.id)
  );
}
