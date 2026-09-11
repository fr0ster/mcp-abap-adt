# Contributors

Thank you to all contributors who have helped make mcp-abap-adt better!

## How to Contribute

We welcome contributions! Please see the project documentation for details on how to get started.

## Contributors

<!-- Ordered by commits. Line counts are `git blame` against the current tree,
     excluding lockfiles and binaries, measured 2026-09-03. -->

| Contributor | Commits | Lines surviving in the tree | Period |
|---|---:|---:|---|
| **Oleksii Kyslytsia** ([@fr0ster](https://github.com/fr0ster)) — maintainer | 962 | 176,236 | 2025-05 – present |
| **mario-andreschak** ([@mario-andreschak](https://github.com/mario-andreschak)) — original project | 33 | 136 | 2025-01 – 2025-03 |
| **Henry Mao** ([@calclavia](https://github.com/calclavia)) | 3 | 7 | 2025-02 |
| **Aleksandr Razinkin** ([@raaleksandr-epam](https://github.com/raaleksandr-epam)) | 2 | 0 | 2026-01 |
| **Frank Fiegel** ([@punkpeye](https://github.com/punkpeye)) | 1 | 0 | 2025-03 |

Reproduce the line counts with:

```bash
git ls-files | grep -vE 'package-lock.json|\.(png|jpg|gif|ico|pdf)$' \
  | while read -r f; do git blame --line-porcelain -- "$f"; done \
  | grep '^author ' | sort | uniq -c | sort -rn
```

The project began in January 2025 from mario-andreschak's work and was rebuilt on
its own architecture from May 2025 onward. What remains of the original is 136
lines of 176,379 — mostly `.gitignore`, `tsconfig.json` and CHANGELOG history,
with 25 lines across `src/lib/utils.ts` and six read-only handlers. Henry Mao's 7
surviving lines are in `docker/Dockerfile`. The acknowledgment in the README
records where the project started.

## Licensing

The project ships as two packages under two licences, and which one applies
depends on which you install:

| Package | Licence | From |
|---|---|---|
| `@mcp-abap-adt/lib` | Apache-2.0 | 10.0.0 |
| `@mcp-abap-adt/core` | AGPL-3.0-only | 10.0.0 |

Before 10.0.0 there was one package, `@mcp-abap-adt/core`. It was **MIT**
through 8.13.0 and **GPL-3.0-only** for 9.x.

Two separate things make every one of those changes lawful, and it is worth
keeping them apart:

**The mechanism is the MIT grant, not the ownership share.** Every outside
contribution above was made under MIT, which grants permission "to use, copy,
modify, merge, publish, distribute, **sublicense**, and/or sell copies".
Sublicensing is exactly what placing that code under a different licence is, so
no contributor's separate permission is required — and no threshold of
authorship would have been required either. A project that was 1% one author's
work could relicense on the same basis.

**The ownership share is context.** 99.9% of the current tree is Oleksii
Kyslytsia's work, so in practice the relicensed body of code is almost entirely
his own to place under whichever licence he chooses outright.

Neither of these takes anything away from the contributors above. Every grant
they gave, and received, for the versions they contributed to stands unchanged
and is not revoked by a later release carrying a different licence; anyone may
still take 8.13.0 or earlier under MIT, or a 9.x release under GPL-3.0-only.
Copyright in their lines remains theirs — the licence on the combined work
changed, not the authorship of any part of it.

**Why two licences.** The project is a library and a server, and licensing them
together forces the stricter of the two onto both. A network service that
embeds the ADT tools would have taken on AGPL section 13 obligations because the
same package also carried a launcher it never ran. Splitting them means
installing the library never puts the server in your dependency tree.

**The option of other terms is deliberately kept open.** Apache-2.0 is what the
library is offered under publicly; it is not a statement that it can only ever
be offered that way. The copyright holder may additionally license the same code
to a particular party under different terms — the usual reason being a party who
cannot accept even Apache's notice and attribution conditions, or who wants
warranties an open licence explicitly disclaims. Offering a second licence takes
nothing away from the first: everyone who received the code under Apache-2.0
keeps it under Apache-2.0, permanently.

Three things keep that option open, and all three are conditions on how this
repository is maintained rather than legal theory:

1. **Substantially all the copyright is held by one person.** You cannot offer
   terms on someone else's code without their permission.
2. **Every inbound contribution has arrived under a licence that permits
   sublicensing.** MIT says so in as many words, and Apache-2.0 grants the right
   to "reproduce, prepare Derivative Works of, publicly display, publicly
   perform, **sublicense**, and distribute". A contribution offered under a
   copyleft licence would not carry that permission, and accepting one would
   close the option for whatever it touched.
3. **No copyleft code has been copied into this tree.** This is the one that
   needs active care, because the four packages underneath — `adt-clients`,
   `connection`, `interfaces` and `logger` — are LGPL-3.0-only and share an
   author with this repository. Linking them is fine and is what the library
   does. Pasting a function out of one of them into a file here would make that
   file LGPL-encumbered, make the Apache notice on it untrue, and take that file
   out of anything the copyright holder could offer separately.

If that ever stops being true for a file, the honest fix is to say so on the
file, not to leave the notice standing.

**The libraries underneath stay LGPL-3.0-only** — `@mcp-abap-adt/adt-clients`,
`connection`, `interfaces` and `logger`. The library links all four at runtime,
so their terms travel with any distribution regardless of what this repository
is licensed as.

---

## Recognition

We appreciate every contribution, whether it's:
- 🐛 Bug reports and fixes
- ✨ New features and enhancements
- 📚 Documentation improvements
- 🧪 Test coverage
- 💬 Feedback and suggestions

Every contribution helps make mcp-abap-adt better for everyone!

---

**Note:** The tables above are read from git history. If you've contributed but
don't see your name here, please open an issue or submit a PR to update this file.
