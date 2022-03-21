# Snapshot Override Report

This tool is intended for Snapshot proposals that use the [ERC-20 Votes With Override](https://github.com/snapshot-labs/snapshot-strategies/tree/master/src/strategies/erc20-votes-with-override) strategy. It will generate a report showing which delegators **overrode** their delegates, and how much that affected the outcome (versus those delegators not voting at all, and only the delegates voting).

## Quick Start

```
yarn
```

```
yarn report
```

The tool will ask you for your proposal ID. This can be found by going to the proposal page on [Snapshot](https://snapshot.org/) and looking at the URL. It will be in this format:

```
https://snapshot.org/#/<space>/proposal/<proposalId>
```

After entering the proposal ID, the report will be run and printed out:

```
Proposal Test
=============

Overriding Delegators
=====================
0x1111111111111111111111111111111111111111

Overriden Vote Deltas
=====================

Choice "For" (1): -100

Choice "Against" (2): 100
Overriding Delegators:
    0x1111111111111111111111111111111111111111 (delegatorprimaryname.eth)
```

## Other Options

#### Build once, run report directly

You can also run the report directly without needing to rebuild each time.
Build once:

```
yarn
yarn build
```

Then run the report:

```
node dist
```

#### Command line options

- `--proposal=<proposalId>` -- Pass the proposal ID in directly instead of with interactive input
- `--json` -- Print the report in JSON format instead
- `--debug` -- Enable debug logging

#### Report JSON format

If you pass the `--json` command line option, the report will have the following structure:

```
{
  "overrides": {
    "0x1111111111111111111111111111111111111111": {
      "choice": 2,
      "balance": 100,
      "delegate": "0x2222222222222222222222222222222222222222",
      "delegateChoice": 1
    }
  },
  "deltas": {
    "1": {
      "delta": -100,
      "delegates": [
        "0x2222222222222222222222222222222222222222"
      ],
      "delegators": []
    },
    "2": {
      "delta": 100,
      "delegates": [],
      "delegators": [
        "0x1111111111111111111111111111111111111111"
      ]
    }
  },
  "primaryNames": {
    "0x1111111111111111111111111111111111111111": "delegatorprimaryname.eth",
    "0x2222222222222222222222222222222222222222": "delegateprimaryname.eth"
  }
}
```

The `overrides` object lists each delegator that is delegated on-chain to someone else and voted on the proposal. It includes the delegator's proposal choice and local token balance, as well as the delegate and delegate's proposal choice.

The `deltas` object lists each choice in the proposal that was affected by the overriding delegators. It includes the actual delta of voting power, the delegators that overrode with that choice, and the delegates who were overrode on that choice.
