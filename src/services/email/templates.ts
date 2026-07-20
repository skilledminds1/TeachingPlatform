export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}

export type EmailTemplateInput = {
  preheader?: string;
  heading: string;
  paragraphs: string[];
  action?: { label: string; href: string };
};

export function renderEmailTemplate(input: EmailTemplateInput): string {
  const paragraphs = input.paragraphs
    .map((paragraph) => `<p style="margin:0 0 16px">${escapeHtml(paragraph)}</p>`)
    .join("");
  const action = input.action
    ? `<p style="margin:24px 0 0"><a href="${escapeHtml(input.action.href)}" style="display:inline-block;border-radius:8px;background:#18181b;color:#fff;padding:12px 18px;text-decoration:none">${escapeHtml(input.action.label)}</a></p>`
    : "";
  const preheader = input.preheader
    ? `<span style="display:none;max-height:0;overflow:hidden">${escapeHtml(input.preheader)}</span>`
    : "";

  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#18181b">${preheader}<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:auto;background:#fff;border-radius:12px"><tr><td style="padding:32px"><p style="margin:0 0 24px;font-weight:700">Amazing Skills</p><h1 style="font-size:24px;margin:0 0 20px">${escapeHtml(input.heading)}</h1>${paragraphs}${action}<p style="margin:32px 0 0;color:#71717a;font-size:12px">This message was sent by Amazing Skills.</p></td></tr></table></td></tr></table></body></html>`;
}
