import { notFound } from "next/navigation";

/** Unknown paths inside a language get that language's 404 page. */
export default function Missing() {
  notFound();
}
