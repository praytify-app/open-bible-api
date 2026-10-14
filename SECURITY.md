# Security policy

Report vulnerabilities privately through this repository's **Security** tab ("Report a vulnerability"). Do not open public issues for them.

The engine is designed to run on an internal network behind the [Praytify Bible gateway](https://github.com/praytify-app/bible-api), which handles API keys, quotas, CORS, and caching. Admin routes require `ADMIN_TOKEN`; requests from the gateway carry `GATEWAY_TOKEN`. If you expose the engine directly, put your own authentication and rate limiting in front of it.

See the gateway's [SECURITY.md](https://github.com/praytify-app/bible-api/blob/main/SECURITY.md) for scope and disclosure details.
