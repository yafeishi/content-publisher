# Security policy

Content Publisher is designed as a trusted, single-user local application. It does not currently provide authentication, authorization, tenant isolation, or hardened public-network deployment.

- Bind and expose the service only on a trusted machine or private network.
- Keep API keys, platform credentials, browser profiles, cookies, databases, uploads, generated artifacts, and logs out of Git.
- Use dedicated, least-privilege credentials for each integration and rotate them if they may have been exposed.
- `HOMEPAGE_GITHUB_TOKEN` can push the repository that deploys danghb.cn. Keep it in the environment only, and prefer a token scoped to that homepage repository.
- Review generated content and outbound publishing actions before enabling automation.

Report vulnerabilities privately to the repository owner. Never place live credentials, cookies, private drafts, or personal data in a public issue.
