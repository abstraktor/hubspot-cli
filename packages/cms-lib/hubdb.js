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
const { getCwd } = require('@hubspot/cms-lib/path');

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

function withResolvedColumnNames(rows, columns) {
  return rows.map(row => {
    const values = {};

    columns.forEach(col => {
      const { name, id } = col;
      if (typeof row.values[name] !== 'undefined') {
        values[id] = row.values[name];
      } else {
        values[id] = null;
      }
    });

    return {
      childTableId: 0,
      isSoftEditable: false,
      ...row,
      values,
    };
  });
}

async function addRowsToHubDbTable(portalId, tableId, rows, columns) {
  let response;
  const rowsToUpdate = withResolvedColumnNames(rows, columns);
  if (rowsToUpdate.length > 0) {
    response = await createRows(portalId, tableId, rowsToUpdate);
  }

  await publishTable(portalId, tableId);

  return {
    tableId,
    rowCount:
      response && Array.isArray(response) && response.length
        ? response[0].rows.length
        : 0,
  };
}

async function updateRowsOfHubDbTable(portalId, tableId, rows, columns) {
  // resolve column ids with parameter and row ids by fetching rows and comparing the path
  const existingRows = (
    await fetchRows(portalId, tableId /* todo: deal with paging, { offset }*/)
  ).objects;
  const rowIdsByPath = existingRows.reduce(
    (acc, row) => ((acc[row.path] = row.id), acc),
    {}
  );
  const resolvedRows = withResolvedColumnNames(rows, columns).map(row => {
    const pathWithoutTrailingSlash = row.path.endsWith('/')
      ? row.path.slice(0, -1)
      : row.path;
    return {
      id: rowIdsByPath[pathWithoutTrailingSlash],
      ...row,
    };
  });

  // update
  let updateResponse;
  const rowsToUpdate = resolvedRows.filter(row => row.id);
  if (rowsToUpdate.length > 0) {
    updateResponse = await updateRows(portalId, tableId, rowsToUpdate);
  }

  // create
  let createResponse;
  const rowsToCreate = resolvedRows.filter(row => !row.id);
  if (rowsToCreate.length > 0) {
    createResponse = await createRows(portalId, tableId, rowsToCreate);
  }

  // delete
  let deleteResponse;
  const rowsToDelete = existingRows.filter(
    row => !resolvedRows.some(resolvedRow => resolvedRow.id == row.id)
  );
  if (rowsToDelete.length > 0) {
    deleteResponse = await deleteRows(
      portalId,
      tableId,
      rowsToDelete.map(row => row.id)
    );
  }

  const extractCountFromResponse = function(response, accessor) {
    return response && Array.isArray(response) && response.length
      ? accessor(response[0])
      : 0;
  };

  return {
    tableId,
    updateCount: extractCountFromResponse(
      updateResponse,
      respData => respData.rows.length
    ),
    createCount: extractCountFromResponse(
      createResponse,
      respData => respData.rows.length
    ),
    deleteCount: extractCountFromResponse(
      deleteResponse,
      respData => respData.rowIds.length
    ),
  };
}

async function createHubDbTable(portalId, src) {
  validateJsonFile(src);

  const table = fs.readJsonSync(src);
  const { rows, ...schema } = table;
  const { columns, id } = await createTable(portalId, schema);

  return addRowsToHubDbTable(portalId, id, rows, columns);
}

async function updateHubDbTable(portalId, tableId, src) {
  validateJsonFile(src);

  const table = fs.readJsonSync(src);
  const { rows, ...schema } = table;

  return updateTable(portalId, tableId, schema).then(({ columns }) => {
    return updateRowsOfHubDbTable(portalId, tableId, rows, columns);
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
    .filter(column => !column.deleted)
    .map(column => {
      const cleanedColumn = {
        ...column,
      };

      delete cleanedColumn.id;
      delete cleanedColumn.deleted;
      delete cleanedColumn.foreignIdsByName;
      delete cleanedColumn.foreignIdsById;

      return cleanedColumn;
    });

  const cleanedRows = rows.map(row => {
    const values = {};

    columns.forEach(col => {
      const { name, id } = col;
      if (row.values[id] !== null) {
        values[name] = row.values[id];
      }
    });
    return {
      path: row.path,
      name: row.name,
      isSoftEditable: row.isSoftEditable,
      values,
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

async function downloadHubDbTable(portalId, tableId, dest) {
  const table = await fetchTable(portalId, tableId);

  dest = path.resolve(getCwd(), dest || `${table.name}.hubdb.json`);

  if (fs.pathExistsSync(dest)) {
    validateJsonFile(dest);
  } else {
    validateJsonPath(dest);
  }

  let totalRows = null;
  let rows = [];
  let count = 0;
  let offset = 0;
  while (totalRows === null || count < totalRows) {
    const response = await fetchRows(portalId, tableId, { offset });
    if (totalRows === null) {
      totalRows = response.total;
    }

    count += response.objects.length;
    offset += response.objects.length;
    rows = rows.concat(response.objects);
  }

  const tableToWrite = JSON.stringify(convertToJSON(table, rows));
  const tableJson = prettier.format(tableToWrite, {
    parser: 'json',
  });

  await fs.outputFile(dest, tableJson);

  return { filePath: dest };
}

async function clearHubDbTableRows(portalId, tableId) {
  let totalRows = null;
  let rows = [];
  let count = 0;
  let offset = 0;
  while (totalRows === null || count < totalRows) {
    const response = await fetchRows(portalId, tableId, { offset });
    if (totalRows === null) {
      totalRows = response.total;
    }

    count += response.objects.length;
    offset += response.objects.length;
    const rowIds = response.objects.map(row => row.id);
    rows = rows.concat(rowIds);
  }
  return deleteRows(portalId, tableId, rows);
}

module.exports = {
  createHubDbTable,
  downloadHubDbTable,
  clearHubDbTableRows,
  updateHubDbTable,
  addRowsToHubDbTable,
  updateRowsOfHubDbTable,
};
