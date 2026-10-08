# Asst. Bang Mando — integration checkpoint

## Help desk and account permission update

Bang Mando focuses on application usage and troubleshooting, with polite casual Jakarta Indonesian. Tutorial knowledge is maintained in Drive document `19ld-QJ6ZJPPyz6bF8YfUjpVQteioTD8gn2ga7k1925A`, in the user-specified knowledge folder. The supplied manual-paste GAS package loads that document first; applying this repository change does not deploy GAS source.

`profiles.chatbot_enabled` defaults to false. Super Admin manages it in Finance > Akun & PIN (create/edit account); existing Super Admin roles retain automatic access. AR/AP layouts derive chat visibility from the authenticated server profile in the existing session query, with no additional polling. Existing profile RLS allows Super Admin updates only. Users refresh/re-enter the app after a permission change. This governs the embedded app launcher; it does not change the external GAS deployment's public accessibility or grant data retrieval.

## Implemented

Authenticated AR shell embeds the user-provided Apps Script deployment in a collapsible, lazy-loaded frame. User changes remount the frame. Remote frame receives no app session, access token, database key or financial data. External resource loads only on opening. A separate-tab link is available for browser iframe/login restrictions. Existing overlay stack manages Escape priority.

## External source access needed

Script ID: `1bM1QCyczdQjJAUe3i4MxzsNMP1c4onMXxrpAKyuuur8zpQUGEBZJ5Ern`.
Knowledge folder: `1A4o-RA3FyZ7xsrardV3u3jHso2RWB0pK`.
The provided public deployment exposes frontend `google.script.run.processChat(message)`. Its server-side implementation is not available through the Drive connector. Drive metadata lookup of the Script ID returned 404; that does not establish ownership or editor permissions because Script IDs are not necessarily Drive file IDs.

Folder inventory currently contains a staff spreadsheet and a product knowledge document. Folder visibility must not be treated as approval to make its contents public to every app role.

## Data-connected design to implement after inspecting existing processChat

1. Keep static usage/tutorial knowledge separate from live financial results. Upload a reviewed application guide in the format the existing getDriveData loader actually supports.
2. Add a same-origin authenticated application endpoint. Verify current user/active profile/workspace/menu before any retrieval. Use the user's Supabase client and RLS; never send a service-role key or login token to Apps Script, the iframe or Drive.
3. Define bounded read-only tools for explicit user questions: invoice/SJ lookup, current Aging summaries, Mitra10/RKM status, collector daily reports, Collection open/closed period summaries. Restrict by menu and collection assignment on the server. No unrestricted SQL or arbitrary RPC chosen by a model.
4. Apps Script proposes a tool call; the application server validates the tool name, typed parameters, range and result size, then retrieves allowed results. Authenticate server-to-server calls with a dedicated integration secret stored only in server environment/Script Properties; user permissions are enforced by the application server, never by claims supplied in a chat message.
5. Supply only necessary result columns, source module, active snapshot/report date, filter and aggregate counts. Closed Collection uses its frozen snapshot. Do not copy the entire database to a shared Drive folder.
6. Answers distinguish missing data, denied access, current Aging and closed-period values. Treat knowledge and retrieved data as untrusted content, never as instructions to change permissions or run SQL.
7. Inspect and fix the existing frontend rendering: public HTML currently inserts messages with innerHTML. Use textContent/DOM nodes or a vetted sanitizer before displaying database-derived or model text. Validate embed message origins if introducing postMessage; the Google wrapper has a nested googleusercontent frame, so parent/source validation must be verified in-browser rather than assumed.
8. Test allowed/denied users, cross-collection requests, logout/account changes, malicious prompts, source freshness, empty queries, timeouts and response rendering before enabling live data in production.

## Completion state

The embed is independent and can run with the existing chatbot. Supabase retrieval and knowledge ingestion are NOT connected by this checkpoint. Updating and redeploying the existing Apps Script requires editor access through Apps Script API or the approved browser workflow, plus inspecting the original source before modification.
