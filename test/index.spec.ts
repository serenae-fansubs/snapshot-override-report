const { getProposal, getVotes, getOverrides, getDeltas, getOverrideReport, printOverrideReport } = require('../dist/report');
const { hasParam, getParam } = require('../dist/utils');

const proposalId = getParam('proposal');
const debug = hasParam('debug');

describe(`\nGet overrides for proposal ${proposalId}`, () => {
  it('Proposal should be valid', async () => {
    expect(proposalId).toBeTruthy();
    const proposal = await getProposal(proposalId, debug);
    expect(proposal.strategies.filter((strategy) => strategy.name === 'erc20-votes-with-override').length).toBeGreaterThan(0);
  }, 2e4);

  it('Proposal should have votes', async () => {
    const votes = await getVotes(proposalId, debug);
    expect(votes.length).toBeGreaterThan(0);
  }, 2e4);

  it('At least one override should be detected', async () => {
    const overrides = await getOverrides(proposalId, debug);
    expect(Object.keys(overrides).length).toBeGreaterThan(0);
  }, 2e4);

  it('At least one delta should be detected', async () => {
    const proposal = await getProposal(proposalId, debug);
    const overrides = await getOverrides(proposalId, debug);
    const deltas = await getDeltas(proposal, overrides, debug);
    expect(Object.keys(deltas).length).toBeGreaterThan(0);
  }, 2e4);

  it('At least one override and delta should be detected in report', async () => {
    const report = await getOverrideReport(proposalId, true, debug);
    expect(Object.keys(report.overrides).length).toBeGreaterThan(0);
    expect(Object.keys(report.deltas).length).toBeGreaterThan(0);
  }, 2e4);

  it('Override report is printed without errors', async () => printOverrideReport(proposalId, true, debug), 2e4);
});
