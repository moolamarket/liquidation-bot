const Promise = require('bluebird');
const colors = require('colors');
require('dotenv').config({ path: './config.env' });

const {
  configureLending,
  configureReserve,
  BN,
  print,
  maxUint256,
} = require('../utils/lendingPoolConfig');
const { getUserReserved, getUserData } = require('../utils/actions');
const { retry } = require('../utils/functions');
const { con, query } = require('../db/connectDB');
const USER_ADDRESS = process.env.USER_ADDRESS;
const USER_PRIVATE_KEY = process.env.USER_PRIVATE_KEY;
const ENV = process.env.ENV.toLowerCase() === 'main' ? 'main' : 'test';
const DB_PREFIX = ENV === 'main' ? '' : 'TEST_';
const SECOND = 1000;

// Global variables
let lendingPool,
  lendingPoolDataProvider,
  lendingPoolCore,
  kit,
  web3,
  CELO,
  cUSD,
  reserveCelo,
  reserveCusd,
  exchange;

async function logBalances() {
  const celoBalance = await retry(() => CELO.balanceOf(USER_ADDRESS));
  const cusdBalance = await retry(() => cUSD.balanceOf(USER_ADDRESS));
  console.log(`CELO: ${print(celoBalance)}`.yellow);
  console.log(`CUSD: ${print(cusdBalance)}`.yellow);
}

// Get all [events] from Db     ✔
async function getEvents() {
  const res = await query(`SELECT * FROM ${DB_PREFIX}events`);

  return res.map((el) => {
    return JSON.parse(el.event);
  });
}

// Get all [users] from Db     ✔
async function getUsers() {
  const res = await query(`SELECT user FROM ${DB_PREFIX}userDebtsOrderedList`);
  return res.map((row) => row.user);
}

// Get all [users] with UC status from Db     ✔
async function getUCUsers() {
  const res = await query(
    `SELECT user FROM ${DB_PREFIX}userDebtsOrderedList where Status = 'UC'`
  );

  return res.map((row) => row.user);
}

// Get latest Cusd price from blockchain
async function getCusdPrice() {
  const oneCelo = kit.web3.utils.toWei('1');
  const exchange = await retry(() => kit.contracts.getExchange());

  const amountOfcUsd = await retry(() => exchange.quoteGoldSell(oneCelo));
  return print(amountOfcUsd);
}

// Update Cusd pruce in DB
async function cusdPriceQuery(id, cUsd) {
  await query(
    `INSERT INTO ${DB_PREFIX}cusdPrice (id, price) VALUES('${id}', '${cUsd}') ON DUPLICATE KEY UPDATE price = '${cUsd}'`
  );
}

// Compare Cusd prices from Db
async function compareCusdPrices() {
  const res = await query(`select price from ${DB_PREFIX}cusdPrice`);
  const [oldCusd, newCusd] = res.map((row) => row.price);

  // Compares old and new prices by 10%
  return BN(oldCusd).minus(BN(newCusd)).gte(BN(oldCusd).times(10).div(100))
    ? true
    : false;
}

// Extract specific event from [events]    ✔
function extractSpecificEvent(events, type) {
  return events.filter((event) => event.event === type);
}

// Get only unique users    ✔
function getUniqueUsers(events) {
  return [...new Set(events.map((event) => event.returnValues._user))];
}

// Get info about users     ~~~
async function getUsersInformation(users) {
  const usersInfo = [];

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const reserveInfo = await getUserReserved(user, lendingPool, {
      reserveCelo,
      reserveCusd,
    });
    const accountInfo = await getUserData(
      user,
      lendingPool,
      lendingPoolDataProvider
    );

    if (
      BN(accountInfo.healthFactor).gt('1.25') ||
      BN(accountInfo.healthFactor).eq('0') ||
      BN(accountInfo.TotalBorrow).lte('0.1') ||
      BN(accountInfo.TotalCollateral).lte('0.1')
    ) {
      accountInfo.status = 'OK';
    } else {
      accountInfo.status = 'RISK';
      if (BN(accountInfo.healthFactor).lt('1')) {
        accountInfo.status = 'UC';
      }
    }

    if (reserveInfo || accountInfo) {
      usersInfo.push({ ...reserveInfo, ...accountInfo, user });
    }
  }

  return usersInfo;
}

