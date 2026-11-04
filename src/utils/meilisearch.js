import { Meilisearch } from "meilisearch";

let client = null;

export function getMeilisearchClient() {
  if (!client) {
    const host = process.env.MEILISEARCH_HOST || "http://localhost:7700";
    const apiKey = process.env.MEILISEARCH_KEY || process.env.MEILISEARCH_API_KEY || "";
    client = new Meilisearch({
      host,
      apiKey,
      timeout: 3000,
    });
  }
  return client;
}

export async function searchMeilisearch(indexName, query, options = {}) {
  try {
    const meili = getMeilisearchClient();
    const index = meili.index(indexName);
    const searchRes = await index.search(query, options);
    return {
      success: true,
      hits: searchRes.hits || [],
      estimatedTotalHits: searchRes.estimatedTotalHits ?? searchRes.hits?.length ?? 0,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      hits: [],
    };
  }
}

export default {
  getMeilisearchClient,
  searchMeilisearch,
};
