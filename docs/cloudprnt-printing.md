# Printing tickets with Star CloudPRNT

Tickets can print two ways, chosen per event under **Events → Configure Event → Printing**:

| Setting | Off (default for new events) | On |
| --- | --- | --- |
| Use legacy window.print() | Tickets go to the event's Star printer through **CloudPRNT**, from any device: PC, Mac, phone or tablet. Nothing to install | Tickets print through the browser's print dialog, as before |
| Enable print preview | Approve & Print and Reprint print at once from the visitor's screen. With CloudPRNT, a problem (no printer set, printer offline) shows there as a message | The desk sees the tickets first and presses Print, as before |

Events that existed before `supabase-cloudprnt-migration.sql` ran keep both settings **on**, so nothing changes for them until an admin chooses.

Older printers that don't support CloudPRNT, such as the TSP143IIILAN, keep **Use legacy window.print()** on. Star's CloudPRNT list covers the TSP100IV family (TSP143IV), mC-Print2/3, mC-Label2/3, and the TSP650II/700II/800II/SP700 with an IFBD-HI01X/HI02X network board.

## How it works

1. The desk presses Approve & Print or Reprint. The browser calls the `queue_cloudprnt_jobs` RPC, which checks the event has a printer that checked in within the last **30 seconds**. It then adds one to each item's `print_count`, sets `printed_at` if it's still empty, moves new items to Checked-In and adds a row per ticket to `print_jobs`. If the printer isn't there, nothing is counted and the desk sees "No printer is set up for this event" or "No printer detected…".
2. The printer checks in with the `cloudprnt` Edge Function every few seconds (a POST with its MAC address). Each check-in updates `cloudprnt_printers`, and the function tells the printer when a job is waiting.
3. The printer fetches the job (GET). The function builds the ticket in Star's command format (`supabase/functions/cloudprnt/starTicket.js`) for 80 mm paper, with **REPRINT** at the top when the item's print count is above 1.
4. The printer reports the result (DELETE). The job becomes `printed`. A failed job is retried up to three times, then marked `failed`. A job nobody fetched within 10 minutes is marked `expired`, so a printer switched on later doesn't print old tickets.

The printer only ever makes outgoing HTTPS requests, so it works on any network with internet access and needs no fixed IP address or open ports.

## One-time setup per Supabase project (DEV first, then PROD)

1. Run `supabase-cloudprnt-migration.sql` in the SQL Editor.
2. Pick a long random secret, for example the output of `openssl rand -hex 24`, and store it:

   ```
   supabase secrets set CLOUDPRNT_SECRET=<secret> --project-ref <project-ref>
   ```

3. Deploy the function without JWT checking (printers can't send a Supabase login):

   ```
   supabase functions deploy cloudprnt --no-verify-jwt --project-ref <project-ref>
   ```

The printer's server URL is then:

```
https://<project-ref>.supabase.co/functions/v1/cloudprnt/<secret>
```

Treat that URL like a password. Anyone who has it can pull queued tickets, which show the client's first name and last initial. To change it, set a new secret and update each printer.

## Setting up a printer (TSP143IV)

1. Connect the printer to the network by Ethernet or Wi-Fi, and make sure that network reaches the internet.
2. Hold the FEED button while switching the printer on to print its self-test. Note the **IP address** and the **MAC address**.
3. On a computer on the same network, open `http://<printer IP address>` (Web Configuration) and log in. The factory login is `root` / `public`; change the password.
4. Open the **Star CloudPRNT** settings:
   - turn CloudPRNT on
   - **Server URL**: the URL above
   - **Polling interval**: 5 seconds. The desk's "printer detected" check allows 30 seconds, so keep it well under that.

   Save, and let the printer restart. Star's Quick Setup Utility app offers the same settings. Menu names vary a little between firmware versions; CloudPRNT needs TSP100IV firmware 1.0 or later.
5. In the app, open **Events → Configure Event** for the event, untick **Use legacy window.print()**, and enter the printer's MAC address, or tap it under "Printers seen recently". The line under the field should say **Online — last checked in just now**. Save.

The printer stays tied to the event, so each new event needs its printer chosen again. The "Printers seen recently" list makes that one tap.

## Cost

Star charges nothing for CloudPRNT. Each check-in is one Edge Function call:

| Printer on | Checking in every 5 s |
| --- | --- |
| A 5-hour event | about 3,600 calls |
| All day, every day | about 17,000 calls a day, 520,000 a month |

The Supabase free plan includes 500,000 Edge Function calls a month and Pro includes 2 million. **Switch the printer off after each event**, or set a longer polling interval between events.

## Troubleshooting

| The desk sees | Check |
| --- | --- |
| No printer is set up for this event | Configure Event: legacy printing is off but no MAC address is saved |
| No printer detected | The printer is off, offline, has the wrong server URL or secret, or polls less often than every 30 seconds. Configure Event shows when it last checked in |
| "Sent to the printer" but nothing prints | Look at `print_jobs` for the item: `queued` with no `fetched_at` means the printer isn't fetching; `failed` has the printer's `result_code` (paper out, cover open) |
| Ticket prints as plain text with no QR code | The printer asked for `text/plain`; check its emulation is StarPRNT, not ESC/POS |
