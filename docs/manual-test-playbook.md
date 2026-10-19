# CheckIn System Manual Test Playbook

Most of the old playbook now runs as code. This page keeps only what a person has to check by hand: real Google sign-in, printing and scanning, real phones, deployed environments and how things look. Allow about 45 minutes.

The automated suites run against the local Supabase stack. Run them first; a manual pass on a red build wastes time.

| Command | What it covers | Time |
| --- | --- | --- |
| `npm run test:db` | RLS and the public RPCs for each access level, plus the known gaps as expected failures (pgTAP, 109 checks) | ~1 s |
| `npm run test:unit` | Every Metrics, Queue and Admin number (`metrics.js`, 19 tests) | ~1 s |
| `npm run test:e2e` | Every page in Chromium: routing, check-in form and waiver, queue, visitor detail, printing (preview only), fixer page, cancel and undo, admin events, allowlist and users, access gates, Metrics, both CSV exports, landing page (71 tests) | ~1 min |
| `npm test` | All three | ~1.5 min |

The browser tests sign in with the same URL hash Supabase returns after a login, so they never touch Google. They create their own `E2E …` events and `@e2e.example.com` users and delete them afterwards.

## Setup

Run the manual pass on the **Vercel preview of the branch**, which uses the DEV database. Never PROD. Sections 1 and 5 also work on the local stack if its Google client env vars are set.

- [ ] `npm test` is green on the branch.
- [ ] Google account **A** is an admin on DEV, or on the DEV allowlist. You need it to reach `/admin`.
- [ ] Google account **B** is not an admin and not on the allowlist.
- [ ] You know the DEV volunteer password.
- [ ] Devices: a laptop, an iPhone (Safari) and an Android phone (Chrome), all able to reach the preview URL. Borrow whichever you lack and note what was skipped.
- [ ] The front-desk thermal printer, or print-to-PDF if it isn't available.
- [ ] One test event made in Admin, named `QA <date> <initials>`, dated today. Use names starting `QA` for every visitor you create.

For each failure, note the step number, device and browser, a screenshot and any console errors.

## 1. Google sign-in for admins

The tests fake the return trip from Google. These steps check the real round trip and the environment's settings: the Google client, the redirect URLs and the Before User Created hook.

| # | Action | Expected result |
| --- | --- | --- |
| 1.1 | Laptop, private window: open `/admin`, click Continue with Google | Google's account chooser opens, even if you're already signed in to Google |
| 1.2 | Choose account **B** (not invited) | Back on `/admin` with a red message: "&lt;B's email&gt; has not been approved for admin access." The address bar has no `#error=…` left in it. B does not appear under Users |
| 1.3 | Continue with Google again, choose account **A** | The Events tab opens. The header shows A's Google name with "(admin)" |
| 1.4 | If A was only on the allowlist: open Allowlist, then Users | A's invite is gone from Allowlist. A is listed under Users with the Google name and today's "Last login" |
| 1.5 | Click "Queue →" in the header | The Queue opens as A, without asking for the volunteer password |
| 1.6 | Go back to `/admin` | "You're still signed in as A, but this device has been on the volunteer queue since." Continue with Google shows the chooser; picking A gets you back in |
| 1.7 | Click Logout. Hover it first | The tooltip says to sign out of Google too on a shared device. After logout, both `/admin` and `/queue` ask you to sign in |
| 1.8 | Sign in to `/queue` with the volunteer password, then open `/admin` | "This device is signed in with the volunteer account." Continue with Google as A replaces the volunteer login |
| 1.9 | Optional, needs a second admin: have them disable A under Users, then reload `/admin` as A | "Your admin account (A's email) has been disabled." Re-enable A afterwards |

## 2. Printing and QR codes

The tests check the print preview and stub out the browser's print call. They can't judge paper output or point a camera at a QR code.

| # | Action | Expected result |
| --- | --- | --- |
| 2.1 | Admin → the QA event's QR badge. Scan the code with each phone's camera | Each phone opens the QA event's check-in form on the preview URL |
| 2.2 | On the iPhone, check in visitor `QA Alice` with two items. On the Android phone, `QA Bob` with one | Both reach the confirmation screen with a letter-digit-letter ID and one code per item |
| 2.3 | Laptop `/queue`: open Alice, set both categories, Approve & Print All Tickets, then Print | The print dialog shows 2 pages, one ticket per page, nothing cut off at the edges. On the thermal printer each ticket fits one label |
| 2.4 | Read a printed ticket | Submitted time, priority badge, category, item, issue and "QA Alice T." are legible at arm's length. The QR is sharp |
| 2.5 | Scan each ticket's QR with a phone | It opens `/fix/<id>` on the preview URL and shows the right item |
| 2.6 | On the phone, record Fixed for item 1 | The laptop's Queue shows Completed for that item within a few seconds |
| 2.7 | Mark Bob as a volunteer, then print his ticket | The priority badge carries the volunteer marker |
| 2.8 | Reprint Alice's tickets | The same tickets print again, with the same submitted time |

Tickets printed from a `localhost` page carry `localhost` in their QR, which no phone can open. Always print from the deployed URL.

## 3. Phones and tablets

The tests run a desktop-sized Chromium only. Repeat these on the iPhone (Safari) and the Android phone (Chrome).

