import { formatUnits } from '@ethersproject/units';
import { isAddress } from '@ethersproject/address';
import { getSnapshotDelegations } from './delegation';
import ENS, { getEnsAddress } from '@ensdomains/ensjs';
const snapshotjs = require('@snapshot-labs/snapshot.js');

const SUBGRAPH_ENDPOINT = 'https://hub.snapshot.org/graphql';
const STRATEGY_NAME = 'erc20-votes-with-override';
const DELEGATES_NAME = 'delegates';
const DELEGATES_ABI = ['function delegates(address account) view returns (address)'];
const BALANCEOF_NAME = 'balanceOf';
const BALANCEOF_ABI = ['function balanceOf(address account) view returns (uint256)'];

async function printOverrideReport(proposalId: string, debug=false) {
  const proposal = await getProposal(proposalId, debug);
  const report = await _getOverrideReport(proposal, debug);

  console.log('\nProposal ' + proposal.title + '\n' + '='.repeat(proposal.title.length + 9));

  console.log('\nOverriding Delegators\n' + '='.repeat(21));

  if (Object.keys(report.overrides).length > 0) {
    Object.entries(report.overrides).forEach(([delegator]) => {
      let primaryName = '';
      if (report.primaryNames[delegator]) {
        primaryName = ' (' + report.primaryNames[delegator] + ')';
      }
      console.log(`${delegator}${primaryName}`);
    });
  } else {
    console.log('None');
  }

  console.log('\nOverridden Vote Deltas\n' + '='.repeat(22));

  if (Object.keys(report.deltas).length > 0) {
    Object.entries(report.deltas).forEach(([choice, details]) => {
      const choiceName = details.name;
      const choiceDisplay = choiceName ? `"${choiceName}" (${choice})` : `${choice}`;

      let delegators = '';
      if (details.delegators.length > 0) {
        delegators = '\nOverriding Delegators:';
        details.delegators.forEach((delegator: string) => {
          let primaryName = '';
          if (report.primaryNames[delegator]) {
            primaryName = ' (' + report.primaryNames[delegator] + ')';
          }
          delegators += `\n    ${delegator}${primaryName}`;
        });
      }

      console.log(`\nChoice ${choiceDisplay}: ${details.delta}${delegators}`);
    });
  } else {
    console.log('None');
  }
}

async function getOverrideReport(proposalId: string, debug=false): Promise<Record<string, Record<any, any>>> {
  return _getOverrideReport(await getProposal(proposalId), debug);
}

async function _getOverrideReport(proposal: Record<any, any>, debug=false): Promise<Record<string, Record<any, any>>> {
  const overrides = await _getOverrides(proposal, debug);
  const report = {
    overrides,
    deltas: getDeltas(proposal, overrides, debug),
    primaryNames: await getPrimaryNames(overrides, debug)
  };
  if (debug) {
    console.debug('report', report);
  }
  return report;
}

function getDeltas(proposal: Record<any, any>, overrides: Record<string, Record<any, any>>, debug=false): Record<any, any> {
  const deltas = {} as Record<any, Record<any, any>>;

  Object.entries(overrides).forEach(([delegator, details]) => {
    const choice = getFirst(details.choice);
    const delegateChoice = getFirst(details.delegateChoice);

    // Only add deltas if the delegator choice is different from the delegate
    if (!shallowEqual(choice, delegateChoice)) {
      if (!deltas[choice]) {
        deltas[choice] = {
          name: getChoiceName(proposal, choice),
          delta: 0,
          delegates: [],
          delegators: []
        };
      }
      deltas[choice].delta += details.balance;

      if (!deltas[choice].delegators.includes(delegator)) {
        deltas[choice].delegators.push(delegator);
      }

      if (delegateChoice) {
        if (!deltas[delegateChoice]) {
          deltas[delegateChoice] = {
            name: getChoiceName(proposal, delegateChoice),
            delta: 0,
            delegates: [],
            delegators: []
          };
        }
        deltas[delegateChoice].delta -= details.balance;

        if (!deltas[delegateChoice].delegates.includes(details.delegate)) {
          deltas[delegateChoice].delegates.push(details.delegate);
        }
      }
    }
  });
  if (debug) {
    console.debug('deltas', deltas);
  }

  return deltas;
}

async function getOverrides(proposalId: string, debug=false): Promise<Record<string, Record<any, any>>> {
  return _getOverrides(await getProposal(proposalId), debug);
}

