# Questions for the owner: an RFC destination states its own address

Companion of `2026-11-08-rfc-address-spec.md` (the spec) and `2026-11-08-rfc-address-evidence.md`
(`E.n`). The spec's text marked *(decision Qn)* is the answer taken: the recommendation below. An option marked **goal amendment** narrows the approved goal:
choosing it changes the goal, not just the spec.

Decided by the owner: `getBaseUrl()` answers `Promise<string | undefined>`
(interfaces-adt-connection 4.0.0, with its ripple) — spec §3.

1. **Is `connectionType` required on the HTTP shape?**
   Facts: the union needs a discriminant; RFC states `'rfc'`. Today `connectionType` is
   optional (E.1); the HTTP and SSE binaries and embedder literals build settings without it
   (E.6); connection never reads it to pick a wire (E.2); the server's start rule requires a
   stated connection type for a destination (E.6).
   Options: (a) `connectionType?: 'http'` — absence is HTTP in the type; it still discriminates
   against the required `'rfc'`; existing HTTP literals compile; (b) required `'http'` — every
   HTTP literal states it, a break for HTTP callers the goal does not ask for.
   Recommendation: (a). The goal leaves HTTP destinations unchanged; the server keeps requiring
   a stated type for a destination by its own rule, outside the type.

2. **Does the RFC address travel through the destination contract and the stores?**
   Goal: "A URL-free RFC destination passes through every package that hands destination
   settings on (the auth broker, the stores, the connection library, the ADT clients, the
   server) and every one of them accepts the union contract."
   Facts: `IConnectionConfig` has no address field; `EnvDestinationStore` answers only the
   fields it enumerates; the broker forwards whatever the store answers (E.4); today the server
   takes the message-server keys from its start parameters, the `.env` reaching them by being
   copied into the process environment (E.5).
   Options: (a) carry it (spec §4, §5): `IConnectionConfig` gains the seven, the store maps
   them, the broker needs no code, the server reads them as means; (b) **goal amendment**: the
   address stays a server start parameter; broker and stores change only their ranges, and a
   consumer of the stores outside the server gets no address from them.
   Recommendation: (a), the goal as written.

3. **What does `GetServiceBindingPreviewUrl` answer over RFC?**
   Facts: its `service_url`, `metadata_url` and `preview_url` are built on `getBaseUrl()`; the
   V4 descriptor reads `new URL(serviceUrl).pathname`; the system may answer its own service URL,
   absolute or relative; the description promises "the browser URL" (E.7). Over a message server
   the user may not know the HTTP host.
   Options: (a) not offered over RFC; (b) offered, paths and query without an origin (an
   absolute system service URL kept), `origin: 'unknown'`, a fixed note, one added sentence in
   the description (spec §8); (c) offered and refused over RFC in fixed words.
   Recommendation: (b): every part the system answers is given and nothing is invented.

4. **What identifies the system of a background run over RFC?**
   Facts: `BackgroundRunCaller` is `{ url, client, user }`, an exported contract; runs are keyed
   by the three; a destination's caller reads `settings.url` (`''` over RFC); an injected caller
   reads `getBaseUrl()` and has no settings; a fresh connection's run takes the caller computed
   before it starts; a store may be shared by several embedders (E.7).
   Options: (a) `{ system, client, user }` with `system` the system key; an injected connection
   without a URL takes `EmbeddableMcpServerOptions.system`, else background runs are refused
   (spec §8); (b) as (a) keeping the name `url`; (c) keep `''` over RFC.
   Recommendation: (a): an explicit identity where the server cannot know it, and no collision.

5. **Which URL sources refuse an RFC destination?**
   Facts: the URL comes from the destination's `.env` (`SAP_URL`, or `XSUAA_MCP_URL` for an
   XSUAA key); for an ABAP key the store falls back to the key's `url` field by field, and an
   `.env` value, `''` included, masks it; an XSUAA key's `url` is never read; the process
   environment's `SAP_URL` is never read (E.5).
   Options: (a) the matrix of spec §7: the destination's own `SAP_URL` / `XSUAA_MCP_URL` refuses
   an RFC destination, a key's URL is not read over RFC, the environment's not at all; (b) the
   merged URL refuses, key fallback included, masked with `SAP_URL=`.
   Recommendation: (a): the rule is about what the destination states; a key describes the
   system.

