// Get current cusd price from blockchain anf store in DB
const Promise = require("bluebird");
const colors = require("colors");
require("dotenv").config({ path: "./config.env" });
const ENV = process.env.ENV.toLowerCase() === "main" ? "main" : "test";
const DB_PREFIX = ENV === "main" ? "" : "TEST_";

// utils
const { con, query } = require("../db/connectDB");
const { print, configureLending } = require("../utils/lendingPoolConfig");
const { retry } = require("../utils/functions");

// Get current cusd price of 1 celo
async function getCusdPrice() {
  const { kit } = await configureLending(...process.argv);
  const oneGold = kit.web3.utils.toWei("1", "ether");
  const exchange = await retry(() => kit.contracts.getExchange());

  const amountOfcUsd = await retry(() => exchange.quoteGoldSell(oneGold));
  return print(amountOfcUsd);
}

async function updateCusdPrice(id, cUsd) {
  await query(
    `INSERT INTO ${DB_PREFIX}cusdPrice (id, price) VALUES('${id}', '${cUsd}') ON DUPLICATE KEY UPDATE price = '${cUsd}'`
  );
}

// Execute from terminal
async function execute() {
  const oldcUsd = await getCusdPrice();
  await updateCusdPrice(1, oldcUsd);

  console.log('Waiting for new Cusd price to compare with old one...'.yellow);
  await Promise.delay(10000);
  const newCusd = await getCusdPrice();
  await updateCusdPrice(2, newCusd);
  console.log(`Old Cusd price -> ${oldcUsd}`.bgCyan)
  console.log(`New Cusd price -> ${newCusd}`.bgCyan)
  con.end();
}

execute();
