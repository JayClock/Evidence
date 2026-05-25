describe('@evidence/ui', () => {
  it('has a loadable public API', async () => {
    await expect(import('./index')).resolves.toBeDefined();
  });
});
