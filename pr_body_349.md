## Description

This PR addresses the security concerns outlined in **Issue #349: [Security] Enforce Stricter Input Validation and Prevent Injection Vulnerabilities**.

### Changes Made:
- Exported the base `uuidSchema` and `sessionSecretSchema` from `validators/schemas.js`.
- Implemented robust Zod-based validation on the `/upload` and `/process-from-url` endpoints in `server.js`.
- Prevented potential NoSQL/injection payloads or malformed requests from bypassing basic checks in the `session_id` and `session_secret` fields, which were previously only weakly verified in these endpoints.

## Type of change

- [x] Security Fix
- [x] Bug fix (non-breaking change which fixes an issue)

## Checklist:

- [x] My code follows the style guidelines of this project
- [x] I have performed a self-review of my own code
- [x] I have tested the endpoints to ensure valid payloads pass and invalid ones are blocked
