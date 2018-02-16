#!/usr/bin/env node
/* eslint-disable no-mixed-operators */

const Scraper = require('./scraper');
const program = require('commander');
const inquirer = require('inquirer');
const jsonfile = require('jsonfile');
const fs = require('fs-extra');
const ProgressBar = require('ascii-progress');
const _ = require('lodash');
const prettyMs = require('pretty-ms');
const chalk = require('chalk');
// const readline = require('readline');

program
  .version('0.1.0')
  .description('Bundestag scraper')
  .option('-p, --periods [PeriodenNummers|Alle]', 'comma sperated period numbers', null)
  .option(
    '-t, --operationtypes <OperationTypeNummer|Alle>',
    'Select specified OperationTypes [null]',
    null,
  )
  .option('-s, --stacksize <Integer>', 'size of paralell browsers', 1)
  .parse(process.argv);

const scraper = new Scraper();

let bar1;
let bar2;
let bar3;

const selectPeriods = async ({ periods }) => {
  let selectedPeriod = program.period;
  if (!selectedPeriod) {
    const period = await inquirer.prompt({
      type: 'checkbox',
      name: 'values',
      message: 'Wähle eine Legislaturperiode',
      choices: periods,
    });
    selectedPeriod = period.values
      .map((v) => {
        const selection = periods.find(({ value }) => value === v);
        if (selection) {
          return selection.name;
        }
        return undefined;
      })
      .filter(v => v !== undefined);
    return selectedPeriod;
  } else if (!periods.find(period => period.name === selectedPeriod)) {
    console.log(`'${selectedPeriod}' is not a valid option for period`);
    process.exit(1);
  }
  console.log(`Selected Period '${selectedPeriod}'`);
  return periods.find(period => period.name === selectedPeriod).name;
};

const selectOperationTypes = async ({ operationTypes }) => {
  let selectedOperationTypes = [];
  if (!program.operationtypes) {
    const operationType = await inquirer.prompt({
      type: 'checkbox',
      name: 'values',
      message: 'Wähle Vorgangstyp(en)',
      choices: operationTypes,
    });
    selectedOperationTypes = operationType.values
      .map((v) => {
        const selection = operationTypes.find(({ value }) => value === v);
        if (selection) {
          return selection.number;
        }
        return undefined;
      })
      .filter(v => v !== undefined);
  } else {
    selectedOperationTypes = program.operationtypes.split(',');
  }
  return selectedOperationTypes;
};

const logFinished = async () => {
  console.log('############### FINISH ###############');
};

const logStartSearchProgress = async () => {
  bar1 = new ProgressBar({
    schema: 'filters [:bar] :percent :completed/:sum | :estf | :duration',
    width: 20,
  });
  bar2 = new ProgressBar({
    schema: 'pages [:bar] :percent :completed/:sum | :estf | :duration',
    width: 20,
  });
};

const logUpdateSearchProgress = async ({ search }) => {
  // barSearchPages.update(search.pages.completed, {}, search.pages.sum);
  // barSearchInstances.update(search.instances.completed, {}, search.instances.sum);

  bar1.tick(_.toInteger(search.instances.completed / search.instances.sum * 100 - bar1.current), {
    completed: search.instances.completed,
    sum: search.instances.sum,
    estf: prettyMs(
      _.toInteger((new Date() - bar1.start) / bar1.current * (bar1.total - bar1.current)),
      { compact: true },
    ),
    duration: prettyMs(_.toInteger(new Date() - bar1.start), { secDecimalDigits: 0 }),
  });
  bar2.tick(_.toInteger(search.pages.completed / search.pages.sum * 100 - bar2.current), {
    completed: search.pages.completed,
    sum: search.pages.sum,
    estf: prettyMs(
      _.toInteger((new Date() - bar2.start) / bar2.current * (bar2.total - bar2.current)),
      { compact: true },
    ),
    duration: prettyMs(_.toInteger(new Date() - bar2.start), { secDecimalDigits: 0 }),
  });
};

const logStartDataProgress = async ({ sum }) => {
  console.log('links analysieren');
  // barData.start(sum, 0, { retries, maxRetries });
  bar3 = new ProgressBar({
    schema:
      'links | :cpercent | :current/:total | :estf | :duration | :browsersRunning | :browsersScraped | :browserErrors ',
    total: sum,
  });
};

function getColor(value) {
  // value from 0 to 1
  return (1 - value) * 120;
}

const logUpdateDataProgress = async ({ value, browsers }) => {
  // barData.update(value, { retries, maxRetries });
  let tick = 0;
  if (value > bar3.current) {
    tick = 1;
  } else if (value < bar3.current) {
    tick = -1;
  }
  bar3.tick(tick, {
    estf: chalk.hsl(getColor(1 - bar3.current / bar3.total), 100, 50)(prettyMs(
      _.toInteger((new Date() - bar3.start) / bar3.current * (bar3.total - bar3.current)),
      { compact: true },
    )),
    duration: prettyMs(_.toInteger(new Date() - bar3.start), { secDecimalDigits: 0 }),
    browserErrors: browsers.map(({ errors }) => chalk.hsl(getColor(errors / 5), 100, 50)(errors)),
    browsersRunning: browsers.reduce((count, { used }) => count + (used ? 1 : 0), 0),
    browsersScraped: browsers.map(({ scraped }) => {
      if (_.minBy(browsers, 'scraped').scraped === scraped) {
        return chalk.red(scraped);
      } else if (_.maxBy(browsers, 'scraped').scraped === scraped) {
        return chalk.green(scraped);
      }
      return scraped;
    }),
    cpercent: chalk.hsl(getColor(1 - bar3.current / bar3.total), 100, 50)(`${(bar3.current / bar3.total * 100).toFixed(1)}%`),
  });
};

const outScraperData = async ({ procedureId, procedureData }) => {
  const directory = `files/${procedureData.VORGANG.WAHLPERIODE}/${
    procedureData.VORGANG.VORGANGSTYP
  }`;
  await fs.ensureDir(directory);
  jsonfile.writeFile(
    `${directory}/${procedureId}.json`,
    procedureData,
    {
      spaces: 2,
      EOL: '\r\n',
    },
    (/* err */) => {},
  );
};

// HANDLE EXIT
// so the program will not close instantly
/* if (process.platform === 'win32') {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on('SIGINT', () => {
    process.emit('SIGINT');
  });
} */

/*
process.stdin.resume();
// do something when app is closing
process.on('exit', scraper.finalize.bind(scraper));
process.on('SIGINT', scraper.finalize.bind(scraper));
// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', scraper.finalize.bind(scraper));
process.on('SIGUSR2', scraper.finalize.bind(scraper));
// catches uncaught exceptions
process.on('uncaughtException', scraper.finalize.bind(scraper));
*/

process.on('SIGINT', async () => {
  process.exit(1);
});

const logError = ({ error }) => {
  switch (error.type) {
    case 'timeout':
    case 'not found':
    case 'warning':
      if (error.function !== 'saveJson' && error.function !== 'getProcedureRunningData') {
        console.log(error);
      }
      break;
    default:
      console.log(error);
      break;
  }
};

scraper
  .scrape({
    selectPeriods,
    selectOperationTypes,
    logStartSearchProgress,
    logUpdateSearchProgress,
    logStartDataProgress,
    logUpdateDataProgress,
    logFinished,
    outScraperData,
    browserStackSize: _.toInteger(program.stacksize),
    logError,
  })
  .catch((error) => {
    console.error(error);
  });