const fetchBtn = document.getElementById("fetchBtn");
const results = document.getElementById("results");
const usernameInput = document.getElementById("username");

usernameInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    fetchBtn.click();
  }
});

fetchBtn.addEventListener("click", async () => {
  const username = document.getElementById("username").value.trim();
  if (!username) return alert("Enter username");

  fetchBtn.disabled = true;
  results.innerHTML = `<p class="loading-text">Generating recommendations...</p>`;

  try {
    const { final } = await recommend(username, MAX_RECOMMENDATIONS);
    renderResults(username, final);
  } catch (err) {
    console.error(err);
    results.innerHTML = "Error: " + (err.message || err);
  } finally {
    fetchBtn.disabled = false;
  }
});

function renderResults(username, list) {
  if (!list?.length) {
    results.innerHTML = `<h2>No recommendations found for ${username}.</h2>`;
    return;
  }

results.innerHTML = `
  <h3 class="results-title">Recommendations for ${username}</h3>
  <div class="anime-grid">
    ${list.map(item => {
      const anime = item.anime;
      return `
        <div class="anime-item">
          <a href="https://anilist.co/anime/${anime.id}" target="_blank" style="text-decoration:none;color:inherit;">
            <img src="${anime.coverImage?.large || ''}">
            <div class="title">
              <div style="font-weight:600;">${anime.title?.romaji || "Unknown"}</div>
            </div>
          </a>
        </div>`;
    }).join("")}
  </div>`;

}

