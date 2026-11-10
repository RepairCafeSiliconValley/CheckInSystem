// The path a printed ticket's QR opens for a work order: /T/<CODE>, built with
// the same ticketCode() the app prints with, so specs follow it if it changes.
// Specs open the ticket page through this rather than the legacy /fix/:id, so
// they exercise what fixers actually scan.

import { ticketCode } from "../../src/lib/ticketLink.js";

export const ticketPath = (workOrderId) => `/T/${ticketCode(workOrderId)}`;
