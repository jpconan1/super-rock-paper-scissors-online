const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface AuthMailer {
  sendSignInCode(message: { email: string; code: string }): Promise<void>;
}

export function formatSignInCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

export function signInEmailContent(code: string): { subject: string; html: string; text: string } {
  const displayCode = formatSignInCode(code);
  return {
    subject: 'Super ABM Sign In Code',
    html: `<!doctype html><html><body style="margin:0;background:#e7ddc4;color:#171412"><div style="max-width:560px;margin:0 auto;padding:40px 24px;text-align:center;font-family:'Architects Daughter',cursive"><p style="font-size:22px;line-height:1.45">This is your one-time Super ABM sign in code. It expires 10 minutes after this email was sent.</p><div style="margin:32px 0;font-family:Inter,'Arial Black',Arial,sans-serif;font-size:56px;font-weight:900;letter-spacing:0.18em;white-space:nowrap">${displayCode}</div><p style="font-size:24px">Sign in @ abm.jpconan.ca!</p></div></body></html>`,
    text: `This is your one-time Super ABM sign in code. It expires 10 minutes after this email was sent.\n\n${displayCode}\n\nSign in @ abm.jpconan.ca!`,
  };
}

export function createResendMailer(apiKey: string, request: typeof fetch = fetch): AuthMailer {
  return {
    async sendSignInCode({ email, code }) {
      const content = signInEmailContent(code);
      const response = await request(RESEND_ENDPOINT, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: 'Super ABM <no-reply@abm.jpconan.ca>',
          to: [email],
          subject: content.subject,
          html: content.html,
          text: content.text,
          tags: [{ name: 'category', value: 'auth_signup' }],
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error('Resend rejected the authentication email.');
    },
  };
}