6. **Do `SAP_CLIENT` and `SAP_LANGUAGE` take the CLI, environment and YAML forms?**
   Goal: "The keys are the same in an env file, the process environment, the CLI and YAML, with
   the precedence the other connection keys have."
   Facts: both are read from the means today; the `.env` copies them into the process
   environment (`envFileContext.ts:22-54`, called at `launcher.ts:761`), where only the master
   language reads `SAP_LANGUAGE`; neither has a CLI or YAML form; `SAP_CLIENT` applies to HTTP
   too (E.5).
   Options: (a) the goal as written: `--client`, `--language`, YAML keys and the original
   environment at spec §5's precedence, both wires; the `.env` no longer copied into the
   environment, so a value in the environment rank is the process's own; (b) **goal
   amendment**: only the address keys take every source; client and language stay means.
   Recommendation: (a).

7. **Which ranges widen?**
   Facts: interfaces-auth-broker `^2.0.0 || ^3.0.0`, auth-stores and auth-broker `^3.3.0` on
   interfaces-auth-sap, none reading `ISapConfig` in `src`; auth-providers reads it
   (`CertificateAuthProvider`, `FileCertificateMaterialLoader`) with `^3.5.0`, the server's
   installed 6.0.2 with `^3.3.0` (E.4). On the ADT side (decided with `getBaseUrl()`, spec §3):
   interfaces-adt, adt-strategies and adt-clients-legacy widen to interfaces-adt-connection
   `^4.0.0`, and adt-clients-legacy's `adt-clients` peer `^43.1.0` widens to `|| ^44.0.0` (E.3).
   Options: (a) widen the three in the releases of spec §4; auth-providers per Q9; (b) leave
   them, two copies of the contract installed.
   Recommendation: (a).

8. **Confirm: ABAP Cloud with RFC is refused at the start.**
   Facts: connection offers no cloud RFC wire; the server builds cloud over HTTP whatever the
   connection type says; a cloud connector takes `ISapHttpConfig`, which an RFC destination is
   not (E.2, E.6). No other reading is buildable without a cast.
   Recommendation: refuse at the start (spec §7, case 8).

9. **The certificate credential on an RFC config.**
   Facts: `credentialFromSapConfig` passes the whole config to `CertificateAuthProvider` after
   narrowing `authType` only; the server's auth-providers 6.0.2 types it with interfaces-auth-sap
   3.x (`url` required), so an RFC config does not fit (Inference); the RFC wire refuses TLS
   material at every logon (E.2, E.6).
   Options: (a) the server narrows on `connectionType` and refuses a certificate over RFC before
   anything is sent (spec §7, case 9); auth-providers unchanged; (b) auth-providers types the
   parameter by the certificate fields (a minor on the line the server uses), and the wire
   refuses at logon as today.
   Recommendation: (a): it moves the wire's own refusal ahead and leaves the providers unchanged.

10. **RFC-shaped headers on the HTTP and SSE binaries.**
    Facts: the header vocabulary has no RFC key; other headers are not read (Inference: no
    unknown-header refusal found); the goal's forbidden-key invariant names the env file, the
    environment, the CLI, YAML and a destination's settings (E.6).
    Options: (a) nothing: no RFC header exists, so none is a key of an HTTP destination; the docs
    say RFC is stdio only; (b) refuse `x-sap-ashost`, `x-sap-sysnr`, `x-sap-mshost`,
    `x-sap-msserv`, `x-sap-sysid`, `x-sap-group`, `x-sap-saprouter`, `x-sap-connection-type`.
    Recommendation: (a): refusing names that were never keys invents a vocabulary.

11. **The live verification scope.**
    Facts: logon through a message server is unit-tested, not measured live (E.9); whether the
    test system's message server is reachable from the test machine is not in the code.
    Options: (a) application server with SNC and with basic, and the message server when
    reachable, else documented as unit-tested; (b) application server with SNC only.
    Recommendation: (a).
