// Simple {{variable}} substitution for email templates. Unknown tokens
// resolve to an empty string rather than being left in place, so a missing
// variable never leaks "{{foo}}" into a sent email.
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? '');
}