| # | Page | Check |
| --- | --- | --- |
| 3.1 | `/checkin` | No sideways scrolling. Zip opens a number pad; Cell Phone opens a phone keypad; Email offers an `@` key. The keyboard doesn't hide the field you're typing in |
| 3.2 | Waiver | The waiver box scrolls on its own; the agree checkbox and Check In stay reachable |
| 3.3 | Confirmation | The ID and item codes are large enough to show a volunteer across a table |
| 3.4 | `/fix/<id>` | The four outcome buttons sit two by two. The reason buttons wrap cleanly; the Submit button isn't hidden behind the keyboard |
| 3.5 | `/queue` and visitor detail | The navy tab bar stays at the bottom, clears the iPhone home bar, and doesn't cover the last card or the Approve & Print button |
| 3.6 | Metrics | The event picker panel stays on screen and scrolls inside itself. Charts fit the width |
| 3.7 | `/admin` → Users | Below about 560 px wide the table turns into cards with a "Sort by" menu. Rename, Disabled and Delete still work |
| 3.8 | Tablet or a rotated phone | Nothing overlaps in landscape |

## 4. Deployed environment

The tests use a local Vite server and the local stack. These checks catch problems that only show up on Vercel or the hosted DEV project.

| # | Action | Expected result |
| --- | --- | --- |
| 4.1 | Open the preview URL. In DevTools → Network, check the Supabase requests | They go to the DEV project, not PROD |
| 4.2 | Open `/checkin?event=<id>`, `/fix/<id>`, `/queue` and `/admin` directly, and reload each | Each page loads. A Vercel 404 means the SPA rewrite in `vercel.json` is broken |
| 4.3 | Open `/queue` on the laptop and a phone at the same time, on the QA event. Check in a visitor from a third device | Both queues show the new visitor within a few seconds, without reloading. Repeat with a cancel and an outcome |
| 4.4 | Leave Metrics open on the QA event while 4.3 happens | Its numbers update live too |
| 4.5 | Admin → Copy link on the QA event's QR | Copying works over `https`. Paste it to confirm it's the preview URL, not `localhost` |
| 4.6 | After a release: repeat 1.1–1.3 on PROD with an admin account, without creating any data | Google sign-in and the allowlist refusal work with PROD's settings |

## 5. Sessions and shared devices

These need real time to pass or more than one person, so they stay manual.

| # | Action | Expected result |
| --- | --- | --- |
| 5.1 | Sign in to `/queue`, leave the tab idle for over an hour, then edit a visitor's zip | It saves ("Saved" shows) without asking for the password again. A silent failure only shows in the console as "Failed to save…": report it |
| 5.2 | Two volunteers open the same visitor on two devices and change the last name in turn | The detail view doesn't refresh itself; the last save wins. Both queues show the final name after a moment |
| 5.3 | Device 1 cancels an item; device 2, not refreshed, records an outcome on it | Note what happens. Volunteer edits have no status check, so the second write likely wins |
| 5.4 | In the portal, open a visitor's detail, then press the browser Back button | You leave the portal, because tabs aren't separate URLs. Coming back lands on the Queue tab. This is known behaviour |
| 5.5 | Log out, then press Back | You don't get back into the portal without signing in |

## 6. Look and feel

The tests check what text says, not how it looks. Do a quick visual pass over each screen you touched in this change.

- [ ] Metrics charts draw, with readable axis labels and the outcome colours matching the stat bars. The tests don't look at charts at all.
- [ ] Status badges use their own colours: Submitted orange, Checked-In navy, With Fixer purple, Completed green, Cancelled grey.
- [ ] Waiver text, confirmation screen and fixer success screen read well and have no typos. If the waiver text changed, `WAIVER_VERSION` was bumped.
- [ ] Error messages (red boxes) and the green "Saved" notices are noticeable without being alarming.
- [ ] The Logout tooltip and the admin gate messages make sense to a volunteer who has never seen them.

## 7. Known gaps, cleanup and sign-off

**Known gaps.** These are pinned in the tests as the rule the app *should* follow, marked as expected failures so the suites stay green. When someone fixes one, its test starts passing and the runner flags it; remove the expected-failure marker then.

| Gap | Pinned in |
| --- | --- |
| `checkin_visitor` accepts a check-in for a closed event | `supabase/tests/rpc_known_gaps.test.sql` |
| `checkin_visitor` accepts more items than the event's Max Items | `supabase/tests/rpc_known_gaps.test.sql` |
| `submit_fixer_outcome` completes a cancelled or never-printed item, so a fixer page left open can overwrite a cancel | `rpc_known_gaps.test.sql` and `e2e/lifecycle.spec.js` |

**Cleanup.** The app can't delete anything, so:

- [ ] Close Check-In on the QA event so it leaves the landing page.
- [ ] Delete printed tickets and PDFs; they carry client names.
- [ ] Delete any exported attendee CSV; it holds email addresses and phone numbers.
- [ ] Optional, DEV only: a maintainer deletes the `QA%` event's rows in the SQL Editor (waivers, work orders, attendees, then the event).

**Sign-off.** Record the branch or deploy URL, the date, the devices and browsers used, the tester, and the failed step numbers. Attach screenshots for each failure, and note any skipped steps.
