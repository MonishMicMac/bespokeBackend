import * as searchService from "../services/searchService.js";

/**
 * GET /api/search/suggestions?q=
 * Returns autocomplete suggestions: products, categories, subcategories, brands, popular searches
 */
export const getSuggestions = async (req, res) => {
  try {
    const q = req.query.q || req.query.query || req.query.search || "";
    const suggestions = await searchService.getSearchSuggestions(q);
    return res.json({
      status: true,
      data: suggestions,
    });
  } catch (error) {
    console.error("❌ Search suggestions error:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to retrieve search suggestions",
      error: error.message,
    });
  }
};

/**
 * GET /api/search/products
 * Returns faceted search results with dynamic category-aware filters
 */
export const searchProducts = async (req, res) => {
  try {
    const result = await searchService.searchProductsWithFacets(req.query);
    return res.json({
      status: true,
      data: result,
    });
  } catch (error) {
    console.error("❌ Search products error:", error);
    return res.status(500).json({
      status: false,
      message: "Search query failed",
      error: error.message,
    });
  }
};

