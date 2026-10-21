/**
 * LINE binding without LINE Login (pure, browser + server):
 * the customer link shows "add our OA" with a pre-filled message that carries the job link;
 * the OA webhook finds the token in that message, binds the sender's userId to the booking
 * (`line_bind`) and replies. Booking numbers are sequential, so the number alone never binds.
 */

/** a job link inside a message text, e.g. "แอ่วกัน การจอง 202610118 https://…/j/<token>" */
export function tokenInText(text: string): string | null {
  const m = /\/j\/([A-Za-z0-9_-]{40,60})(?![A-Za-z0-9_-])/.exec(text);
  return m ? m[1] : null;
}

/** "Add friend + send this message" deep link for the OA (basic id keeps its @, encoded) */
export function lineOaMessageUrl(basicId: string, text: string): string {
  return `https://line.me/R/oaMessage/${encodeURIComponent(basicId)}/?${encodeURIComponent(text)}`;
}