// Save user info in DB         ✔
async function saveUserInfoInDb(user) {
  await query(
    `INSERT INTO ${DB_PREFIX}userDebtsOrderedList SET ? ON DUPLICATE KEY UPDATE
    DepositedCelo = '${user.DepositedCelo}',
    BorrowedCelo = '${user.BorrowedCelo}',
    DebtCelo = '${user.DebtCelo}',
    DepositedCusd = '${user.DepositedCusd}',
    BorrowedCusd = '${user.BorrowedCusd}',
    DebtCusd = '${user.DebtCusd}',
    TotalLiquidity = '${user.TotalLiquidity}',
    TotalCollateral = '${user.TotalCollateral}',
    TotalBorrow = '${user.TotalBorrow}',
    LiquidationThreshold = '${user.LiquidationThreshold}',
    LoanToValue = '${user.LoanToValue}',
    healthFactor = '${user.healthFactor}',
    status = '${user.status}',
    user = '${user.user}'`,
    user
  );
}

// Remove all old events        ✔
async function clearTableInDb(table) {
  await query(`DELETE FROM ${DB_PREFIX}${table}`);
}

// Get latest block number from Db      ✔
async function getBlockNumber() {
  const res = await query(
    `SELECT blockNumber FROM ${DB_PREFIX}eventsBlockNumber WHERE id = 1`
  );

  return res.length === 0 ? 0 : parseInt(res[0].blockNumber);
}

// Save new events in Db        ✔
async function saveEventsToDb(in_events) {
  const events = in_events.map((el) => {
    el = [JSON.stringify(el)];
    return el;
  });

  await query(`INSERT INTO ${DB_PREFIX}events (event) VALUES ?`, [events]);
}

// Get latest events from blockchain and store them in Db       ~
async function getLatestEvents() {
  const fromBlock = await getBlockNumber();
  const toBlock = await retry(() => web3.eth.getBlockNumber());

  // Get all new events
  const events = await retry(() =>
    lendingPool.getPastEvents('allEvents', {
      fromBlock,
      toBlock,
    })
  );

  //   Update blockNumber in DB
  await query(
    `INSERT INTO ${DB_PREFIX}eventsBlockNumber (id, blockNumber) VALUES('1', ${toBlock}) ON DUPLICATE KEY UPDATE blockNumber = '${toBlock}'`
  );

  // Check for new events inside blockchain
  if (events.length === 0) return;

  //  If there are new events, insert them in DB
  await saveEventsToDb(events);
}

// Liquidation Call       ~~
async function liquidate(_reserve, _target_address, _address, _mToken) {
  // if invalid currency
  if (_reserve !== 'celo' && _reserve !== 'cusd') {
    return console.log(`${_reserve} -> Invalid currency!`.red);
  }

  // Get data from args
  const collateral = _reserve === 'celo' ? reserveCusd : reserveCelo;
  const reserve = _reserve === 'celo' ? reserveCelo : reserveCusd;
  const token = _reserve === 'celo' ? CELO : cUSD;
  const collateralToken = _reserve === 'celo' ? cUSD : CELO;
  let value = 0;

  console.log(
    `Start liquidation of address -> ${_target_address}`.green +
      ` in ${_reserve}`.cyan
  );

  // Get user healthFactor
  const { healthFactor } = await getUserData(
    _target_address,
    lendingPool,
    lendingPoolDataProvider
  );

  // Check for HF
  if (BN(healthFactor).gte(1)) {
    return console.log(`User's HF is greater than 1!`.yellow);
  }

  // Get User borrowed currencies
  const { BorrowedCelo, BorrowedCusd, DepositedCelo, DepositedCusd } = await getUserReserved(
    _target_address,
    lendingPool,
    {
      reserveCelo,
      reserveCusd,
    }
  );

  // Our reserve balance before liquidation
  const balance = await retry(() => token.balanceOf(_address));
  // Our collateral balance before liquidation
  const colBalance = await retry(() => collateralToken.balanceOf(_address));

  let amount = balance;
  if (_reserve === 'celo') {
    amount = balance.minus(web3.utils.toWei('1')); // leave 1 CELO available.
  }
  if (amount.lte(0)) {
    return console.log(`Not enough ${_reserve} to spend for liquidation!`.red);
  }

  amount = amount.toFixed(0);

  if (_reserve === 'cusd' && BN(BorrowedCusd).gte('0.5') && BN(DepositedCelo).gte('0.1')) {
  } else if (_reserve === 'celo' && BN(BorrowedCelo).gte('0.1') && BN(DepositedCusd).gte('0.5')) {
    value = amount;
  } else {
    return console.log(`User borrowed too little of ${_reserve} or doesn't have much collateral left!`.red);
  }

  try {
    await retry(
      () =>
        lendingPool.methods
          .liquidationCall(
            collateral,
            reserve,
            _target_address,
            amount,
            _mToken
          )
          .estimateGas({ from: _address, gas: 2000000, value }),
      2
    );
  } catch (err) {
    console.log('Cannot Liquidate'.red, err.message);
    return;
  }

  await logBalances();
  console.log(
    'Liquidate'.green,
    (
      await lendingPool.methods
        .liquidationCall(collateral, reserve, _target_address, amount, _mToken)
        .send({ from: _address, gas: 2000000, value })
    ).transactionHash
  );

  // exchange logic
  const newBalance = await retry(() => token.balanceOf(_address)); // reserve
  const newColBalance = await retry(() => collateralToken.balanceOf(_address)); // collateral
  // How much reserve we have spent
  const spent = balance.minus(newBalance);
  // How much collateral we have got
  const received = newColBalance.minus(colBalance);

  if (spent.lt(0) || received.lt(0)) {
    console.log(`Bad liquidation result. Spent: ${print(spent)}, Received: ${print(received)}`.red);
    await logBalances();
    return;
  } else {
    console.log(`Liquidated ${_reserve}. Spent: ${print(spent)} ${_reserve}, Received: ${print(received)} collateral.`.green);
  }

  // Exchange collateral to cover our spends and make profit.
  await exchangeCollateral(_address, received, spent, _reserve);
}

