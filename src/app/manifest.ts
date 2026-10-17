import type { MetadataRoute } from "next";

import { SITE_NAME } from "@/lib/site";

/** Web app manifest: name, icon and colours for install prompts and mobile. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: "Scan a public GitHub repository for malware tricks without cloning or running anything.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b1220",
    theme_color: "#0b1220",
    icons: [{ src: "/icon.svg", type: "image/svg+xml", sizes: "any" }],
  };
}
