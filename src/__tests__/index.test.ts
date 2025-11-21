describe('MCP ABAP ADT Server', () => {
  it('should be a valid test suite', () => {
    expect(true).toBe(true);
  });

  describe('Module Imports', () => {
    it('should import handler modules without errors', async () => {
      await expect(import('../handlers/handleGetProgram')).resolves.toBeDefined();
      await expect(import('../handlers/handleGetClass')).resolves.toBeDefined();
      await expect(import('../handlers/handleGetFunction')).resolves.toBeDefined();
    });

    it('should import utility modules without errors', async () => {
      await expect(import('../lib/utils')).resolves.toBeDefined();
      await expect(import('../lib/logger')).resolves.toBeDefined();
    });
  });

  describe('Configuration', () => {
    it('should have valid Node.js version', () => {
      const nodeVersion = process.version;
      const majorVersion = parseInt(nodeVersion.split('.')[0].slice(1));
      expect(majorVersion).toBeGreaterThanOrEqual(18);
    });
  });
});