async function _getOverrides(proposal: Record<any, any>, debug=false): Promise<Record<string, Record<any, any>>> {
  if (!proposal) {
    throw 'Proposal not found';
  }

  const network = proposal.network;
  const snapshot = proposal.snapshot === 'latest' ? proposal.snapshot : parseInt(proposal.snapshot, 10);
  const space = proposal.space.name;

  const strategies = proposal.strategies.filter((strategy: Record<string, string>) => strategy.name === STRATEGY_NAME);
  if (strategies.length <= 0) {
    throw `Proposal is not using the ${STRATEGY_NAME} strategy`;
  }
  const tokenAddress = strategies[0].params.address;
  const decimals = strategies[0].params.decimals;
  const includeSnapshotDelegations = !!strategies[0].params.includeSnapshotDelegations;

  const votes = await getVotes(proposal.id, debug);
  const voters = Object.fromEntries(votes.map((vote) => [
    lowerCase(vote.voter),
    vote.choice
  ]));
  const voterAddresses = Object.entries(voters).map(([voter]) => voter);
  const totalAddresses = [...voterAddresses];

  // If enabled, get Snapshot delegations. This will not include any delegators that are already in the addresses list.
  const snapshotDelegations = includeSnapshotDelegations ? await getSnapshotDelegations(space, network, voterAddresses, snapshot) : {};
  if (debug && includeSnapshotDelegations) {
    console.debug('snapshotDelegations', snapshotDelegations);
  }
  if (Object.keys(snapshotDelegations).length > 0) {
    /*
      If any Snapshot delegations were retrieved, add the delegators to the addresses list.
      
      The on-chain delegations, balances, and overridden voting power will be retrieved and
      calculated with all these addresses present.
    */
    Object.entries(snapshotDelegations).forEach(([delegate, delegators]) => (delegators.forEach((delegator: string) => {
      const delegatorLc = lowerCase(delegator);
      totalAddresses.push(delegatorLc);
      voters[delegatorLc] = voters[delegate];
    })));
  }

  if (debug) {
    console.debug('voters', voters);
  }

  const delegators = await getDelegators(totalAddresses, network, snapshot, tokenAddress, debug);

  const balances = await getBalances(totalAddresses, network, snapshot, tokenAddress, decimals, debug);

  const overrides = Object.fromEntries(voterAddresses
    .filter((voter) => !!delegators[voter] && voter !== delegators[voter])
    .map((voter) => [
      voter,
      {
        choice: voters[voter],
        balance: balances[voter],
        delegate: delegators[voter],
        delegateChoice: voters[getDelegateForChoice(delegators, voterAddresses, voter)] || null
      }
    ]
  ));
  if (debug) {
    console.debug('overrides', overrides);
  }
  return overrides;
}

async function getProposal(proposalId: string, debug=false): Promise<Record<any, any>> {
  if (debug) {
    console.debug('proposalId', proposalId);
  }
  if (!proposalId) {
    throw 'Proposal ID must not be blank';
  }

  const result = await snapshotjs.utils.subgraphRequest(
    SUBGRAPH_ENDPOINT,
    {
      proposal: {
        __args: {
          id: proposalId
        },
        id: true,
        title: true,
        space: {
          name: true
        },
        strategies: {
          name: true,
          params: true
        },
        network: true,
        snapshot: true,
        choices: true
      }
    }
  );

  const proposal = result ? result.proposal : null;
  if (debug) {
    console.debug('proposal', proposal);
  }
  return proposal;
}

async function getVotes(proposalId: string, debug=false): Promise<Array<Record<string, any>>> {
  const PAGE_SIZE = 1000;
  const params = {
    votes: {
      __args: {
        where: {
          proposal: proposalId
        },
        first: PAGE_SIZE,
        skip: 0
      },
      voter: true,
      choice: true
    }
  };

  let result = [];
  let page = 0;

  while (true) {
    params.votes.__args.skip = page * PAGE_SIZE;

    const pageResult = await snapshotjs.utils.subgraphRequest(
      SUBGRAPH_ENDPOINT,
      params
    );
    const pageVotes = pageResult.votes || [];
    result = result.concat(pageVotes);
    page++;
    if (pageVotes.length < PAGE_SIZE) break;
  }

  if (debug) {
    console.debug('votes', result);
  }
  return result;
}

async function getDelegators(addresses: Array<string>, network: string, snapshot: any, tokenAddress: string, debug=false): Promise<Record<string, string>> {
  const blockTag = typeof snapshot === 'number' ? snapshot : 'latest';

  const delegatesResponse = await snapshotjs.utils.multicall(
    network,
    snapshotjs.utils.getProvider(network),
    DELEGATES_ABI,
    addresses.map((address: any) => [
      tokenAddress,
      DELEGATES_NAME,
      [address]
    ]),
    { blockTag }
  );

  const delegators = Object.fromEntries(delegatesResponse
    .map((value: any, i: number) => [
      addresses[i],
      lowerCase(getFirst(value))])
    .filter(([, delegate]) => isValidAddress(delegate))
  );
  if (debug) {
    console.debug('delegators', delegators);
  }
  return delegators;
}

