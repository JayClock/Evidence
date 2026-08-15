describe('@evidence/ui', () => {
  it('has a loadable public API', async () => {
    const ui = await import('./index');

    expect(ui).toBeDefined();
    expect(ui.EvidenceStatusBadge).toBeTypeOf('function');
  }, 15_000);
});
