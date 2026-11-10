# Source: support inbox

Trigger `source-support-inbox` (cron, every 2 h at :30). Disabled by default.
Setting: `sources.support-inbox.connector` (`intercom`, `zendesk`, `front`,
`helpscout`, `gmail`, or another connector that lists conversations).

| | |
|---|---|
| Signal | support conversations updated since the last run |
| Finding | a product defect or a missing capability that customers report, not a how-to question or an account request |
| Bar | the conversation names a surface, an action and a wrong result, and the defect reproduces from that description on the dev environment, or at least 3 distinct customers asked for the same change in 30 days. One customer's how-to question is never a ticket |
| Key | `support:<defect slug>` (the surface and the defect class, slugged; never a customer or a conversation id) |
| Signal value | `signal: conversations_30d=<n> customers_30d=<n>` |
| Priority | 1 several customers blocked; 2 a reproduced defect; 3 a repeated request |
| Kind | `bug` or `feature` |
| Credentials | the support connector, read-only |

## Run

1. List conversations updated since the cursor (the `support:ledger` body),
   into a file. Keep only the subject, the tags and the first customer message.
2. Classify each in code and by reading: defect, request, question, account,
   noise. Keep defects and requests.
3. Group by surface and defect class. Count conversations and distinct
   customers in 30 days.
4. Reproduce each defect group on the dev environment with synthetic data. Not
   reproduced: digest line, not a ticket.
5. Upsert (contract §5). **Paraphrase only**: no customer name, email,
   company, message text, conversation id or link to the conversation in the
   ticket. `## Source`: `support inbox · <n> conversations in 30 days`.
6. Never reply to a customer, never change a conversation, never tag it. A
   person does the outreach after the fix.
7. Update the cursor and the digest on `support:ledger`.
8. End with `source-support-inbox:` and the contract run line.
