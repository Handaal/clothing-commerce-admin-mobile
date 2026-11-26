import {
  MAX_FEATURED_COLLECTIONS,
  MAX_FEATURED_PRODUCTS,
  validateContentForm as validateContentIssues,
  type FormIssue,
  type StorefrontContentForm,
} from "@shifted/clothing-commerce-sdk";

/**
 * Home-page content editor state (hero copy + image, curated featured lists). Structured content only:
 * the Storefront owns the layout. The rules and request builder are the SDK's shared management form
 * rules (also used by the POS); this module keeps the app's wording. The API re-validates every field,
 * id ownership, and the image path.
 */
export {
  buildContentRequest,
  contentToForm,
  MAX_FEATURED_COLLECTIONS,
  MAX_FEATURED_PRODUCTS,
  type StorefrontContentForm,
} from "@shifted/clothing-commerce-sdk";

export type StorefrontContentErrors = Partial<Record<keyof StorefrontContentForm, string>>;

function contentIssueMessage(issue: FormIssue): string {
  switch (issue.code) {
    case "too_long":
      return `Keep this to ${issue.max ?? 0} characters or fewer.`;
    case "unsafe_link":
      return "Use a page on your site such as /catalog, or a full https:// link.";
    case "link_required":
      return "Add where the button should go.";
    default:
      return "Check this field.";
  }
}

export function validateContentForm(form: StorefrontContentForm): StorefrontContentErrors {
  const errors: StorefrontContentErrors = {};
  for (const [field, issue] of Object.entries(validateContentIssues(form)) as [
    keyof StorefrontContentForm,
    FormIssue | undefined,
  ][]) {
    if (!issue) continue;
    errors[field] =
      issue.code === "too_many"
        ? field === "featuredProductIds"
          ? `Pick at most ${MAX_FEATURED_PRODUCTS} products.`
          : `Pick at most ${MAX_FEATURED_COLLECTIONS} collections.`
        : contentIssueMessage(issue);
  }
  return errors;
}
