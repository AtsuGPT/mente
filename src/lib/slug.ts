export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** "Reflexões sobre o tempo!" -> "reflexoes-sobre-o-tempo" */
export function slugify(input: string, maxLength = 80): string {
  const slug = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= maxLength) return slug;
  return slug.slice(0, maxLength).replace(/-[^-]*$/, "").replace(/-+$/, "") || slug.slice(0, maxLength);
}