// Exchange cusd/CELO from pledge
async function exchangeCollateral(_address, received, spent, _reserve) {
  // If reserve === cusd
  if (_reserve === 'celo') {
    // console.log("quoteUsdSell...".yellow);
    const celoAmount = await retry(() => exchange.quoteUsdSell(received));

    // Check if quote is greater than amount
    if (spent.gt(celoAmount)) {
      console.log(
        `Cannot be exchanged! Quote is less than amount to exchange. Spent: ${print(spent)}, quote: ${print(celoAmount)}`.red
      );
      return;
    }
    // console.log("Exchanging dollars...".yellow);
    const sellTx = await exchange
        .sellDollar(received, celoAmount.times('0.99').toFixed(0))
        .send({ from: _address, gas: 2000000 });

    const sellReceipt = await retry(() => sellTx.waitReceipt());
    console.log(`Exchange ${sellReceipt.transactionHash}`.green);
  } else if (_reserve === 'cusd') {
    // console.log("quoteGoldSell...".yellow);
    const usdAmount = await retry(() => exchange.quoteGoldSell(received));

    // Check if quote is greater than amount
    if (spent.gt(usdAmount)) {
      return console.log(
        `Cannot be exchanged! Quote is less than amount spent. Spent: ${print(spent)}, quote: ${print(usdAmount)}`.red
      );
    }

    // console.log("Exchanging for cusd...".yellow);
    const sellTx = await exchange
        .sellGold(received, usdAmount.times('0.99').toFixed(0))
        .send({ from: _address, gas: 2000000 });

    const sellReceipt = await retry(() => sellTx.waitReceipt());
    console.log(`Exchange ${sellReceipt.transactionHash}`.green);
  } else {
    console.log(`Cannot exchange, invalid reserve: ${_reserve}`.red);
  }
  await logBalances();
}

// Liquidation process for CELO/Cusd      ~~~
async function liquidationProcess(users, reserve = 'celo') {
  for (let user of users) {
    await liquidate(reserve, user, USER_ADDRESS, false);
  }
  if (users.length > 0) {
    console.log(
      `Done with Liquidation for ${reserve.toUpperCase()}`.cyan
    );
  }
}

function now() {
  return Date.now();
}

// main automatic system monitoring         ✔
async function monitor(lastExistingRun = 0) {
  // Get cusd price
  const cusdPrice = await getCusdPrice();
  await cusdPriceQuery(1, cusdPrice);

  // Get latest events relying on blockNumber from DB then save them to DB
  await getLatestEvents();

  // get latest events from Db
  const events = await getEvents();

  // extract only borrow events
  const borrowEvents = extractSpecificEvent(events, 'Borrow');

  // extract unique users from that borrow events
  const users = getUniqueUsers(borrowEvents);

  // get info for each user
  const usersInformation = await getUsersInformation(users);

  // store ordered list of users in Db (for borrow events)
  for (let user of usersInformation) {
    await saveUserInfoInDb(user);
  }

  // clear old events in DB
  await clearTableInDb('events');

  // Update users every X hr
  if ((now() - lastExistingRun) > 600 * SECOND || (await compareCusdPrices())) {
    await monitorExisting();
    lastExistingRun = now();
  }

  // Get users with UC status from DB
  const usersWithUC = await getUCUsers();

  // Liquidate if private key given
  if (USER_PRIVATE_KEY) {
    //  Liquidate each user in CELO/Cusd
    await liquidationProcess(usersWithUC, 'cusd');
    await liquidationProcess(usersWithUC, 'celo');
    const usersWithUCInformation = await getUsersInformation(usersWithUC);
    for (let user of usersWithUCInformation) {
      await saveUserInfoInDb(user);
    }
  }

  console.log('Wait 60s for the next check!'.yellow);

  // Get latest events after X seconds and call itself
  await Promise.delay(60 * SECOND);

  // Get new cusd price for comparimg with the old one
  const newCusdPrice = await getCusdPrice();
  await cusdPriceQuery(2, newCusdPrice);

  // Call itself again
  await monitor(lastExistingRun);
}

