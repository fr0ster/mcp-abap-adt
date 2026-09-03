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

The project was **MIT** through 8.13.0 and is **GPL-3.0-only** from the next
release onward. Two separate things make that lawful, and it is worth keeping
them apart:

**The mechanism is the MIT grant, not the ownership share.** Every outside
contribution above was made under MIT, which grants permission "to use, copy,
modify, merge, publish, distribute, **sublicense**, and/or sell copies". MIT is
GPL-compatible, so MIT-licensed code may be redistributed as part of a GPL work.
No contributor's separate permission is required for this, and no threshold of
authorship would have been required either — a project that was 1% one author's
work could relicense on the same basis.

**The ownership share is context.** 99.9% of the current tree is Oleksii
Kyslytsia's work, so in practice the relicensed body of code is almost entirely
his own to place under whichever licence he chooses outright.

Neither of these takes anything away from the contributors above. The MIT grant
they gave, and received, for every version up to and including 8.13.0 stands
unchanged and is not revoked by a later release carrying a different licence;
anyone may still take 8.13.0 or earlier under MIT. Copyright in their lines
remains theirs — the licence on the combined work changed, not the authorship of
any part of it.

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
