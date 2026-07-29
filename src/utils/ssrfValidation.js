const dns = require('dns').promises;
const { URL } = require('url');
const { domainToASCII } = require('url');

// ─── Configuration ─────────────────────────────────────────────────────────────

const ALLOWED_HOST_SUFFIXES = new Set(['supabase.co', 'supabase.in']);

// Private IPv4 ranges to block
const PRIVATE_IPV4_RANGES = [
  { start: '127.0.0.0', prefix: 8 },   // Loopback
  { start: '10.0.0.0', prefix: 8 },    // Private Class A
  { start: '172.16.0.0', prefix: 12 }, // Private Class B
  { start: '192.168.0.0', prefix: 16 }, // Private Class C
  { start: '169.254.0.0', prefix: 16 }, // Link-local
];

// Private IPv6 ranges to block
const PRIVATE_IPV6_RANGES = [
  { start: '::1', prefix: 128 },        // Loopback
  { start: 'fc00::', prefix: 7 },       // Unique local
  { start: 'fe80::', prefix: 10 },      // Link-local
];

// ─── Error Classes ─────────────────────────────────────────────────────────────

class SSRFValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SSRFValidationError';
  }
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Normalize hostname for allowlist checking
 * Prevents bypass through trailing dots, mixed case, or IDN homograph attacks
 */
function normalizeHostname(hostname) {
  if (typeof hostname !== 'string') return null;

  const trimmed = hostname.trim().toLowerCase().replace(/\.+$/, '');
  if (!trimmed) return null;

  const ascii = domainToASCII(trimmed);
  if (!ascii) return null;

  return ascii.toLowerCase().replace(/\.+$/, '');
}

/**
 * Check if hostname matches allowed suffixes
 * Uses strict label-by-label comparison to prevent bypass
 */
function isHostnameAllowed(hostname) {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return false;

  const labels = normalized.split('.');
  
  for (const suffix of ALLOWED_HOST_SUFFIXES) {
    const suffixLabels = suffix.split('.');
    if (labels.length < suffixLabels.length + 1) continue;
    
    const hostnameSuffix = labels.slice(-suffixLabels.length).join('.');
    if (hostnameSuffix === suffix) {
      return true;
    }
  }
  
  return false;
}

/**
 * Convert IPv4 address to integer for range comparison
 */