async function getBalances(addresses: Array<string>, network: string, snapshot: any, tokenAddress: string, decimals: number, debug=false): Promise<Record<string, number>> {
  const blockTag = typeof snapshot === 'number' ? snapshot : 'latest';

  const balanceOfResponse = await snapshotjs.utils.multicall(
    network,
    snapshotjs.utils.getProvider(network),
    BALANCEOF_ABI,
    addresses.map((address: any) => [
      tokenAddress,
      BALANCEOF_NAME,
      [address]
    ]),
    { blockTag }
  );

  const balances = Object.fromEntries(balanceOfResponse.map((value: any, i: number) => [
    addresses[i],
    parseValue(value, decimals)
  ]));
  if (debug) {
    console.debug('balances', balances);
  }
  return balances;
}

function getDelegateForChoice(delegators: Record<string, string>, voterAddresses: Array<string>, voter: string) {
  const delegate = delegators[voter];
  if (delegate && !voterAddresses.includes(delegate) && delegators[delegate]) {
    return delegators[delegate];
  }
  return delegate;
}

async function getPrimaryNames(overrides: Record<string, Record<any, any>>, debug=false): Promise<Record<string, any>> {
  if (debug) {
    console.debug('Retrieving ENS primary names...');
  }
  const ens = new ENS({ provider: snapshotjs.utils.getProvider('1'), ensAddress: getEnsAddress('1') });
  const primaryNames = {};
  const overrideEntries = Object.entries(overrides);
  for (let i = 0; i < overrideEntries.length; i++) {
    const delegator = overrideEntries[i][0];
    const details = overrideEntries[i][1];
    const addresses = Object.keys(primaryNames);
    if (!addresses.includes(delegator)) {
      const primaryName = await getPrimaryName(ens, delegator, debug);
      if (primaryName) {
        primaryNames[delegator] = primaryName;
      }
    }
    if (details.delegate && !addresses.includes(details.delegate)) {
      const primaryName = await getPrimaryName(ens, details.delegate, debug);
      if (primaryName) {
        primaryNames[details.delegate] = primaryName;
      }
    }
  }
  if (debug) {
    console.debug('primaryNames', primaryNames);
  }
  return primaryNames;
}

async function getPrimaryName(ens: ENS, address: string, debug=false): Promise<any> {
  let ensName = null;
  ({ name: ensName } = await ens.getName(address))
  // Check to be sure the reverse record is correct. skip check if the name is null
  if(ensName == null || lowerCase(address) != lowerCase(await ens.name(ensName).getAddress())) {
    ensName = null;
  }
  if (debug) {
    console.debug(`${address}: ${ensName}`);
  }
  return ensName;
}

function getChoiceName(proposal: Record<any, any>, choice: any): any {
  try {
    const choiceIndex = parseInt(choice, 10);
    if (choiceIndex && proposal.choices[choiceIndex - 1]) {
      return proposal.choices[choiceIndex - 1];
    }
  } catch (e) {}
  return null;
}

function parseValue(value: any, decimals: number): number {
  return parseFloat(formatUnits(value.toString(), decimals));
}

function getFirst(value: any): any {
  if (Array.isArray(value)) {
    return value.length > 0 ? value[0] : null;
  }
  return value;
}

function lowerCase(value: any): any {
  return value ? value.toLowerCase() : value;
}

function isValidAddress(address: string): boolean {
  return isAddress(address) && address != '0x0000000000000000000000000000000000000000';
}

function shallowEqual(o1: any, o2: any): boolean {
  if (o1 == o2) {
    return true;
  } else if (Array.isArray(o1) && Array.isArray(o2)) {
    return shallowArraysEqual(o1, o2);
  } else {
    return false;
  }
}

function shallowArraysEqual(a1: Array<any>, a2: Array<any>): boolean {
  if (a1.length !== a2.length) {
    return false;
  }
  for (let i = 0; i < a1.length; i++) {
    if (a1[i] != a2[i]) {
      return false;
    }
  }
  return true;
}

export {
  printOverrideReport,
  getOverrideReport,
  getOverrides,
  getDeltas,
  getProposal,
  getVotes,
  getDelegators,
  getBalances
}
