const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface AuthMailer {
  sendSignupCode(message: { email: string; code: string }): Promise<void>;
  sendSignInCode(message: { email: string; code: string }): Promise<void>;
  sendPasswordCode(message: { email: string; code: string }): Promise<void>;
  sendDeletionCode(message: { email: string; code: string }): Promise<void>;
}

export function formatSignInCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

function codeEmailContent(subject: string, message: string, code: string): { subject: string; html: string; text: string } {
  const displayCode = formatSignInCode(code);
  return {
    subject,
    html: `<!doctype html><html><body style="margin:0;background:#e7ddc4;color:#171412"><div style="max-width:560px;margin:0 auto;padding:40px 24px;text-align:center;font-family:'Architects Daughter',cursive"><p style="font-size:22px;line-height:1.45">${message} It expires 10 minutes after this email was sent.</p><div style="margin:32px 0;font-family:Inter,'Arial Black',Arial,sans-serif;font-size:56px;font-weight:900;letter-spacing:0.18em;white-space:nowrap">${displayCode}</div><p style="font-size:24px">abm.jpconan.ca</p></div></body></html>`,
    text: `${message} It expires 10 minutes after this email was sent.\n\n${displayCode}\n\nabm.jpconan.ca`,
  };
}

export function signupEmailContent(code: string) { return codeEmailContent('Super ABM Account Code', 'Use this code to finish creating your Super ABM account.', code); }
export function signInEmailContent(code: string) { return codeEmailContent('Super ABM Sign In Code', 'This is your one-time Super ABM sign in code.', code); }
export function passwordEmailContent(code: string) { return codeEmailContent('Super ABM Password Code', 'Use this code to manage your Super ABM password.', code); }

export function deletionEmailContent(code: string): { subject: string; html: string; text: string } {
  const displayCode = formatSignInCode(code);
  return {
    subject: 'Super ABM Account Deletion Code',
    html: `<!doctype html><html><body style="margin:0;background:#e7ddc4;color:#171412"><div style="max-width:560px;margin:0 auto;padding:40px 24px;text-align:center;font-family:'Architects Daughter',cursive"><p style="font-size:22px;line-height:1.45">Enter this code in Super ABM to delete your account. It expires 10 minutes after this email was sent.</p><div style="margin:32px 0;font-family:Inter,'Arial Black',Arial,sans-serif;font-size:56px;font-weight:900;letter-spacing:0.18em;white-space:nowrap">${displayCode}</div><p style="font-size:18px">If you did not request this, you can ignore this email.</p></div></body></html>`,
    text: `Enter this code in Super ABM to delete your account. It expires 10 minutes after this email was sent.\n\n${displayCode}\n\nIf you did not request this, you can ignore this email.`,
  };
}

export function createResendMailer(apiKey: string, request: typeof fetch = fetch): AuthMailer {
  const send = async (email: string, content: { subject: string; html: string; text: string }, category: string) => {
    const response = await request(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: 'Super ABM <no-reply@abm.jpconan.ca>',
        to: [email],
        subject: content.subject,
        html: content.html,
        text: content.text,
        tags: [{ name: 'category', value: category }],
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error('Resend rejected the authentication email.');
  };
  return {
    async sendSignupCode({ email, code }) {
      await send(email, signupEmailContent(code), 'auth_signup');
    },
    async sendSignInCode({ email, code }) {
      await send(email, signInEmailContent(code), 'auth_signin');
    },
    async sendPasswordCode({ email, code }) {
      await send(email, passwordEmailContent(code), 'auth_password');
    },
    async sendDeletionCode({ email, code }) {
      await send(email, deletionEmailContent(code), 'account_deletion');
    },
  };
}
