# Project instructions for Codex

- Follow the current user-authorized stage only. Do not implement a later stage without an explicit request. Avoid unrelated changes.
- Keep `apps/web` focused on UI and `apps/api` focused on HTTP, validation, authorization, and business operations. Put future business logic outside route handlers.
- Use small focused modules, clear names, explicit contracts, and strict TypeScript. Avoid `any` and unnecessary dependencies or abstraction.
- Never commit secrets or expose server credentials in web code. Implement real backend-enforced authorization when its stage is authorized; do not use misleading security placeholders.
- Add meaningful deterministic tests for behavior introduced in each stage. Keep the API testable without opening a listener; avoid external services in unit tests.
- Update README and DECISIONS for significant changes. Explain significant design choices and their tradeoffs.
- Definition of done for each stage: requested behavior works, relevant tests, type checks, lint, formatting, and builds pass; document checks that could not run and known limitations.
