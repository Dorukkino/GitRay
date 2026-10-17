/**
 * Structured data (schema.org JSON-LD) for search engines. Rendered as a plain
 * <script> whose text is our own static data, with "<" escaped so it can never
 * break out of the tag. React sets it as the script's text content, so the raw
 * HTML injection APIs the project bans are not used here.
 */
export function JsonLd({ data }: { data: object }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json">{json}</script>;
}
