import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

interface SendInvitationEmailParams {
  to: string;
  organizationName: string;
  inviterName: string;
  role: string;
  invitationUrl: string;
}

export async function sendInvitationEmail({
  to,
  organizationName,
  inviterName,
  role,
  invitationUrl,
}: SendInvitationEmailParams) {
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: [to],
      subject: `You've been invited to join ${organizationName}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Team Invitation</title>
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
              <h1 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 24px;">You've been invited!</h1>
              <p style="margin: 0 0 15px 0; font-size: 16px;">
                <strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> as a <strong>${role}</strong>.
              </p>
              <p style="margin: 0 0 15px 0; font-size: 14px; color: #666;">
                ${getRoleDescription(role)}
              </p>
              <p style="margin: 0 0 25px 0; font-size: 14px; color: #666; background-color: #f0f7ff; padding: 12px; border-radius: 6px; border-left: 3px solid #0070f3;">
                <strong>How it works:</strong> Click "Accept Invitation" below. You'll be asked to verify your email with a code sent to this address. No password needed!
              </p>
              <a href="${invitationUrl}" style="display: inline-block; background-color: #0070f3; color: white; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                Accept Invitation
              </a>
            </div>
            <div style="font-size: 12px; color: #666; border-top: 1px solid #e5e5e5; padding-top: 20px;">
              <p style="margin: 0 0 10px 0;">This invitation will expire in 7 days.</p>
              <p style="margin: 0;">If you didn't expect this invitation, you can safely ignore this email.</p>
            </div>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error('Resend error:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log('✅ Invitation email sent:', data?.id);
    return { success: true, messageId: data?.id };
  } catch (error) {
    console.error('Error sending invitation email:', error);
    throw error;
  }
}

function getRoleDescription(role: string): string {
  const descriptions: Record<string, string> = {
    admin: 'You will have full administrative access to manage the team and all content.',
    editor: 'You will be able to create and edit products and assets.',
    viewer: 'You will have view-only access with the ability to download assets.',
  };
  return descriptions[role] || 'You will have access to the organization.';
}

interface SendPasswordResetEmailParams {
  to: string;
  resetUrl: string;
}

export async function sendPasswordResetEmail({
  to,
  resetUrl,
}: SendPasswordResetEmailParams) {
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: [to],
      subject: 'Reset your password',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Password Reset</title>
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
              <h1 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 24px;">Reset your password</h1>
              <p style="margin: 0 0 15px 0; font-size: 16px;">
                We received a request to reset your password. Click the button below to create a new password.
              </p>
              <a href="${resetUrl}" style="display: inline-block; background-color: #0070f3; color: white; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                Reset Password
              </a>
            </div>
            <div style="font-size: 12px; color: #666; border-top: 1px solid #e5e5e5; padding-top: 20px;">
              <p style="margin: 0 0 10px 0;">This link will expire in 1 hour.</p>
              <p style="margin: 0;">If you didn't request a password reset, you can safely ignore this email.</p>
            </div>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error('Resend error:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log('✅ Password reset email sent:', data?.id);
    return { success: true, messageId: data?.id };
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
}
