# Supabase Email Templates

Custom email templates for Athenius authentication flows.

## Setup

Copy the HTML content from each file into Supabase Dashboard:
**Authentication → Email Templates → [Template Name]**

## Templates

| Template | File | Subject Line |
|----------|------|--------------|
| Confirm signup | `confirm-signup.html` | Welcome to Athenius! Please confirm your email |
| Invite user | `invite-user.html` | You've been invited to join Athenius! |
| Magic Link | `magic-link.html` | Your magic link to sign in to Athenius |
| Change Email Address | `change-email.html` | Almost there! Confirm your new email address |
| Reset Password | `reset-password.html` | Let's get you back into Athenius |
| Reauthentication | `reauthentication.html` | Quick security check for Athenius |

## Available Variables

These variables are replaced by Supabase when sending emails:

| Variable | Description |
|----------|-------------|
| `{{ .ConfirmationURL }}` | The action link (confirm, reset, etc.) |
| `{{ .Email }}` | User's email address |
| `{{ .Token }}` | Raw confirmation token |
| `{{ .TokenHash }}` | Hashed token |
| `{{ .SiteURL }}` | Your configured site URL |

## Brand Colors

- Primary accent: `#20b8cd` (teal)
- Text primary: `#111827`
- Text secondary: `#374151`
- Text muted: `#6b7280`
- Background card: `#f9fafb`
- Border: `#e5e7eb`

## Customization

All templates use:
- Consistent styling matching the Athenius brand
- Mobile-responsive design (max-width: 480px)
- "Yours hootly" sign-off (owl theme)
- Clear call-to-action buttons
- Fallback link text for email clients that block buttons
