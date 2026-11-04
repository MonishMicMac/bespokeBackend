import Category from "../../models/Category.js";

/**
 * Validates category_id parameter for getByCategory endpoint
 */
export async function validateCategoryIdExists(categoryId) {
  if (!categoryId || isNaN(Number(categoryId)) || Number(categoryId) <= 0) {
    return {
      isValid: false,
      statusCode: 422,
      response: {
        status: false,
        message: "The selected category id is invalid.",
      },
    };
  }

  const category = await Category.findByPk(Number(categoryId));
  if (!category) {
    return {
      isValid: false,
      statusCode: 422,
      response: {
        status: false,
        message: "The selected category id is invalid.",
      },
    };
  }

  return { isValid: true, category };
}

