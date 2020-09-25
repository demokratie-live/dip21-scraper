#!/usr/bin/env node
/* eslint-disable no-mixed-operators */

const Scraper = require('./scraper');
const program = require('commander');
const inquirer = require('inquirer');
const jsonfile = require('jsonfile');
const fs = require('fs-extra');
const readline = require('readline');

const _ = require('lodash');
const prettyMs = require('pretty-ms');
const chalk = require('chalk');

const appender = (xs = []) => (x) => {
  xs.push(x);
  return xs;
};

program
  .version('0.1.0')
  .description('Bundestag scraper')
  .option('-p, --periods [PeriodenNummers|Alle]', 'comma sperated period numbers', null)
  .option(
    '-t, --operationtypes <OperationTypeNummer|Alle>',
    'Select specified OperationTypes [null]',
    null,
  )
  .option('-u, --url [value]', 'Base url of dip21', 'dip21.bundestag.de')
  .option('-s, --stacksize <Integer>', 'size of paralell browsers', 1)
  .option('-o, --out [value]', 'size of paralell browsers', 'files')
  .option('-q, --quiet', 'Silent Mode - No Outputs')
  .option('--html', 'scrape html version', 'html')
  .option('--importantState [value]', 'states to scrape from live', appender(), '')
  .parse(process.argv);

const scraper = new Scraper({
  baseUrl: program.url,
});

const selectPeriods = async ({ periods }) => {
  let selectedPeriod = program.periods;
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
      .filter((v) => v !== undefined);
    return selectedPeriod;
  }
  return selectedPeriod.split(',').filter((name) => periods.find((period) => period.name === name));
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
      .filter((v) => v !== undefined);
  } else {
    selectedOperationTypes = program.operationtypes.split(',');
  }
  return selectedOperationTypes;
};

const logFinished = async () => {
  console.log('############### FINISH ###############');
};

const logUpdateSearchProgress = async ({ search }) => {
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  process.stdout.write(
    `Instances: ${search.instances.completed}/${search.instances.sum} (${_.toInteger(
      (search.instances.completed / search.instances.sum) * 100,
    )}%) | Pages: ${search.pages.completed}/${search.pages.sum} (${_.toInteger(
      (search.pages.completed / search.pages.sum) * 100,
    )}%)`,
  );
};

let linksSum = 0;
let startDate;

const logStartDataProgress = async ({ sum }) => {
  startDate = new Date();
  process.stdout.write('\n');
  linksSum = sum;
};

function getColor(value) {
  // value from 0 to 1
  return (1 - value) * 120;
}

const logUpdateDataProgress = async ({ value, browsers }) => {
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  process.stdout.write(
    `Links: ${_.toInteger((value / linksSum) * 100)}% | ${value}/${linksSum} | ${chalk.hsl(
      getColor(1 - value / linksSum),
      100,
      50,
    )(
      prettyMs(_.toInteger(((new Date() - startDate) / value) * (linksSum - value)), {
        compact: true,
      }),
    )} | ${browsers.map(({ scraped }) => {
      if (_.maxBy(browsers, 'scraped').scraped === scraped) {
        return chalk.green(scraped);
      } else if (_.minBy(browsers, 'scraped').scraped === scraped) {
        return chalk.red(scraped);
      }
      return scraped;
    })} | ${browsers.map(({ errors }) => chalk.hsl(getColor(errors / 4), 100, 50)(errors))}`,
  );
};

const outScraperData = async ({ procedureId, procedureData }) => {
  if (procedureData) {
    const directory = `${program.out}/${procedureData.VORGANG.WAHLPERIODE}/${procedureData.VORGANG.VORGANGSTYP}`;
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
  }
};

process.on('SIGINT', async () => {
  process.exit(1);
});

const logError = (error) => {
  process.stdout.write('\n');
  console.log('logError:', error);
};

scraper
  .scrape({
    selectPeriods,
    selectOperationTypes,
    logUpdateSearchProgress: program.quiet ? () => {} : logUpdateSearchProgress,
    logStartDataProgress: program.quiet ? () => {} : logStartDataProgress,
    logStopDataProgress: () => process.stdout.write('\n'),
    logUpdateDataProgress: program.quiet ? () => {} : logUpdateDataProgress,
    logFinished: program.quiet ? () => {} : logFinished,
    outScraperData,
    browserStackSize: _.toInteger(program.stacksize),
    logError,
    scrapeType: program.html || 'live',
    liveScrapeStates: program.importantState ? program.importantState : [],
  })
  .catch((error) => {
    console.error(error);
  });
