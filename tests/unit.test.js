// tests/base62.test.js
const { encode, decode, generateShortId, isValidShortId, BASE } = require('../src/utils/base62');

describe('Base62 Encoding', () => {
  describe('encode', () => {
    it('should encode 0 to "0"', () => {
      expect(encode(0)).toBe('0');
    });

    it('should encode positive integers', () => {
      expect(encode(62)).toBe('10');      // 1*62 + 0 = 62
      expect(encode(3843)).toBe('zz');    // 61*62 + 61 = 3843 (charset: 0-9, A-Z, a-z → index 61 = 'z')
    });

    it('should be reversible with decode', () => {
      [1, 100, 999, 123456, 9999999].forEach((num) => {
        expect(decode(encode(num))).toBe(num);
      });
    });
  });

  describe('generateShortId', () => {
    it('should generate an ID of the default length (7)', () => {
      const id = generateShortId();
      expect(id).toHaveLength(7);
    });

    it('should generate IDs of custom length', () => {
      expect(generateShortId(4)).toHaveLength(4);
      expect(generateShortId(10)).toHaveLength(10);
    });

    it('should only contain Base62 characters', () => {
      for (let i = 0; i < 100; i++) {
        expect(generateShortId()).toMatch(/^[0-9A-Za-z]+$/);
      }
    });

    it('should generate unique IDs', () => {
      const ids = new Set(Array.from({ length: 1000 }, () => generateShortId()));
      expect(ids.size).toBe(1000);
    });
  });

  describe('isValidShortId', () => {
    it('should accept valid Base62 IDs', () => {
      expect(isValidShortId('abc1234')).toBe(true);
      expect(isValidShortId('ABCDEFG')).toBe(true);
      expect(isValidShortId('aB3xY7z')).toBe(true);
    });

    it('should reject IDs that are too short or too long', () => {
      expect(isValidShortId('ab')).toBe(false);
      expect(isValidShortId('a'.repeat(13))).toBe(false);
    });

    it('should reject IDs with invalid characters', () => {
      expect(isValidShortId('abc-def')).toBe(false);
      expect(isValidShortId('abc def')).toBe(false);
      expect(isValidShortId('abc!@#')).toBe(false);
    });

    it('should reject null/undefined/empty', () => {
      expect(isValidShortId(null)).toBe(false);
      expect(isValidShortId(undefined)).toBe(false);
      expect(isValidShortId('')).toBe(false);
    });
  });
});

// tests/urlValidator.test.js
const { validateUrl, hashUrl } = require('../src/utils/urlValidator');

describe('URL Validation', () => {
  describe('validateUrl', () => {
    it('should accept valid URLs', () => {
      const { valid, url } = validateUrl('https://www.google.com');
      expect(valid).toBe(true);
      expect(url).toBe('https://www.google.com');
    });

    it('should auto-prepend https:// to bare URLs', () => {
      const { valid, url } = validateUrl('www.example.com');
      expect(valid).toBe(true);
      expect(url).toBe('https://www.example.com');
    });

    it('should reject empty or null input', () => {
      expect(validateUrl('').valid).toBe(false);
      expect(validateUrl(null).valid).toBe(false);
      expect(validateUrl(undefined).valid).toBe(false);
    });

    it('should reject URLs without TLD', () => {
      expect(validateUrl('https://localhost').valid).toBe(false);
    });

    it('should reject private IP addresses (SSRF protection)', () => {
      expect(validateUrl('http://127.0.0.1').valid).toBe(false);
      expect(validateUrl('http://192.168.1.1').valid).toBe(false);
      expect(validateUrl('http://10.0.0.1').valid).toBe(false);
    });

    it('should reject URLs exceeding max length', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(2048);
      expect(validateUrl(longUrl).valid).toBe(false);
    });
  });

  describe('hashUrl', () => {
    it('should return a consistent 16-char hex hash', () => {
      const hash = hashUrl('https://www.google.com');
      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('should return the same hash for the same URL', () => {
      expect(hashUrl('https://example.com')).toBe(hashUrl('https://example.com'));
    });

    it('should return different hashes for different URLs', () => {
      expect(hashUrl('https://example.com')).not.toBe(hashUrl('https://example.org'));
    });
  });
});
