# Security policy

GiTRay scans repositories that may be malicious, so bugs in GiTRay itself matter. Thank you for reporting them privately.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting: open the repository's **Security** tab and choose **Report a vulnerability** (https://github.com/Dorukkino/GiTRay/security/advisories/new). Please do not open a public issue for a vulnerability.

Include what you found, how to reproduce it and what an attacker could do with it. You will get an answer as soon as possible; this is a one-person, non-commercial project, so there is no bug bounty.

## In scope

- Anything that makes GiTRay run, unpack to disk or download code from a scanned repository
- Escaping the sanitizer: invisible characters, clickable or live links, or markup from a scanned repository showing up in the site
- Getting around the archive, ZIP or time limits (archive bombs, hangs)
- Getting around the rate limits or the shared scan budget
- Leaking a secret (GitHub token, database URL, VirusTotal key)

## Out of scope

- A repository that GiTRay misjudges (a false positive or a missed trick). Open a normal issue for that: https://github.com/Dorukkino/GiTRay/issues
- Denial of service by sending a lot of traffic
- Reports from automated scanners without a working example