// Update prev users from Db
async function monitorExisting() {
  const allUsersFromDB = await getUsers();

  const usersInformation = await getUsersInformation(allUsersFromDB);
  for (let user of usersInformation) {
    if (user.status === 'UC' || user.status === 'RISK') {
      console.log(`${user.user} ${user.healthFactor} ${user.status}`.red);
    }
    await saveUserInfoInDb(user);
  }
  console.log('Refreshed users data!'.cyan);
}

// Infinity monitoring
async function execute() {
  const lending = await configureLending(ENV);
  const currency = await configureReserve();

  lendingPool = lending.lendingPool;
  lendingPoolDataProvider = lending.lendingPoolDataProvider;
  lendingPoolCore = lending.lendingPoolCore;
  kit = lending.kit;
  web3 = lending.web3;
  cUSD = currency.cUSD;
  CELO = currency.CELO;
  reserveCelo = currency.reserveCelo;
  reserveCusd = currency.reserveCusd;

  if (USER_PRIVATE_KEY) {
    console.log(
      `Automated liquidation turned on from address ${USER_ADDRESS}`.cyan
    );
    await logBalances();
    // Add private key
    kit.addAccount(USER_PRIVATE_KEY);

    let allowance = await retry(() => cUSD.allowance(
      USER_ADDRESS,
      lendingPoolCore.options.address
    ));
    if (allowance.lt(BN(maxUint256).div(2))) {
      console.log(
        'Approve'.green,
        (
          await (
            await cUSD
              .approve(lendingPoolCore.options.address, maxUint256)
              .send({ from: USER_ADDRESS, gas: 2000000 })
          ).receiptFuture.promise
        ).transactionHash
      );
    }

    // Configure method for exchanging pledge
    exchange = await retry(() => kit.contracts.getExchange());

    allowance = await retry(() => cUSD.allowance(
      USER_ADDRESS,
      exchange.address
    ));
    if (allowance.lt(BN(maxUint256).div(2))) {
      console.log(
        'Approve Cusd'.green,
        (
          await (
            await cUSD
              .approve(exchange.address, maxUint256)
              .send({ from: USER_ADDRESS, gas: 2000000 })
          ).receiptFuture.promise
        ).transactionHash
      );
    }

    allowance = await retry(() => CELO.allowance(
      USER_ADDRESS,
      exchange.address
    ));
    if (allowance.lt(BN(maxUint256).div(2))) {
      console.log(
        'Approve CELO'.green,
        (
          await (
            await CELO.approve(exchange.address, maxUint256).send({
              from: USER_ADDRESS,
              gas: 2000000,
            })
          ).receiptFuture.promise
        ).transactionHash
      );
    }
  } else {
    console.log(`Automated liquidation turned off`.red);
  }

  await monitor(0);

  if (USER_PRIVATE_KEY) {
    console.log(
      'Revoke approve'.yellow,
      (
        await (
          await cUSD
            .approve(lendingPoolCore.options.address, 0)
            .send({ from: USER_ADDRESS, gas: 2000000 })
        ).receiptFuture.promise
      ).transactionHash
    );
    console.log(
      'Revoke approve Cusd'.yellow,
      (
        await (
          await cUSD
            .approve(exchange.address, 0)
            .send({ from: USER_ADDRESS, gas: 2000000 })
        ).receiptFuture.promise
      ).transactionHash
    );
    console.log(
      'Revoke approve CELO'.yellow,
      (
        await (
          await CELO.approve(exchange.address, 0).send({
            from: USER_ADDRESS,
            gas: 2000000,
          })
        ).receiptFuture.promise
      ).transactionHash
    );
  }
}

execute();
