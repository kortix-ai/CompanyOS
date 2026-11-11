Self-hosted web app updates roll out again

### Fixed
- Self-hosted Kortix: updating to v0.15.5 kept the previous web app running, because the new web app failed its own health check. `kortix self-host update` rolls the web app out again, and the health check now reads the app's health route.
- A plain-HTTP visitor is redirected to HTTPS on the host they asked for, never to the server's internal address.
