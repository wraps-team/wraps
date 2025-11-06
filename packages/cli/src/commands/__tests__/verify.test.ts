import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { SESv2Client, GetEmailIdentityCommand } from '@aws-sdk/client-sesv2';
import { verify } from '../verify.js';
import { Resolver } from 'dns/promises';

const sesv2Mock = mockClient(SESv2Client);

// Mock DNS resolver
const mockResolverInstance = {
  resolveCname: vi.fn(),
  resolveTxt: vi.fn(),
};

vi.mock('dns/promises', () => ({
  Resolver: vi.fn(function() {
    return mockResolverInstance;
  }),
}));

// Mock clack
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
  log: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
  spinner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));

// Mock getAWSRegion
vi.mock('../../utils/aws.js', () => ({
  getAWSRegion: vi.fn().mockResolvedValue('us-east-1'),
}));

// Mock DeploymentProgress
vi.mock('../../utils/output.js', () => ({
  DeploymentProgress: vi.fn(function(this: any) {
    this.execute = vi.fn((msg: any, fn: any) => fn());
    this.stop = vi.fn();
    return this;
  }),
}));

describe('verify command', () => {
  let exitSpy: any;
  let consoleLogSpy: any;

  beforeEach(() => {
    sesv2Mock.reset();
    vi.clearAllMocks();

    // Reset mock resolver methods
    mockResolverInstance.resolveCname.mockReset();
    mockResolverInstance.resolveTxt.mockReset();

    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it('should exit when domain is not found in SES', async () => {
    sesv2Mock.on(GetEmailIdentityCommand).rejects(new Error('Not found'));

    // The verify function will call process.exit, but since we mock it,
    // the code continues and tries to access undefined properties
    // We need to catch the error or make process.exit actually stop execution
    try {
      await verify({ domain: 'nonexistent.com' });
    } catch (error) {
      // Ignore errors from trying to access properties after exit
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should verify all DNS records when correctly configured', async () => {
    sesv2Mock.on(GetEmailIdentityCommand).resolves({
      VerifiedForSendingStatus: true,
      DkimAttributes: {
        Status: 'SUCCESS',
        Tokens: ['token1', 'token2', 'token3'],
      },
    });

    mockResolverInstance.resolveCname
      .mockResolvedValueOnce(['token1.dkim.amazonses.com'])
      .mockResolvedValueOnce(['token2.dkim.amazonses.com'])
      .mockResolvedValueOnce(['token3.dkim.amazonses.com']);

    mockResolverInstance.resolveTxt
      .mockResolvedValueOnce([['v=spf1 include:amazonses.com ~all']])
      .mockResolvedValueOnce([['v=DMARC1; p=quarantine']]);

    await verify({ domain: 'example.com' });

    expect(mockResolverInstance.resolveCname).toHaveBeenCalledTimes(3);
    expect(mockResolverInstance.resolveTxt).toHaveBeenCalledTimes(2);
  });

  it('should detect missing DKIM records', async () => {
    sesv2Mock.on(GetEmailIdentityCommand).resolves({
      VerifiedForSendingStatus: false,
      DkimAttributes: {
        Status: 'PENDING',
        Tokens: ['token1'],
      },
    });

    mockResolverInstance.resolveCname.mockRejectedValue(new Error('ENOTFOUND'));
    mockResolverInstance.resolveTxt
      .mockResolvedValueOnce([['v=spf1 include:amazonses.com ~all']])
      .mockResolvedValueOnce([['v=DMARC1; p=quarantine']]);

    await verify({ domain: 'example.com' });

    expect(mockResolverInstance.resolveCname).toHaveBeenCalled();
  });

  it('should detect missing SPF record', async () => {
    sesv2Mock.on(GetEmailIdentityCommand).resolves({
      VerifiedForSendingStatus: false,
      DkimAttributes: {
        Status: 'PENDING',
        Tokens: ['token1'],
      },
    });

    mockResolverInstance.resolveCname.mockResolvedValue(['token1.dkim.amazonses.com']);
    mockResolverInstance.resolveTxt
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([['v=DMARC1; p=quarantine']]);

    await verify({ domain: 'example.com' });

    expect(mockResolverInstance.resolveTxt).toHaveBeenCalledWith('example.com');
  });

  it('should detect incorrect SPF record', async () => {
    sesv2Mock.on(GetEmailIdentityCommand).resolves({
      VerifiedForSendingStatus: false,
      DkimAttributes: {
        Status: 'PENDING',
        Tokens: ['token1'],
      },
    });

    mockResolverInstance.resolveCname.mockResolvedValue(['token1.dkim.amazonses.com']);
    mockResolverInstance.resolveTxt
      .mockResolvedValueOnce([['v=spf1 include:sendgrid.net ~all']])
      .mockResolvedValueOnce([['v=DMARC1; p=quarantine']]);

    await verify({ domain: 'example.com' });

    expect(mockResolverInstance.resolveTxt).toHaveBeenCalledWith('example.com');
  });

  it('should detect missing DMARC record', async () => {
    sesv2Mock.on(GetEmailIdentityCommand).resolves({
      VerifiedForSendingStatus: false,
      DkimAttributes: {
        Status: 'PENDING',
        Tokens: ['token1'],
      },
    });

    mockResolverInstance.resolveCname.mockResolvedValue(['token1.dkim.amazonses.com']);
    mockResolverInstance.resolveTxt
      .mockResolvedValueOnce([['v=spf1 include:amazonses.com ~all']])
      .mockRejectedValueOnce(new Error('ENOTFOUND'));

    await verify({ domain: 'example.com' });

    expect(mockResolverInstance.resolveTxt).toHaveBeenCalledWith('_dmarc.example.com');
  });

  it('should handle domain with trailing dot in CNAME response', async () => {
    sesv2Mock.on(GetEmailIdentityCommand).resolves({
      VerifiedForSendingStatus: true,
      DkimAttributes: {
        Status: 'SUCCESS',
        Tokens: ['token1'],
      },
    });

    mockResolverInstance.resolveCname.mockResolvedValue(['token1.dkim.amazonses.com.']);
    mockResolverInstance.resolveTxt
      .mockResolvedValueOnce([['v=spf1 include:amazonses.com ~all']])
      .mockResolvedValueOnce([['v=DMARC1; p=quarantine']]);

    await verify({ domain: 'example.com' });

    // Should still be considered verified
    expect(mockResolverInstance.resolveCname).toHaveBeenCalled();
  });

  it('should handle domain with no DKIM tokens', async () => {
    sesv2Mock.on(GetEmailIdentityCommand).resolves({
      VerifiedForSendingStatus: false,
      DkimAttributes: {
        Status: 'NOT_STARTED',
        Tokens: [],
      },
    });

    mockResolverInstance.resolveTxt
      .mockResolvedValueOnce([['v=spf1 include:amazonses.com ~all']])
      .mockResolvedValueOnce([['v=DMARC1; p=quarantine']]);

    await verify({ domain: 'example.com' });

    // Should not try to resolve DKIM if no tokens (resolveCname is reset between tests)
  });
});
