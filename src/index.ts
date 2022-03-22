const { getOverrideReport, printOverrideReport } = require('./report');
const { hasParam, getParam } = require('./utils');
const readline = require('readline');

const proposalId = getParam('proposal');
const json = hasParam('json');
const skipPrimaryNames = hasParam('skipprimarynames');
const debug = hasParam('debug');

if (!proposalId) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.question(`Enter the Snapshot proposal ID: `, (proposalId: string) => {
    rl.close();
    report(proposalId);
  })
} else {
  report(proposalId);
}

async function report (proposalId: string) {
  if (json) {
    console.log(JSON.stringify(await getOverrideReport(proposalId, !skipPrimaryNames, debug), null, 2));
  } else {
    printOverrideReport(proposalId, !skipPrimaryNames, debug);
  }
}
