# Using SAP in Claude Desktop

This is for consultants. You do not need to install anything technical, open a
command prompt, or edit any files. It takes about five minutes.

## What you get

Claude can look things up in SAP for you and answer in plain language:

- *"What fields does ZI_SalesOrder have?"*
- *"Show me the first 20 rows of T001 on ABL."*
- *"Where is Z_PRICING_CHECK used?"*
- *"Switch to kalog and show me the clients."*

It reads SAP using **your own SAP user**, so you see exactly what you would see
in SAP GUI — no more, no less. If you cannot open a table in SAP, Claude cannot
either.

## Before you start

You need:

1. **Claude Desktop** installed and signed in.
2. **The file `sap-abap-adt.mcpb`** — ask Angga for it.
3. **Your SAP user name and password** for the systems you work with.

## Step 1 — install the extension

1. Double-click **`sap-abap-adt.mcpb`**.
   Claude Desktop opens and shows what the extension does.
2. Click **Install**, then **Install** again to confirm.

If double-clicking does nothing, open Claude Desktop and go to
**Settings → Extensions → Advanced settings → Install Extension…**, then pick
the file.

## Step 2 — fill in your SAP login

A settings form appears with a box for each system. **Fill in only the systems
you actually use** and leave the rest blank.

| Box | What to type |
|---|---|
| Start on which system? | `abl`, `kalog` or `swi` — whichever you use most |
| ABL — your SAP user | your user name on ABL |
| ABL — your SAP password | your password on ABL |
| KAD (kalog) — your SAP user | your user name on KAD |
| KAD (kalog) — your SAP password | your password on KAD |
| PEP (swi) — your SAP user | your user name on PEP |
| PEP (swi) — your SAP password | your password on PEP |

Click **Save**. Your password is stored only on your own computer and is sent
only to that SAP system — never to Claude, Anthropic, or anyone else.

## Step 3 — try it

Start a new conversation and ask:

> Which SAP systems can you see?

Claude should list the systems you filled in. Then try:

> Show me the first 10 rows of T000.

If that returns data, you are done.

## Moving between systems

Just ask. Claude stays on one system until you tell it to move:

> Switch to kalog.

Claude reconnects, confirms it moved, and everything after that runs on the new
system. If the switch fails it stays where it was, so you never end up
disconnected without knowing.

## When you change your SAP password

Go to **Settings → Extensions → SAP ABAP ADT**, type the new password, save,
and restart Claude Desktop.

## If something does not work

**"No SAP credentials configured"**
The form is empty. Open Settings → Extensions → SAP ABAP ADT and fill in at
least one system.

**Claude says it cannot connect, or a system is missing from the list**
Almost always a typo in the user name or password, or a locked SAP user. Try
logging into that system with SAP GUI using the same user and password. If SAP
GUI works and Claude does not, send Angga a screenshot of the error.

**"Name or password is incorrect" after you changed your password**
Update it in the extension settings too — see the section above.

**Claude answers about SAP without actually looking**
Ask it directly: *"Use the SAP tools to check this."* If the extension is off,
you will see it greyed out in Settings → Extensions.

**ABL works but kalog or swi says it cannot connect**
Those two use a different connection method that needs a Windows component
called the *Visual C++ 2013 Redistributable (x64)*. Most machines already have
it. If yours does not, ask IT to install it — you cannot fix this one from the
extension settings.

**Everything worked yesterday and stopped today**
Restart Claude Desktop first. If it still fails, your SAP user may be locked
after too many wrong password attempts — check with SAP GUI.

## What Claude can and cannot do

It reads and analyses: source code, CDS views, tables and their data, where
objects are used, transports, dumps.

It can also create and change ABAP objects — but only if your SAP user is
allowed to, and only on systems where that is permitted. On a production system
your normal SAP authorisations stop it, exactly as they stop you.

It never sees SAP data you cannot see yourself.
