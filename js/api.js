async function gql(query, variables = {}) {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.errors?.[0]?.message || "AniList API error");
  return json;
}

async function fetchUserEntries(username) {
  const query = `
    query ($username: String) {
      MediaListCollection(userName: $username, type: ANIME) {
        lists {
          entries {
            score
            media {
              id
              title { romaji }
              coverImage { large }
              genres
              format
              popularity
              tags { name rank isMediaSpoiler }
              relations { edges { relationType node { id popularity } } }
            }
          }
        }
      }
    }`;
  return gql(query, { username });
}

async function fetchCandidates({ type = "genre", value, pages }) {
  const filterField = type === "genre" ? "genre_in" : "tag_in";
  const all = [];
  const query = `
    query ($value: String, $perPage: Int, $page: Int) {
      Page(page: $page, perPage: $perPage) {
        media(${filterField}: [$value], type: ANIME, sort: POPULARITY_DESC) {
          id title { romaji } coverImage { large }
          genres format popularity tags { name rank isMediaSpoiler }
          relations { edges { relationType node { id popularity } } }
        }
      }
    }`;
  for (let p = 1; p <= pages; p++) {
    const res = await gql(query, { value, perPage: PER_PAGE, page: p });
    const list = res?.data?.Page?.media || [];
    all.push(...list);
    if (list.length < PER_PAGE) break;
  }
  return all;
}

