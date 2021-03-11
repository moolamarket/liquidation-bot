const { con, query } = require("./connectDB");

async function tableCusd(prefix = '') {
  const sql = `CREATE table ${prefix}cusdPrice (
        id INT NOT NULL,
        price text,
        PRIMARY KEY (id)
    );`;
  await query(sql);
}

async function tableEvents(prefix = '') {
  const sql = `CREATE table ${prefix}events (
        event text
    );`;
  await query(sql);
}

async function tableBlockNumber(prefix = '') {
  const sql = `CREATE table ${prefix}eventsBlockNumber (
        id INT NOT NULL,
        blockNumber text,
        PRIMARY KEY (id)
    );`;
  await query(sql);
}

async function tableUserDebtsOrderedList(prefix = '') {
  const sql = `CREATE table ${prefix}userDebtsOrderedList (
        DepositedCelo text,
        BorrowedCelo text,
        DebtCelo text,
        DepositedCusd text,
        BorrowedCusd text,
        DebtCusd text,
        user VARCHAR(42),
        TotalLiquidity text,
        TotalCollateral text,
        TotalBorrow text,
        AvailableBorrow text,
        TotalFees text,
        LiquidationThreshold text,
        LoanToValue text,
        healthFactor text,
        status VARCHAR(4),
        PRIMARY KEY (user)
    );`;
  await query(sql);
}

async function createTables() {
  await tableCusd();
  await tableEvents();
  await tableBlockNumber();
  await tableUserDebtsOrderedList();
  await tableCusd('TEST_');
  await tableEvents('TEST_');
  await tableBlockNumber('TEST_');
  await tableUserDebtsOrderedList('TEST_');
  con.end();
}

createTables();
