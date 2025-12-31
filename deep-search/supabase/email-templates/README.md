# Supabase Email Templates

Custom email templates for Athenius authentication flows.

## Setup

### 1. Configure Resend (Recommended)

Supabase's default email has strict rate limits. Use [Resend](https://resend.com) for reliable delivery:

1. Create account at [resend.com](https://resend.com)
2. Get API key from Resend Dashboard → API Keys
3. In Supabase → Project Settings → Authentication → SMTP Settings:
   - Enable "Custom SMTP"
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: `<your-resend-api-key>`
   - Sender email: `noreply@yourdomain.com`
   - Sender name: `Athenius`

### 2. Apply Email Templates

Copy the HTML content from each file into Supabase Dashboard:
**Authentication → Email Templates → [Template Name]**

## Templates

### Action Templates (require user action)

| Template | File | Subject Line |
|----------|------|--------------|
| Confirm signup | `confirm-signup.html` | Welcome to Athenius! Please confirm your email |
| Invite user | `invite-user.html` | You've been invited to join Athenius! |
| Magic Link | `magic-link.html` | Your magic link to sign in to Athenius |
| Change Email Address | `change-email.html` | Almost there! Confirm your new email address |
| Reset Password | `reset-password.html` | Let's get you back into Athenius |
| Reauthentication | `reauthentication.html` | Quick security check for Athenius |

### Notification Templates (security alerts)

| Template | File | Subject Line |
|----------|------|--------------|
| Password Changed | `password-changed.html` | Your Athenius password has been changed |
| Email Changed | `email-changed.html` | Your Athenius email address has been changed |
| MFA Enrolled | `mfa-enrolled.html` | New security method added to your Athenius account |
| MFA Unenrolled | `mfa-unenrolled.html` | Security method removed from your Athenius account |

## Available Variables

These variables are replaced by Supabase when sending emails:

| Variable | Description |
|----------|-------------|
| `{{ .ConfirmationURL }}` | The action link (confirm, reset, etc.) |
| `{{ .Email }}` | User's email address |
| `{{ .OldEmail }}` | User's previous email (for email change notifications) |
| `{{ .Token }}` | Raw confirmation token |
| `{{ .TokenHash }}` | Hashed token |
| `{{ .SiteURL }}` | Your configured site URL |
| `{{ .FactorType }}` | MFA factor type (e.g., "totp", "phone") |

## Brand Colors

- Primary accent: `#20b8cd` (teal)
- Text primary: `#111827`
- Text secondary: `#374151`
- Text muted: `#6b7280`
- Background card: `#f9fafb`
- Border: `#e5e7eb`

### Alert Colors (for notification templates)

- Warning background: `#fef3c7` (amber-100)
- Warning text: `#92400e` (amber-800)
- Success background: `#d1fae5` (green-100)
- Success text: `#065f46` (green-800)
- Danger background: `#fee2e2` (red-100)
- Danger text: `#991b1b` (red-800)

## Customization

All templates use:
- Consistent styling matching the Athenius brand
- Mobile-responsive design (max-width: 480px)
- "Yours hootly" sign-off (owl theme)
- Clear call-to-action buttons
- Fallback link text for email clients that block buttons
