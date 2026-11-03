import { describe, expect, test, vi } from 'vitest';
import { createResendMailer, deletionEmailContent, formatSignInCode, passwordEmailContent, signInEmailContent, signupEmailContent } from '../worker/resendMailer';

describe('Resend authentication mailer', () => {
  test('renders the fixed signup message and four-character code', () => {
    expect(formatSignInCode('ab12')).toBe('ab12');
    const content = signInEmailContent('ab12');
    expect(content.subject).toBe('Super ABM Sign In Code');
    expect(content.text).toContain('expires 10 minutes after this email was sent');
    expect(content.text).toContain('ab12');
    expect(content.html).toContain("font-family:'Architects Daughter',cursive");
    expect(content.html).toContain("font-family:Inter,'Arial Black',Arial,sans-serif");
  });

  test('keeps signup, sign-in, and password messages distinct', () => {
    expect(signupEmailContent('ab12').subject).toContain('Account Code');
    expect(signInEmailContent('ab12').subject).toContain('Sign In');
    expect(passwordEmailContent('ab12').subject).toContain('Password');
  });

  test('renders and sends account deletion codes separately from signup mail', async () => {
    expect(deletionEmailContent('ab12').text).toContain('delete your account');
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'mail-2' }), { status: 200 }));
    await createResendMailer('secret-key', request).sendDeletionCode({ email: 'player@example.com', code: 'ab12' });
    const body = JSON.parse(String((request.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body).toMatchObject({ subject: 'Super ABM Account Deletion Code', tags: [{ name: 'category', value: 'account_deletion' }] });
    expect(body.text).toContain('ab12');
  });

  test('sends through Resend without reply-to or tracking fields', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'mail-1' }), { status: 200 }));
    await createResendMailer('secret-key', request).sendSignInCode({ email: 'player@example.com', code: '9z8x' });
    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers).toEqual({ authorization: 'Bearer secret-key', 'content-type': 'application/json' });
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      from: 'Super ABM <no-reply@abm.jpconan.ca>', to: ['player@example.com'], subject: 'Super ABM Sign In Code',
    });
    expect(body.html).toContain('9z8x');
    expect(body).not.toHaveProperty('reply_to');
    expect(body).not.toHaveProperty('click_tracking');
    expect(body).not.toHaveProperty('open_tracking');
  });

  test('rejects failed provider responses without exposing their body', async () => {
    const request = vi.fn().mockResolvedValue(new Response('provider secret detail', { status: 422 }));
    await expect(createResendMailer('secret-key', request).sendSignInCode({ email: 'player@example.com', code: 'ab12' }))
      .rejects.toThrow('Resend rejected the authentication email.');
  });
});
