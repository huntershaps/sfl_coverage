import "server-only";

/**
 * Outbound email.
 *
 * Provider-agnostic on purpose: the app only ever calls `sendMail`, so swapping
 * transports is a change in this file alone. Resend is implemented because it
 * needs nothing but `fetch` — no SMTP dependency to install or keep patched.
 *
 * With nothing configured the app still works; mail is simply skipped and
 * logged. What must never happen is a security-sensitive link (a password
 * reset) being shown in the browser because mail was not set up — see
 * `mailConfigured` and its use in the forgot-password flow.
 */

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type MailResult =
  | { ok: true }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped?: false; error: string };

/** True when a transport is configured and mail can actually leave the server. */
export function mailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && mailFrom());
}

/**
 * Whether a password-reset link may be shown in the browser rather than
 * emailed. True only on a developer machine with no mail transport — in
 * production this must always be false, or anyone who knows an address could
 * reset that account's password.
 */
export function canRevealResetLink(): boolean {
  return process.env.NODE_ENV !== "production" && !mailConfigured();
}

function mailFrom(): string | null {
  return process.env.MAIL_FROM?.trim() || null;
}

/** Absolute base URL for links in emails. */
export function appUrl(path = ""): string {
  const base =
    process.env.APP_URL?.replace(/\/+$/, "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:4310";
  return path ? `${base}${path.startsWith("/") ? path : `/${path}`}` : base;
}

export async function sendMail(mail: Mail): Promise<MailResult> {
  const from = mailFrom();
  const key = process.env.RESEND_API_KEY;

  if (!key || !from) {
    // Development convenience: show what would have been sent.
    if (process.env.NODE_ENV !== "production") {
      console.info(
        `\n[mail:skipped] to=${mail.to}\n  subject: ${mail.subject}\n  ${mail.text.replace(/\n/g, "\n  ")}\n`,
      );
    } else {
      console.warn(
        `[mail] No transport configured — dropped "${mail.subject}" to ${mail.to}. ` +
          `Set RESEND_API_KEY and MAIL_FROM.`,
      );
    }
    return { ok: false, skipped: true, reason: "no transport configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        ...(mail.html ? { html: mail.html } : {}),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[mail] send failed (${res.status}): ${detail.slice(0, 300)}`);
      return { ok: false, error: `Mail provider returned ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[mail] send threw:", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unknown mail error",
    };
  }
}

/* ------------------------------ templates -------------------------------- */

const shell = (heading: string, body: string, cta?: { href: string; label: string }) => `
<div style="font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;background:#f1f5fa;padding:32px 16px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #dfe6f0;border-radius:16px;padding:28px">
    <div style="font-size:12px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;color:#5a6b81;margin-bottom:10px">
      SFI Coverage Desk
    </div>
    <h1 style="margin:0 0 12px;font-size:21px;line-height:1.25;color:#0f172a">${heading}</h1>
    <div style="font-size:14.5px;line-height:1.6;color:#475569">${body}</div>
    ${
      cta
        ? `<a href="${cta.href}" style="display:inline-block;margin-top:20px;background:#009bd6;color:#fff;font-weight:600;font-size:14px;text-decoration:none;padding:11px 20px;border-radius:10px">${cta.label}</a>
           <p style="margin-top:16px;font-size:12px;color:#5a6b81;word-break:break-all">Or paste this into your browser:<br>${cta.href}</p>`
        : ""
    }
  </div>
</div>`;

export function passwordResetMail(to: string, token: string): Mail {
  const href = appUrl(`/reset-password?token=${token}`);
  return {
    to,
    subject: "Reset your SFI Coverage Desk password",
    text: `Someone asked to reset the password for this account.\n\nOpen this link to choose a new one (it expires in 1 hour):\n${href}\n\nIf that wasn't you, ignore this email — nothing has changed.`,
    html: shell(
      "Reset your password",
      `<p style="margin:0">Someone asked to reset the password for this account. The link below expires in one hour.</p>
       <p style="margin:12px 0 0">If that wasn't you, ignore this email — nothing has changed.</p>`,
      { href, label: "Choose a new password" },
    ),
  };
}

export function notificationMail(
  to: string,
  n: { title: string; body: string; href?: string | null },
): Mail {
  const href = n.href ? appUrl(n.href) : appUrl("/dashboard");
  return {
    to,
    subject: n.title,
    text: `${n.body}\n\n${href}`,
    html: shell(n.title, `<p style="margin:0">${escapeHtml(n.body)}</p>`, {
      href,
      label: "Open the Coverage Desk",
    }),
  };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
