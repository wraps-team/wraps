import { describe, it, expect, beforeEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  Route53Client,
  ListHostedZonesByNameCommand,
  ChangeResourceRecordSetsCommand,
} from '@aws-sdk/client-route-53';
import { findHostedZone, createDNSRecords } from '../route53.js';

const route53Mock = mockClient(Route53Client);

describe('findHostedZone', () => {
  beforeEach(() => {
    route53Mock.reset();
  });

  it('should return hosted zone when found', async () => {
    route53Mock.on(ListHostedZonesByNameCommand).resolves({
      HostedZones: [
        {
          Id: '/hostedzone/Z1234567890ABC',
          Name: 'example.com.',
          CallerReference: 'ref-1',
        },
      ],
    });

    const result = await findHostedZone('example.com', 'us-east-1');

    expect(result).toEqual({
      id: 'Z1234567890ABC',
      name: 'example.com.',
    });
  });

  it('should strip /hostedzone/ prefix from zone ID', async () => {
    route53Mock.on(ListHostedZonesByNameCommand).resolves({
      HostedZones: [
        {
          Id: '/hostedzone/Z999',
          Name: 'test.com.',
          CallerReference: 'ref-1',
        },
      ],
    });

    const result = await findHostedZone('test.com', 'us-east-1');

    expect(result?.id).toBe('Z999');
  });

  it('should return null when no hosted zones found', async () => {
    route53Mock.on(ListHostedZonesByNameCommand).resolves({
      HostedZones: [],
    });

    const result = await findHostedZone('example.com', 'us-east-1');

    expect(result).toBeNull();
  });

  it('should return null when zone name does not match exactly', async () => {
    route53Mock.on(ListHostedZonesByNameCommand).resolves({
      HostedZones: [
        {
          Id: '/hostedzone/Z1234567890ABC',
          Name: 'different.com.',
          CallerReference: 'ref-1',
        },
      ],
    });

    const result = await findHostedZone('example.com', 'us-east-1');

    expect(result).toBeNull();
  });

  it('should return null on API error', async () => {
    route53Mock.on(ListHostedZonesByNameCommand).rejects(new Error('Access denied'));

    const result = await findHostedZone('example.com', 'us-east-1');

    expect(result).toBeNull();
  });

  it('should handle zone names with trailing dot', async () => {
    route53Mock.on(ListHostedZonesByNameCommand).resolves({
      HostedZones: [
        {
          Id: '/hostedzone/Z123',
          Name: 'example.com.',
          CallerReference: 'ref-1',
        },
      ],
    });

    // Function expects domain without trailing dot
    const result = await findHostedZone('example.com', 'us-east-1');

    expect(result).not.toBeNull();
    expect(result?.name).toBe('example.com.');
  });

  it('should query Route53 with correct parameters', async () => {
    route53Mock.on(ListHostedZonesByNameCommand).resolves({
      HostedZones: [],
    });

    await findHostedZone('test.com', 'us-east-1');

    expect(route53Mock.commandCalls(ListHostedZonesByNameCommand)).toHaveLength(1);
    expect(route53Mock.commandCalls(ListHostedZonesByNameCommand)[0].args[0].input).toEqual({
      DNSName: 'test.com',
      MaxItems: 1,
    });
  });
});