function ipv4ToInt(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) {
    return null;
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/**
 * Check if IPv4 address is in a CIDR range
 */
function isIPv4InRange(ip, rangeStart, prefix) {
  const ipInt = ipv4ToInt(ip);
  const startInt = ipv4ToInt(rangeStart);
  
  if (ipInt === null || startInt === null) return false;
  
  const mask = (0xFFFFFFFF << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (startInt & mask);
}

/**
 * Check if IPv4 address is in any private range
 */
function isPrivateIPv4(ip) {
  return PRIVATE_IPV4_RANGES.some(range => 
    isIPv4InRange(ip, range.start, range.prefix)
  );
}

/**
 * Parse IPv6 address to byte array
 */
function ipv6ToBytes(ip) {
  // Handle :: notation (compressed zeros)
  if (ip === '::') {
    return new Uint8Array(16).fill(0);
  }
  
  // Split by : and handle :: expansion
  const parts = ip.split(':');
  const expanded = [];
  
  // Find the :: (empty string in parts)
  const doubleColonIndex = parts.indexOf('');
  
  if (doubleColonIndex !== -1) {
    // Count non-empty parts before and after ::
    const before = parts.slice(0, doubleColonIndex).filter(p => p !== '');
    const after = parts.slice(doubleColonIndex + 1).filter(p => p !== '');
    const missing = 8 - (before.length + after.length);
    
    // Add parts before ::
    expanded.push(...before);
    
    // Add missing zeros
    for (let i = 0; i < missing; i++) {
      expanded.push('0');
    }
    
    // Add parts after ::
    expanded.push(...after);
  } else {
    // No ::, just use the parts as-is
    for (let i = 0; i < parts.length; i++) {
      expanded.push(parts[i] || '0');
    }
  }
  
  if (expanded.length !== 8) return null;
  
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    const value = parseInt(expanded[i], 16);
    if (isNaN(value)) return null;
    bytes[i * 2] = (value >> 8) & 0xFF;
    bytes[i * 2 + 1] = value & 0xFF;
  }
  
  return bytes;
}

/**
 * Check if IPv6 address is in a CIDR range
 */
function isIPv6InRange(ip, rangeStart, prefix) {
  const ipBytes = ipv6ToBytes(ip);
  const startBytes = ipv6ToBytes(rangeStart);
  
  if (!ipBytes || !startBytes) {
    return false;
  }
  
  const fullBytes = Math.floor(prefix / 8);
  const remainingBits = prefix % 8;
  
  for (let i = 0; i < fullBytes; i++) {
    if (ipBytes[i] !== startBytes[i]) return false;
  }
  
  if (remainingBits > 0) {
    const mask = (0xFF << (8 - remainingBits)) & 0xFF;
    if ((ipBytes[fullBytes] & mask) !== (startBytes[fullBytes] & mask)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Check if IPv6 address is in any private range
 */
function isPrivateIPv6(ip) {
  return PRIVATE_IPV6_RANGES.some(range => 
    isIPv6InRange(ip, range.start, range.prefix)
  );
}

/**
 * Check if IP address is private/internal
 */
function isPrivateIP(ip) {
  if (ip.includes(':')) {
    return isPrivateIPv6(ip);
  }
  return isPrivateIPv4(ip);
}

/**
 * Resolve hostname to IP addresses using DNS
 * Returns both A (IPv4) and AAAA (IPv6) records
 */
async function resolveHostname(hostname) {
  try {
    const [aRecords, aaaaRecords] = await Promise.allSettled([
      dns.resolve4(hostname),
      dns.resolve6(hostname).catch(() => []), // AAAA may not exist
    ]);
    
    const ips = [];
    
    if (aRecords.status === 'fulfilled') {
      ips.push(...aRecords.value);
    }
    
    if (aaaaRecords.status === 'fulfilled') {
      ips.push(...aaaaRecords.value);
    }
    
    return ips;
  } catch (err) {
    throw new SSRFValidationError('DNS resolution failed');
  }
}

/**
 * Validate that all resolved IPs are not private/internal
 */
function validateResolvedIPs(ips) {
  for (const ip of ips) {
    if (isPrivateIP(ip)) {
      throw new SSRFValidationError('Private IP addresses are not allowed');
    }
  }
  return true;
}

// ─── Main Validation Functions ─────────────────────────────────────────────────

/**
 * Validate URL for SSRF protection
 * Checks protocol, hostname, and resolves DNS to validate IP addresses
 * 
 * @param {string} urlString - The URL to validate
 * @returns {Promise<{url: URL, hostname: string, ips: string[]}>}
 * @throws {SSRFValidationError}
 */
async function validateURLForSSRF(urlString) {
  // Parse URL
  let url;
  try {
    url = new URL(urlString.trim());
  } catch (err) {
    throw new SSRFValidationError('Invalid URL format');
  }
  
  // Validate protocol - HTTPS only
  if (url.protocol !== 'https:') {
    throw new SSRFValidationError('Only HTTPS URLs are allowed');
  }
  
  // Validate hostname against allowlist
  const hostname = url.hostname;
  if (!isHostnameAllowed(hostname)) {
    throw new SSRFValidationError('URL host is not allowed');
  }
  
  // Resolve DNS and validate IPs
  const ips = await resolveHostname(hostname);
  if (ips.length === 0) {
    throw new SSRFValidationError('DNS resolution returned no addresses');
  }
  
  validateResolvedIPs(ips);
  
  return { url, hostname, ips };
}

/**
 * Validate redirect target for SSRF protection
 * Used when following HTTP redirects to ensure redirect destinations are safe
 * 
 * @param {string} redirectUrl - The redirect URL to validate
 * @returns {Promise<{url: URL, hostname: string, ips: string[]}>}
 * @throws {SSRFValidationError}
 */
async function validateRedirectForSSRF(redirectUrl) {
  // Redirects must use the same validation as initial URLs
  return validateURLForSSRF(redirectUrl);
}

/**
 * Create axios config with SSRF-safe redirect handling
 * Disables automatic redirects and provides manual redirect validation
 */
function createSSRFSafeAxiosConfig(baseConfig = {}) {
  return {
    ...baseConfig,
    maxRedirects: 0, // Disable automatic redirects
    validateStatus: (status) => status < 400, // Accept all non-error statuses
  };
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  validateURLForSSRF,
  validateRedirectForSSRF,
  createSSRFSafeAxiosConfig,
  isHostnameAllowed,
  isPrivateIP,
  SSRFValidationError,
  ALLOWED_HOST_SUFFIXES,
  PRIVATE_IPV4_RANGES,
  PRIVATE_IPV6_RANGES,
};
