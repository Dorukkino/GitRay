/** GR-DEP-*: dependencies that are known malware, from OSV's malicious-package records. */

import type { RepoInfo, ScanContext } from "../types";
import { note } from "../notes";
import type { Hit, Rule } from "./base";

const MALICIOUS_DEPENDENCY: Rule = {
  id: "GR-DEP-001",
  title: "Depends on a known malicious package",
  category: "dependencies",
  weight: 70,
  why:
    "The repository's own code can be clean while npm install or pip install pulls in a " +
    "package that security researchers have confirmed as malware (OpenSSF malicious-packages " +
    "data, served by OSV). Installing the dependencies runs it. This is how fake job-interview " +
    "projects and typosquatted packages deliver stealers.",
  *scanRepo(_info: RepoInfo, ctx: ScanContext): Iterable<Hit> {
    for (const d of ctx.maliciousDependencies ?? []) {
      const ids = d.ids.slice(0, 3).join(", ");
      yield {
        path: d.path,
        line: d.line,
        text: d.text,
        ...(d.version
          ? note("depVersion", { name: d.name, version: d.version, ecosystem: d.ecosystem, ids })
          : note("depAllVersions", { name: d.name, ecosystem: d.ecosystem, ids })),
      };
    }
  },
};

export const RULES: readonly Rule[] = [MALICIOUS_DEPENDENCY];
