async function recommend(username) {
  // fetch user list
  const userRes = await fetchUserEntries(username);
  const lists = userRes?.data?.MediaListCollection?.lists;
  if (!lists) throw new Error("User not found or no anime list.");
  const entries = lists.flatMap(l => l.entries || []);
  if (!entries.length) throw new Error("No entries found.");

  const watchedIds = new Set(entries.map(e => e.media?.id).filter(Boolean));

  // baseline entries for stats
  const scored = entries.filter(e => typeof e.score === "number" && e.score > 0);
  const ratedEntries = scored.length ? scored : entries;

  // compute user mean score
  const totalScore = ratedEntries.reduce((s, e) => s + (e.score || 0), 0);
  const userMean = ratedEntries.length ? (totalScore / ratedEntries.length) : 50;

  // genre aggregates & shrink-centered weights
  const genreStats = {};
  ratedEntries.forEach(e => {
    const score = e.score || 0;
    (e.media?.genres || []).forEach(g => {
      const k = lower(g);
      if (!genreStats[k]) genreStats[k] = { sum: 0, count: 0 };
      genreStats[k].sum += score;
      genreStats[k].count += 1;
    });
  });
  const genreScores = {};
  for (const [g, v] of Object.entries(genreStats)) {
    const mean = v.count ? (v.sum / v.count) : userMean;
    const centered = (mean - userMean) / 100; // roughly -1..1
    genreScores[g] = shrink(centered, v.count, SHRINKAGE_K);
  }
  // split pos/neg and normalize each
  const likedGenreScores = {}, dislikedGenreScores = {};
  for (const [g, v] of Object.entries(genreScores)) {
    if (v > 0) likedGenreScores[g] = v;
    else if (v < 0) dislikedGenreScores[g] = Math.abs(v);
  }
  const normalize = (m) => {
    const out = {}; const s = Object.values(m).reduce((a,b) => a + Math.max(0,b), 0) || 1;
    for (const [k,v] of Object.entries(m)) out[k] = Math.max(0,v) / s;
    return out;
  };
  const posGenreWeights = Object.keys(likedGenreScores).length ? normalize(likedGenreScores) : {};
  const negGenreWeights = Object.keys(dislikedGenreScores).length ? normalize(dislikedGenreScores) : {};

  // Aggregate user's scores per tag, weighted by tag relevance
  const tagAgg = {}; // key: { weightedSum(score*rel), tagRelevance, occ }
  ratedEntries.forEach(e => {
    const score = e.score || 0;
    (e.media?.tags || []).forEach(t => {
      if (!t?.name) return;
      const k = lower(t.name);
      const rel = Math.min(1, (t.rank || 0) / 100);
      if (!tagAgg[k]) tagAgg[k] = { weightedSum: 0, tagRelevance: 0, occ: 0 };
      tagAgg[k].weightedSum += score * rel;
      tagAgg[k].tagRelevance += rel;
      tagAgg[k].occ += 1;
    });
  });

  // build userTagScores: (tagMean - userMean)/100, shrunk by tagRelevance
  const userTagScores = {};
  for (const [k, v] of Object.entries(tagAgg)) {
    if (v.tagRelevance <= 0) { userTagScores[k] = 0; continue; }
    const tagMean = v.weightedSum / v.tagRelevance; // 0..100 average score for this tag
    const diff = (tagMean - userMean) / 100;  // -1..1
    const shr = shrink(diff, v.tagRelevance, TAG_SHRINKAGE_K);
    userTagScores[k] = shr;
  }

  // determine top genres and top tags to use for candidate fetching
  let genreCandidates = Object.entries(likedGenreScores).sort((a,b) => b[1]-a[1]).map(e => e[0]);
  if (!genreCandidates.length) genreCandidates = Object.entries(genreScores).sort((a,b)=>Math.abs(b[1]) - Math.abs(a[1])).map(e=>e[0]);
  const GENRES_TO_FETCH = genreCandidates.slice(0, GENRES_TO_FETCH_COUNT);

  // top user tags by importance
  const tagsSorted = Object.entries(userTagScores).sort((a,b) => Math.abs(b[1]) - Math.abs(a[1])).map(e => e[0]);
  const TAGS_TO_FETCH = tagsSorted.slice(0, TAGS_TO_FETCH_COUNT);

  // fetch candidates
  const genrePromises = GENRES_TO_FETCH.map(g =>
    fetchCandidates({ type: "genre", value: g, pages: PAGES_PER_GENRE })
  );
  const tagPromises = TAGS_TO_FETCH.map(t =>
    fetchCandidates({ type: "tag", value: t, pages: PAGES_PER_TAG })
  );
  const allFetches = await Promise.all([...genrePromises, ...tagPromises]);

  // dedupe into a candidate map
  const candidateMap = new Map();
  allFetches.forEach(list => {
    (list || []).forEach(m => { if (m?.id) candidateMap.set(m.id, m); });
  });
  const candidates = Array.from(candidateMap.values());
  const totalCandidates = candidates.length || 1;

  const userTagWeights = {};
  let sumPos = 0, sumNeg = 0;
  for (const [k, weight] of Object.entries(userTagScores)) {
    userTagWeights[k] = weight;
    if (weight > 0) sumPos += weight;
    else if (weight < 0) sumNeg += Math.abs(weight);
  }

  // score each candidate:
  const candidateScores = candidates.map(a => {
    // genre alignment
    const posAlignRaw = (a.genres || []).reduce((s, g) => s + (posGenreWeights[lower(g)] || 0), 0);
    const negAlignRaw = (a.genres || []).reduce((s, g) => s + (negGenreWeights[lower(g)] || 0), 0);
    let genreScore = clamp(posAlignRaw - (NEG_GENRE_PENALTY * negAlignRaw), 0, 1);

    // tag alignment
    let posNum = 0, posDen = 0;
    let negNum = 0, negDen = 0;
    (a.tags || []).forEach(t => {
      const k = lower(t.name);
      if (!RELEVANT_TAGS.includes(k)) return;
      const rel = Math.min(1, (t.rank || 0) / 100);
      const weight = userTagWeights[k] || 0;
      if (weight > 0) { posNum += weight * rel; posDen += weight; }
      else if (weight < 0) { negNum += Math.abs(weight) * rel; negDen += Math.abs(weight); }
    });
    const posScore = posDen ? (posNum / posDen) : 0;
    const negScore = negDen ? (negNum / negDen) : 0;
    let tagAlignment = clamp(posScore - (NEGATIVE_TAG_FACTOR * negScore), 0, 1);

    // combine: tags amplify genre. If no positive genres, rely on tags alone.
    let combined;
    if (Object.keys(posGenreWeights).length > 0) {
      combined = genreScore * (1 + TAG_MULTIPLIER * Math.pow(tagAlignment, TAG_EXPONENT));
    } else {
      combined = tagAlignment;
    }
    return { anime: a, scores: { genreScore, tagAlignment, combined, posScore, negScore } };
  });

  // filtering
  const allIds = new Set(candidates.map(c => c.id));
  let filteredCandidates = candidateScores.filter(item => {
    const a = item.anime;
    if (watchedIds.has(a.id)) return false;
    if (isRelatedToWatched(a, watchedIds)) return false;

    // Skip anime if it has a more popular prequel
    const hasMorePopularPrequel = (a.relations?.edges || []).some(r => {
      if (r.relationType !== "PREQUEL" || !r.node?.id) return false;
      const prequel = r.node;
      // Compare popularity if available, otherwise fall back to lower ID as older release
      const prequelPopularity = prequel.popularity ?? 0;
      const thisPopularity = a.popularity ?? 0;
      return prequelPopularity > thisPopularity || prequel.id < a.id;
    });
    if (hasMorePopularPrequel) return false;

    if (a.format === "MUSIC" || a.format === "SPECIAL") return false;

    return true;
  });

  // sort descending
  filteredCandidates.sort((a, b) => b.scores.combined - a.scores.combined);

  // franchise dedupe, keep best per related-group
  const final = [];
  const selectedIds = new Set();
  for (const item of filteredCandidates) {
    const a = item.anime;
    if (selectedIds.has(a.id)) continue;
    const related = new Set((a.relations?.edges || []).map(r => r.node?.id).filter(Boolean));
    const intersects = Array.from(related).some(id => selectedIds.has(id));
    if (intersects) continue;
    final.push(item);
    selectedIds.add(a.id);
    related.forEach(id => selectedIds.add(id));
    if (final.length >= MAX_RECOMMENDATIONS) break;
  }

  return { final };
}