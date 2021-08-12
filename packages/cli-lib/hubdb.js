const path = require('path');
const fs = require('fs-extra');
const prettier = require('prettier');

const {
  createTable,
  updateTable,
  createRows,
  updateRows,
  fetchTable,
  fetchRows,
  publishTable,
  deleteRows,
} = require('./api/hubdb');
const { getCwd } = require('./path');

function validateJsonPath(src) {
  if (path.extname(src) !== '.json') {
    throw new Error('The HubDB table file must be a ".json" file');
  }
}

function validateJsonFile(src) {
  try {
    const stats = fs.statSync(src);
    if (!stats.isFile()) {
      throw new Error(`The "${src}" path is not a path to a file`);
    }
  } catch (e) {
    throw new Error(`The "${src}" path is not a path to a file`);
  }

  validateJsonPath(src);
}

async function addRowsToHubDbTable(accountId, tableId, rows) {
  if (rows.length > 0) {
    await createRows(accountId, tableId, rows);
  }

  const { rowCount } = await publishTable(accountId, tableId);

  return {
    tableId,
    rowCount,
  };
}

async function updateRowsOfHubDbTable(accountId, tableId, rows) {
  // resolve column ids with parameter and row ids by fetching rows and comparing the path
  const existingRows = (
    await fetchRows(accountId, tableId /* todo: deal with paging, { offset }*/)
  ).results;
  const rowIdsByPath = existingRows.reduce(
    (acc, row) => ((acc[row.path] = row.id), acc),
    {}
  );
  const resolvedRows = rows.map(row => {
    const pathWithoutTrailingSlash = row.path.endsWith('/')
      ? row.path.slice(0, -1)
      : row.path;
    return {
      id: rowIdsByPath[pathWithoutTrailingSlash.toLowerCase()],
      ...row,
    };
  });

  // update
  let updateResponse;
  const rowsToUpdate = resolvedRows.filter(row => row.id);
  if (rowsToUpdate.length > 0) {
    updateResponse = await updateRows(accountId, tableId, {
      inputs: rowsToUpdate,
    });
  }

  // create
  let createResponse;
  const rowsToCreate = resolvedRows.filter(row => !row.id);
  if (rowsToCreate.length > 0) {
    createResponse = await createRows(accountId, tableId, rowsToCreate);
  }

  // delete
  let deleteResponse;
  const rowsToDelete = existingRows.filter(
    row => !resolvedRows.some(resolvedRow => resolvedRow.id == row.id)
  );
  if (rowsToDelete.length > 0) {
    deleteResponse = await deleteRows(
      accountId,
      tableId,
      rowsToDelete.map(row => row.id)
    );
  }

  const extractCountFromResponse = function(response, accessor) {
    return response && Array.isArray(accessor(response))
      ? accessor(response).length
      : 0;
  };

  const extractErrorsFromResponse = function(response) {
    return response && Array.isArray(response) ? response.slice(1) : [];
  };

  return {
    tableId,
    updateCount: extractCountFromResponse(updateResponse, it => it.results),
    plannedUpdates: rowsToUpdate.length,

    createCount: extractCountFromResponse(createResponse, it => it.results),
    plannedCreations: rowsToCreate.length,
    deleteCount: extractCountFromResponse(deleteResponse, it => it.rowIds),
    plannedDeletions: rowsToDelete.length,

    errors: extractErrorsFromResponse(updateResponse)
      .concat(extractErrorsFromResponse(createResponse))
      .concat(extractErrorsFromResponse(deleteResponse)),
  };
}

async function createHubDbTable(accountId, src) {
  validateJsonFile(src);

  const table = fs.readJsonSync(src);
  const { rows, ...schema } = table;
  const { id } = await createTable(accountId, schema);

  return addRowsToHubDbTable(accountId, id, rows);
}

async function updateHubDbTable(accountId, tableId, src) {
  validateJsonFile(src);

  const table = fs.readJsonSync(src);
  const { rows, ...schema } = table;

  return updateTable(accountId, tableId, schema).then(() => {
    return updateRowsOfHubDbTable(accountId, tableId, rows);
  });
}

function convertToJSON(table, rows) {
  const {
    allowChildTables,
    allowPublicApiAccess,
    columns,
    dynamicMetaTags,
    enableChildTablePages,
    label,
    name,
    useForPages,
  } = table;

  const cleanedColumns = columns
    .filter(column => !column.deleted || !column.archived)
    .map(column => {
      const cleanedColumn = {
        ...column,
      };

      delete cleanedColumn.id;
      delete cleanedColumn.deleted;
      delete cleanedColumn.archived;
      delete cleanedColumn.foreignIdsByName;
      delete cleanedColumn.foreignIdsById;

      return cleanedColumn;
    });

  const cleanedRows = rows.map(row => {
    return {
      path: row.path,
      name: row.name,
      values: row.values,
    };
  });

  return {
    name,
    useForPages,
    label,
    allowChildTables,
    allowPublicApiAccess,
    dynamicMetaTags,
    enableChildTablePages,
    columns: cleanedColumns,
    rows: cleanedRows,
  };
}

async function fetchAllRows(accountId, tableId) {
  let rows = [];
  let after = null;
  do {
    const { paging, results } = await fetchRows(
      accountId,
      tableId,
      after ? { after } : null
    );

    rows = rows.concat(results);
    after = paging && paging.next ? paging.next.after : null;
  } while (after !== null);

  return rows;
}

async function downloadHubDbTable(accountId, tableId, dest) {
  const table = await fetchTable(accountId, tableId);

  dest = path.resolve(getCwd(), dest || `${table.name}.hubdb.json`);

  if (fs.pathExistsSync(dest)) {
    validateJsonFile(dest);
  } else {
    validateJsonPath(dest);
  }

  const rows = await fetchAllRows(accountId, tableId);
  const tableToWrite = JSON.stringify(convertToJSON(table, rows));
  const tableJson = prettier.format(tableToWrite, {
    parser: 'json',
  });

  await fs.outputFile(dest, tableJson);

  return { filePath: dest };
}

async function clearHubDbTableRows(accountId, tableId) {
  const rows = await fetchAllRows(accountId, tableId);
  await deleteRows(
    accountId,
    tableId,
    rows.map(row => row.id)
  );

  return {
    deletedRowCount: rows.length,
  };
}

module.exports = {
  createHubDbTable,
  downloadHubDbTable,
  clearHubDbTableRows,
  updateHubDbTable,
  addRowsToHubDbTable,
  updateRowsOfHubDbTable,
};