describe('createDNSRecords', () => {
  beforeEach(() => {
    route53Mock.reset();
  });

  it('should create DKIM, SPF, and DMARC records', async () => {
    route53Mock.on(ChangeResourceRecordSetsCommand).resolves({
      ChangeInfo: {
        Id: 'change-1',
        Status: 'PENDING',
        SubmittedAt: new Date(),
      },
    });

    await createDNSRecords('Z123', 'example.com', ['token1', 'token2', 'token3'], 'us-east-1');

    expect(route53Mock.commandCalls(ChangeResourceRecordSetsCommand)).toHaveLength(1);

    const call = route53Mock.commandCalls(ChangeResourceRecordSetsCommand)[0];
    const changes = call.args[0].input.ChangeBatch?.Changes;

    expect(changes).toBeDefined();
    expect(changes).toHaveLength(5); // 3 DKIM + 1 SPF + 1 DMARC
  });

  it('should create correct DKIM CNAME records', async () => {
    route53Mock.on(ChangeResourceRecordSetsCommand).resolves({
      ChangeInfo: {
        Id: 'change-1',
        Status: 'PENDING',
        SubmittedAt: new Date(),
      },
    });

    await createDNSRecords('Z123', 'example.com', ['abc', 'def'], 'us-east-1');

    const call = route53Mock.commandCalls(ChangeResourceRecordSetsCommand)[0];
    const changes = call.args[0].input.ChangeBatch?.Changes;

    const dkimRecords = changes?.filter((c) => c.ResourceRecordSet?.Type === 'CNAME');
    expect(dkimRecords).toHaveLength(2);

    expect(dkimRecords?.[0].ResourceRecordSet?.Name).toBe('abc._domainkey.example.com');
    expect(dkimRecords?.[0].ResourceRecordSet?.ResourceRecords?.[0].Value).toBe(
      'abc.dkim.amazonses.com'
    );

    expect(dkimRecords?.[1].ResourceRecordSet?.Name).toBe('def._domainkey.example.com');
    expect(dkimRecords?.[1].ResourceRecordSet?.ResourceRecords?.[0].Value).toBe(
      'def.dkim.amazonses.com'
    );
  });

  it('should create correct SPF TXT record', async () => {
    route53Mock.on(ChangeResourceRecordSetsCommand).resolves({
      ChangeInfo: {
        Id: 'change-1',
        Status: 'PENDING',
        SubmittedAt: new Date(),
      },
    });

    await createDNSRecords('Z123', 'example.com', ['token1'], 'us-east-1');

    const call = route53Mock.commandCalls(ChangeResourceRecordSetsCommand)[0];
    const changes = call.args[0].input.ChangeBatch?.Changes;

    const spfRecord = changes?.find(
      (c) =>
        c.ResourceRecordSet?.Type === 'TXT' && c.ResourceRecordSet?.Name === 'example.com'
    );

    expect(spfRecord).toBeDefined();
    expect(spfRecord?.ResourceRecordSet?.ResourceRecords?.[0].Value).toBe(
      '"v=spf1 include:amazonses.com ~all"'
    );
    expect(spfRecord?.ResourceRecordSet?.TTL).toBe(1800);
  });

  it('should create correct DMARC TXT record', async () => {
    route53Mock.on(ChangeResourceRecordSetsCommand).resolves({
      ChangeInfo: {
        Id: 'change-1',
        Status: 'PENDING',
        SubmittedAt: new Date(),
      },
    });

    await createDNSRecords('Z123', 'example.com', ['token1'], 'us-east-1');

    const call = route53Mock.commandCalls(ChangeResourceRecordSetsCommand)[0];
    const changes = call.args[0].input.ChangeBatch?.Changes;

    const dmarcRecord = changes?.find(
      (c) =>
        c.ResourceRecordSet?.Type === 'TXT' &&
        c.ResourceRecordSet?.Name === '_dmarc.example.com'
    );

    expect(dmarcRecord).toBeDefined();
    expect(dmarcRecord?.ResourceRecordSet?.ResourceRecords?.[0].Value).toContain(
      'v=DMARC1'
    );
    expect(dmarcRecord?.ResourceRecordSet?.ResourceRecords?.[0].Value).toContain(
      'rua=mailto:postmaster@example.com'
    );
  });

  it('should use UPSERT action for all records', async () => {
    route53Mock.on(ChangeResourceRecordSetsCommand).resolves({
      ChangeInfo: {
        Id: 'change-1',
        Status: 'PENDING',
        SubmittedAt: new Date(),
      },
    });

    await createDNSRecords('Z123', 'example.com', ['token1'], 'us-east-1');

    const call = route53Mock.commandCalls(ChangeResourceRecordSetsCommand)[0];
    const changes = call.args[0].input.ChangeBatch?.Changes;

    expect(changes?.every((c) => c.Action === 'UPSERT')).toBe(true);
  });

  it('should pass correct hosted zone ID', async () => {
    route53Mock.on(ChangeResourceRecordSetsCommand).resolves({
      ChangeInfo: {
        Id: 'change-1',
        Status: 'PENDING',
        SubmittedAt: new Date(),
      },
    });

    await createDNSRecords('Z999888777', 'example.com', ['token1'], 'us-east-1');

    const call = route53Mock.commandCalls(ChangeResourceRecordSetsCommand)[0];
    expect(call.args[0].input.HostedZoneId).toBe('Z999888777');
  });

  it('should throw error on API failure', async () => {
    route53Mock.on(ChangeResourceRecordSetsCommand).rejects(new Error('Access denied'));

    await expect(
      createDNSRecords('Z123', 'example.com', ['token1'], 'us-east-1')
    ).rejects.toThrow('Access denied');
  });

  it('should handle empty DKIM tokens array', async () => {
    route53Mock.on(ChangeResourceRecordSetsCommand).resolves({
      ChangeInfo: {
        Id: 'change-1',
        Status: 'PENDING',
        SubmittedAt: new Date(),
      },
    });

    await createDNSRecords('Z123', 'example.com', [], 'us-east-1');

    const call = route53Mock.commandCalls(ChangeResourceRecordSetsCommand)[0];
    const changes = call.args[0].input.ChangeBatch?.Changes;

    // Should still have SPF and DMARC records
    expect(changes).toHaveLength(2);
    expect(changes?.filter((c) => c.ResourceRecordSet?.Type === 'CNAME')).toHaveLength(0);
    expect(changes?.filter((c) => c.ResourceRecordSet?.Type === 'TXT')).toHaveLength(2);
  });

  it('should set TTL to 1800 for all records', async () => {
    route53Mock.on(ChangeResourceRecordSetsCommand).resolves({
      ChangeInfo: {
        Id: 'change-1',
        Status: 'PENDING',
        SubmittedAt: new Date(),
      },
    });

    await createDNSRecords('Z123', 'example.com', ['token1'], 'us-east-1');

    const call = route53Mock.commandCalls(ChangeResourceRecordSetsCommand)[0];
    const changes = call.args[0].input.ChangeBatch?.Changes;

    expect(changes?.every((c) => c.ResourceRecordSet?.TTL === 1800)).toBe(true);
  });
});
