/*
The MIT License (MIT)

Copyright (c) Snapshot Labs

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import { getAddress } from '@ethersproject/address';
const snapshotjs = require('@snapshot-labs/snapshot.js');

export async function getSnapshotDelegations(space, network, addresses, snapshot) {
  const addressesLc = addresses.map((addresses) => addresses.toLowerCase());
  const spaceIn = ['', space];
  if (space.includes('.eth')) spaceIn.push(space.replace('.eth', ''));

  const PAGE_SIZE = 1000;
  let result = [];
  let page = 0;
  const params = {
    delegations: {
      __args: {
        where: {
          // delegate_in: addressesLc,
          // delegator_not_in: addressesLc,
          space_in: spaceIn
        },
        first: PAGE_SIZE,
        skip: 0
      },
      delegator: true,
      space: true,
      delegate: true
    }
  };
  if (snapshot !== 'latest') {
    // @ts-ignore
    params.delegations.__args.block = { number: snapshot };
  }
  while (true) {
    params.delegations.__args.skip = page * PAGE_SIZE;

    const pageResult = await snapshotjs.utils.subgraphRequest(
      snapshotjs.utils.SNAPSHOT_SUBGRAPH_URL[network],
      params
    );
    const pageDelegations = pageResult.delegations || [];
    result = result.concat(pageDelegations);
    page++;
    if (pageDelegations.length < PAGE_SIZE) break;
  }
  const delegations = result.filter(
    (delegation: any) =>
      addressesLc.includes(delegation.delegate) &&
      !addressesLc.includes(delegation.delegator)
  );
  if (!delegations) return {};

  const delegationsReverse = {};
  delegations.forEach(
    (delegation: any) =>
      (delegationsReverse[delegation.delegator] = delegation.delegate)
  );
  delegations
    .filter((delegation: any) => delegation.space !== '')
    .forEach(
      (delegation: any) =>
        (delegationsReverse[delegation.delegator] = delegation.delegate)
    );

  return Object.fromEntries(
    addresses.map((address) => [
      address,
      Object.entries(delegationsReverse)
        .filter(([, delegate]) => address.toLowerCase() === delegate)
        .map(([delegator]) => getAddress(delegator))
    ])
  );
}
