// {{customer_name}} substitution for WhatsApp campaign messages — unlike
// src/lib/email-template.ts's renderTemplate (which blanks any unrecognized
// token so a typo never leaks "{{foo}}" into a real email), this leaves
// anything that isn't exactly {{customer_name}} untouched. A WhatsApp
// message is short and casual enough that a misspelled token showing up
// literally is more useful (visibly wrong, easy to spot and fix) than
// silently disappearing.
export function renderWhatsAppTemplate(template: string, customerName: string): string {
  return template.replace(/\{\{\s*customer_name\s*\}\}/g, customerName);
}
