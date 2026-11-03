const URGENT = /\b(today|tonight|asap|urgent(ly)?|immediately|right away|before (noon|\d{1,2}(:\d{2})?\s?(am|pm))|end of day|eod|this morning|this afternoon)\b/i;

export type Urgency = "today" | "urgent" | null;

/**
 * Delivery urgency is a human signal in the email text, not something the ERP
 * knows. "today" is called out separately because it changes what a clerk does
 * first; anything else time-pressured is still worth a flag.
 */
const NOT_A_REQUEST = /auto[- ]?reply|automatic reply|out of office|auto[- ]?response|undeliverable|delivery status notification|read receipt/i;

export function urgencyOf(subject: string, body: string): Urgency {
  // An out-of-office bounce that says "urgent matters" is not a customer deadline.
  if (NOT_A_REQUEST.test(subject)) return null;
  const text = `${subject}\n${body}`;
  if (!URGENT.test(text)) return null;
  if (/\b(today|tonight|this morning|this afternoon|end of day|eod)\b/i.test(text)) return "today";
  return "urgent";
}
