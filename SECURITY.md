# Security policy

## Supported versions

Security fixes are developed on `main` and released through the Chrome Web Store. Only the latest published extension version is supported; users should keep Chrome's automatic extension updates enabled.

| Version                               | Security support |
| ------------------------------------- | ---------------- |
| `main` and pre-release builds         | Best effort      |
| Latest Chrome Web Store release       | Supported        |
| Earlier Chrome Web Store releases     | Not supported    |
| Unofficial forks or modified packages | Not supported    |

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's [private vulnerability reporting form](https://github.com/spapanik/atlas-links/security/advisories/new) so the report and any proposed fix remain private until coordinated disclosure is appropriate.

Include, where possible:

- the affected Atlas Links or Chrome version;
- the security impact and who can be affected;
- minimal reproduction steps or a proof of concept;
- any suggested mitigation; and
- whether the issue is already public or has been shared elsewhere.

Use synthetic test bookmarks and redact account identifiers, OAuth tokens, complete private URLs, bookmark contents, and other personal data. Never include another person's data in a report.

The maintainers aim to acknowledge a report within seven days, then confirm its status and expected next steps after triage. Please allow time for a fix to reach users through Chrome Web Store review before publishing details. Reporters who want public credit can request it in the private advisory.

General bugs, feature requests, and non-sensitive privacy questions belong in [public Issues](https://github.com/spapanik/atlas-links/issues). This project does not currently operate a paid vulnerability-reward program.
