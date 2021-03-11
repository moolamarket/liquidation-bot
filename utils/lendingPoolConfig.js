const { newKit } = require("@celo/contractkit");
const LendingPoolAddressesProvider = require("../abi/LendingPoolAddressesProvider.json");
const LendingPool = require("../abi/LendingPool.json");
const LendingPoolDataProvider = require("../abi/LendingPoolDataProvider.json");
const LendingPoolCore = require("../abi/LendingPoolCore.json");
// const AToken = require("../abi/AToken.json");
const BigNumber = require("bignumber.js");
const Promise = require("bluebird");
// utils
const { retry } = require("./functions");

const INTEREST_RATE = {
  NONE: 0,
  STABLE: 1,
  VARIABLE: 2,
  1: "STABLE",
  2: "VARIABLE",
  0: "NONE",
};

const ether = "1000000000000000000";
const ray = "1000000000000000000000000000";
const maxUint256 =
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

function BN(num) {
  return new BigNumber(num);
}

function print(num) {
  return BN(num).dividedBy(ether).toFixed();
}
function printRay(num) {
  return BN(num).dividedBy(ray).toFixed();
}

function printRayRate(num) {
  return BN(num).dividedBy(ray).multipliedBy(BN(100)).toFixed(2) + "%";
}

let kit;
let addressProvider;

// Set server fro kit -> test/main
async function configureKit(env) {
  if (env === "main") {
    console.log("You are using main forno server now!");
    kit = newKit("https://forno.celo.org");
    addressProvider = new kit.web3.eth.Contract(
      LendingPoolAddressesProvider,
      "0x7AAaD5a5fa74Aec83b74C2a098FBC86E17Ce4aEA"
    );
  } else {
    console.log("You are using testing forno server now!");
    kit = newKit("https://alfajores-forno.celo-testnet.org");
    addressProvider = new kit.web3.eth.Contract(
      LendingPoolAddressesProvider,
      "0x6EAE47ccEFF3c3Ac94971704ccd25C7820121483"
    );
  }
}

async function configureLending(env) {
  await configureKit(env);

  const web3 = kit.web3;
  const eth = web3.eth;

  lendingPool = new eth.Contract(
    LendingPool,
    await retry(() => addressProvider.methods.getLendingPool().call())
  );
  
  lendingPoolDataProvider = new eth.Contract(
    LendingPoolDataProvider,
    await retry(() =>
      addressProvider.methods.getLendingPoolDataProvider().call()
    )
  );

  lendingPoolCore = new eth.Contract(
    LendingPoolCore,
    await addressProvider.methods.getLendingPoolCore().call()
  );

  return {
    lendingPool,
    lendingPoolDataProvider,
    addressProvider,
    lendingPoolCore,
    web3,
    eth,
    kit,
  };
}

// Configure Celo/Cusd
async function configureReserve() {
  const cUSD = await retry(() => kit.contracts.getStableToken());
  const CELO = await retry(() => kit.contracts.getGoldToken());
  reserveCelo = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
  reserveCusd = cUSD.address;

  return { reserveCelo, reserveCusd, cUSD, CELO };
}

// Values
exports.INTEREST_RATE = INTEREST_RATE;
exports.ether = ether;
exports.ray = ray;
exports.maxUint256 = maxUint256;

// Functions
exports.BN = BN;
exports.print = print;
exports.printRay = printRay;
exports.printRayRate = printRayRate;
// lendingpool enteties
exports.configureLending = configureLending;
exports.configureReserve = configureReserve;
