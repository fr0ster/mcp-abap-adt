# Goal: an RFC destination states its own address

## Goal

An RFC destination names the server it dials in its own terms: an application server by its
host and system number (`ashost`, `sysnr`; `SAP_ASHOST`, `SAP_SYSNR`), or a message server by
its host with its service or system id (`mshost` with `msserv` and/or `sysid`; `SAP_MSHOST`,
`SAP_MSSERV`, `SAP_SYSID`). An HTTP URL is no part of an RFC destination, and nothing about
the RFC address is derived from one. Which keys a destination needs follows from its
connection type, and the compiler sees it: past the point where a configuration enters the
type system, an HTTP destination has its URL and an RFC destination has exactly one complete
address. This is the contract mcp-abap-adt 24.0.0 delivers.

## Invariants

- **Stated, never derived.** The RFC host and system number are read as given. No port of
  any URL is turned into a system number, and no default host, system number or address
  kind is chosen.
- **The logon is stated too.** An RFC destination states its client (`SAP_CLIENT`) and its
  logon language (`SAP_LANGUAGE`), and a message-server address states its logon group
  (`SAP_GROUP`); none of them has a default, and a destination without one is refused
  naming it. `msserv` and `sysid` may both be given.
- **No key that does not belong.** An RFC destination that also states a URL, or an HTTP
  destination that states an RFC address key, is refused naming the key that does not
  belong; nothing is silently dropped.
- **One shape per connection type.** The configuration type is a union by connection type:
  HTTP carries its URL; RFC carries either an application-server address or a
  message-server address. Input from outside the type system (an env file, the environment,
  the CLI, YAML, a destination's settings) is checked at the boundary where it is read; past
  it, no code checks again what the type proves.
- **A refusal names what is missing.** A destination that states RFC without a complete
  address, or with two, is refused before any connection opens, naming the keys — never
  quoting a value.
- **Every source says the same.** The keys are the same in an env file, the process
  environment, the CLI and YAML, with the precedence the other connection keys have; the
  system number is read from an env file like the rest of the address.
- **What an RFC destination states is what the logon gets.** `saprouter` goes with either
  address; the client, the language, the group and the logon parameters the destination
  states reach the logon unchanged, and nothing is added to them.
- **The whole path carries it.** A URL-free RFC destination passes through every package
  that hands destination settings on (the auth broker, the stores, the connection library,
  the ADT clients, the server) and every one of them accepts the union contract; each
  package this touches is published from the registry before its consumer depends on it,
  contracts first.
- **RFC works without a URL.** The server starts and every tool it offers over RFC works
  on a destination that has no URL — system information included — with no HTTP endpoint
  assumed or built.
- **The docs describe the new contract only.** Installation and RFC docs, CLI help and the
  migration note say how an RFC destination is written now and what an existing one must
  change; nothing describes the URL-port convention as current.

## Out of scope

- HTTP destinations, the authentication providers, and SNC library lookup: unchanged.
- The meaning of the message-server keys: unchanged.
