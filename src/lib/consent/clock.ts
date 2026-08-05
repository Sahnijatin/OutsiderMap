import "server-only";
import { maxAdultBirthDate } from "./age";

/**
 * Clock reads for the consent flow, kept out of component render.
 *
 * React 19 rejects impure calls during render, and it is right to: a render
 * whose output depends on Date.now() can disagree with itself between server
 * and client. Doing it here also makes the value better than the client
 * alternative - a browser clock can be wrong or deliberately set, and the
 * server's is the one set_date_of_birth() will actually judge against.
 */
export async function adultBirthDateCutoff(): Promise<string> {
  return maxAdultBirthDate(Date.now());
}
