# Security policy

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report it privately through GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository — the "Report a vulnerability" button under the Security
tab. That opens a channel visible only to the maintainers.

Useful things to include, to whatever extent you have them:

- what an attacker can do, and what they need in order to do it
- the affected version or commit
- steps to reproduce, or a proof of concept
- anything you already know about a fix

### What to expect

VelaChess is maintained by a very small number of people, so please read
these as intentions rather than guarantees:

|                                         |                                                               |
| --------------------------------------- | ------------------------------------------------------------- |
| First response                          | within 5 business days                                        |
| Assessment and severity                 | within 10 business days                                       |
| Fix for a confirmed high-severity issue | as fast as we can, and we will keep you updated if it is slow |

We will tell you when a fix ships, and we will credit you in the advisory
unless you would rather we did not.

## Scope

In scope: this repository — the API, the worker, the web app, the database
layer, the authentication flow, the deployment manifests under `docker/`.

Out of scope: vulnerabilities in Chess.com, Lichess, Stockfish, Postgres or
any other third party. Report those to their maintainers. Findings that
require an already-compromised machine, or that describe a self-hosted
deployment misconfigured against our own documentation, are also out of
scope — though if our documentation is what led someone there, that _is_ a
bug and we want to hear about it.

## Self-hosting notes

VelaChess is meant to be self-hosted, which puts most of the security
boundary in the operator's hands:

- `VELACHESS_AUTH_SECRET` must be a real secret, unique per deployment
- serve it over TLS — session cookies are not safe on plain HTTP, and the
  server logs a warning at boot if it detects it is being served that way
- the database holds your games and your account links; back it up and do
  not expose Postgres to the internet
- sign-up is closed by default on the mounted auth surface; open it
  deliberately
