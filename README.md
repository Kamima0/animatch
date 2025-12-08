# AniMatch
## Video Demo: https://youtu.be/B1wiyrIwxq0?si=8TGNPkKogHAxQ0e3
## Description:
A website that generates personalized anime recommendations by analyzing a user’s AniList account data. It does this entirely on the client side using JavaScript, by querying the AniList GraphQL API, extracting genre and tag information from the user’s watched list, and computing a ranked list of recommended titles based on the user preferences.\
The project is organized into several JavaScript files that collectively perform data retrieval, statistical analysis, filtering and rendering of recommendations.

### **index.html:**
Defines the structure of the webpage and includes references to all necessary scripts — loaded at the end of the HTML body in a specific order to ensure dependencies are correctly initialized. Contains a simple interface with an input field for the AniList username, a button to initiate data retrieval, and a div element to hold the recommendation results.

### **config.js:**
Defines tuning parameters that control the system’s behavior — such as number of results fetched, the weighting of genres/tags, and the mathematical constants used in the shrinkage and normalization steps of the recommender. This was used to achieve an ideal result in the calculations for the recommendations.\
Since AniMatch runs entirely in the browser and directly queries the AniList API, it may temporarily blocked for too many requests, so I limited the number of pages of genres/tags fetched per query to one to reduce requests.\
There is also a hand-picked selection of tags be used for the similarity calculation, so irrelevant tags that don't convey the tone/atmosphere/themes of an anime (such as "aliens" or "trains") are not included. This filtering helps the algorithm focus on semantic qualities rather than incidental details.

### **utils.js:**
Contains general-purpose utility functions that support the computation and filtering logic used throughout the program, preventing code duplication and promoting consistency in different parts of the program. The inclusion of *isRelatedToWatched()* ensures that sequels or spinoffs are not recommended, preventing redundancy.

### **api.js:**
Handles all interaction with the AniList GraphQL API. It defines three asynchronous functions:

* ***gql(query, variables)*** – executes a GraphQL query by sending an HTTP POST request and returns the parsed JSON response.
* ***fetchUserEntries(username)*** – retrieves the user’s anime list, including scores, genres, tags, popularity, and relationships between titles.
* ***fetchCandidates({ type, value, pages })*** – retrieves candidate anime titles that belong to a particular genre or have a specific tag.


By isolating API communication in this module, the rest of the project can operate on abstracted data structures rather than raw network requests.

### **recommender.js:**
This is the file with the core logic that transforms user data into a list of recommended titles. The primary function, recommend(username), executes the complete recommendation process. Its workflow includes:

1. **Fetching user data**\
Retrieves the user’s anime list using fetchUserEntries() and constructs a set of watched anime IDs.

2. **Computing preference profiles**\
Calculates the user’s mean score and determines genre and tag specific deviations from that mean. Scores are normalized and adjusted using the shrinkage functions from utils.js.

3. **Deriving preference weights**\
Separates genres and tags into positive and negative categories, and normalizes the sum of their absolute values to form probability-like weights.

4. **Fetching candidate titles**\
Selects the most significant genres and tags from the user’s profile and calls fetchCandidates() to gather potential recommendations.

5. **Scoring candidates**\
Each candidate anime is scored based on how well its genres and tags align with the user’s preferences. A combined score merges the two, with configurable multipliers and exponents to emphasize strong tag alignment.

6. **Filtering and deduplication**\
Removes titles the user has already watched, direct sequels or prequels, one-off specials, music videos, and other related entries. It also deduplicates franchises by keeping only the highest-ranked entry from each related group.

7. **Sorting and truncation**\
Sorts all remaining candidates by their combined score and retains only the top entries up to the defined limit.

The result is a structured list of recommendations with detailed scoring information, returned as an object containing { final }.

### **ui.js:**
Manages all user interface behavior and DOM updates. It connects event listeners to the input field and button, which allows the user to trigger the recommendation process.\
When activated, it disables the button, displays a loading message, calls the recommend() function from recommender.js, and then renders the resulting anime list into the page. The output is formatted as a grid of clickable images that link to the anime’s AniList page. Error handling ensures that invalid usernames or API errors are reported.
