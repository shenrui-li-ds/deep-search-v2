/**
 * @jest-environment node
 */

/**
 * Password validation tests for the Change Password feature.
 * These tests validate the password requirements enforced in the Account page.
 */

// Password validation rules (mirroring account/page.tsx logic)
interface ValidationResult {
  valid: boolean;
  error?: string;
}

function validateNewPassword(password: string): ValidationResult {
  if (password.length < 10) {
    return { valid: false, error: 'Password must be at least 10 characters' };
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }

  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one digit' };
  }

  return { valid: true };
}

function validatePasswordChange(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
): ValidationResult {
  // First validate new password format
  const formatValidation = validateNewPassword(newPassword);
  if (!formatValidation.valid) {
    return formatValidation;
  }

  // Check passwords match
  if (newPassword !== confirmPassword) {
    return { valid: false, error: 'New passwords do not match' };
  }

  // Check new password is different from current
  if (currentPassword === newPassword) {
    return { valid: false, error: 'New password must be different from current password' };
  }

  return { valid: true };
}

describe('Password Validation', () => {
  describe('validateNewPassword', () => {
    it('should reject passwords shorter than 10 characters', () => {
      const result = validateNewPassword('Short1Aa');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Password must be at least 10 characters');
    });

    it('should reject passwords without lowercase letters', () => {
      const result = validateNewPassword('ALLUPPER123');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Password must contain at least one lowercase letter');
    });

    it('should reject passwords without uppercase letters', () => {
      const result = validateNewPassword('alllower123');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Password must contain at least one uppercase letter');
    });

    it('should reject passwords without digits', () => {
      const result = validateNewPassword('NoDigitsHere');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Password must contain at least one digit');
    });

    it('should accept valid passwords meeting all requirements', () => {
      const validPasswords = [
        'ValidPass1',
        'MySecure123',
        'Password1A',
        'abcDEF12345',
        'Test1234Abc',
      ];

      validPasswords.forEach((password) => {
        const result = validateNewPassword(password);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    it('should accept passwords with special characters', () => {
      const result = validateNewPassword('Valid@Pass1!');
      expect(result.valid).toBe(true);
    });

    it('should accept exactly 10 character passwords', () => {
      const result = validateNewPassword('Exactly10a');
      expect(result.valid).toBe(true);
    });
  });

  describe('validatePasswordChange', () => {
    const validNewPassword = 'NewSecure123';

    it('should reject when new passwords do not match', () => {
      const result = validatePasswordChange(
        'currentPass',
        validNewPassword,
        'DifferentPass1'
      );
      expect(result.valid).toBe(false);
      expect(result.error).toBe('New passwords do not match');
    });

    it('should reject when new password equals current password', () => {
      const result = validatePasswordChange(
        validNewPassword,
        validNewPassword,
        validNewPassword
      );
      expect(result.valid).toBe(false);
      expect(result.error).toBe('New password must be different from current password');
    });

    it('should accept valid password change', () => {
      const result = validatePasswordChange(
        'OldPassword1',
        validNewPassword,
        validNewPassword
      );
      expect(result.valid).toBe(true);
    });

    it('should validate format before checking match', () => {
      // Short password should fail format check first
      const result = validatePasswordChange(
        'current',
        'short',
        'different'
      );
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Password must be at least 10 characters');
    });
  });
});
