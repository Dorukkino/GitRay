/** GR-DEP-*: dependencies that are known malware, from OSV's malicious-package records. */

import type { RepoInfo, ScanContext } from "../types";
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
      const which = d.version ? `${d.name} ${d.version} is` : `every version of ${d.name} is`;
      yield {
        path: d.path,
        line: d.line,
        text: d.text,
        note: `${which} a known malicious ${d.ecosystem} package (${d.ids.slice(0, 3).join(", ")})`,
      };
    }
  },
};

export const RULES: readonly Rule[] = [MALICIOUS_DEPENDENCY];
