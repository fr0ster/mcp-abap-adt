/**
 * Integration test for handleGetFunction (real ABAP server, .env required)
 */

const { handleGetFunction } = require('../../dist/handlers/handleGetFunction');
const { isCloudConnection } = require('../../dist/lib/utils');
const fs = require('fs');
const path = require('path');

describe('handleGetFunction (integration)', () => {
  it('should return plain text for RFC_READ_TABLE in SDTX', async () => {
    // RFC_READ_TABLE may not be available on cloud systems
    if (isCloudConnection()) {
      console.log('Skipping RFC_READ_TABLE test on cloud deployment');
      return;
    }

    const args = {
      function_name: 'RFC_READ_TABLE',
      function_group: 'SDTX'
    };
    const result = await handleGetFunction(args);
    expect(result?.isError).toBe(false);
    const payload = result?.content?.[0]?.text ?? '';
    expect(typeof payload).toBe('string');
    const normalized = payload.trim();
    let sourceText = payload;
    if (normalized.startsWith('{')) {
      const parsed = JSON.parse(normalized);
      expect(parsed.name).toBe('RFC_READ_TABLE');
      expect(parsed.group).toBe('SDTX');
      sourceText = parsed.source;
    }
    expect(typeof sourceText).toBe('string');
    expect(sourceText).toMatch(/FUNCTION\s+RFC_READ_TABLE/i);
    expect(sourceText).toMatch(/ENDFUNCTION/i);
  });

  it('should write result to file if filePath is provided', async () => {
    // RFC_READ_TABLE may not be available on cloud systems
    if (isCloudConnection()) {
      console.log('Skipping RFC_READ_TABLE file test on cloud deployment');
      return;
    }

    const filePath = path.join(process.cwd(), 'test-func.txt');
    // Cleanup before
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    const args = {
      function_name: 'RFC_READ_TABLE',
      function_group: 'SDTX',
      filePath
    };
    const result = await handleGetFunction(args);

    // File should exist
    expect(fs.existsSync(filePath)).toBe(true);
    // Content should match result
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const payload = result.content?.[0]?.text ?? '';
    const normalized = payload.trim();
    if (normalized.startsWith('{')) {
      const persistedObj = JSON.parse(fileContent);
      const persistedPayload = persistedObj?.content?.[0]?.text ?? '';
      expect(persistedPayload).toEqual(payload);
      const parsedPersisted = JSON.parse(persistedPayload);
      expect(parsedPersisted.source).toMatch(/FUNCTION\s+RFC_READ_TABLE/i);
      expect(parsedPersisted.source).toMatch(/ENDFUNCTION/i);
    } else {
      const normalizedFile = fileContent.toLowerCase();
      expect(normalizedFile).toContain('function rfc_read_table');
      expect(normalizedFile).toContain('endfunction');
    }

    // Cleanup after
    fs.unlinkSync(filePath);
  });

  // Additional scenarios for other functions/groups can be added here
});
