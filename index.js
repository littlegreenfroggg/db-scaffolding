const fs = require("fs-extra");
const db = require("./database");
const path = require("path");
const write = require("write");
const testing = require("./testing");

const model_folder = path.resolve(__dirname, "model");
const repository_folder = path.resolve(__dirname, "repository");
const infra_folder = path.resolve(__dirname, "infrastructure");
const dbfilename = path.resolve(infra_folder, "database.js");
const dbrelative = "../infrastructure/database";
console.log(dbrelative);
const schemaName = "easymarketingdemo";

async function GetTables(dbname) {
  var sql = `SELECT * FROM  INFORMATION_SCHEMA.PARTITIONS
WHERE TABLE_SCHEMA = ?`;
  return await db.GetConnection().query(sql, [dbname]);
}

async function GetColumnInfo(tablename, dbname) {
  var sql = `SELECT *
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE table_name = ?
  AND table_schema = ?`;

  return await db.GetConnection().query(sql, [tablename, dbname]);
}

async function WriteDatabaseJs(host, user, db) {
  console.log(host, user, db);
  var content = `const mysql = require("mysql2");

const pool = mysql.createPool({
    host: '{host}',
    user: '{user}',
    database: '{db}',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });


  exports.GetConnection = function() {
    return pool.promise();
  }`;

  content = content.replace(/{host}/g, host);
  content = content.replace(/{user}/g, user);
  content = content.replace(/{db}/g, db);

  await fs.ensureDir(infra_folder);
  await fs.remove(dbfilename);
  write.sync(dbfilename, content, { overwrite: true });

  return;
}

async function WriteDataModelJs(tablename, columns) {
  var filename = path.resolve(model_folder, tablename + ".js");
  await fs.ensureDir(model_folder);
  await fs.remove(filename);

  var content = "class " + tablename.toUpperCase() + " {\n";
  content += "\n";
  content += "\n";

  for (j = 0; j < columns.length; j++) {
    content += columns[j].COLUMN_NAME;
    content +=
      "; // " + columns[j].DATA_TYPE + ", nullable: " + columns[j].IS_NULLABLE;
    content += "\n\n";
  }

  content += "\n";
  content += "}\n";
  write.sync(filename, content, { overwrite: true });

  return;
}

async function GenerateGetAllContent(tablename, columns, primarykeys) {
  var getall = "const db = require('" + dbrelative + "');\n\n";
  getall += "exports.GetAll = async function() {\n";
  getall += "var sql = `";
  getall += "SELECT * FROM \\`" + tablename + "\\``;";
  getall += "\n\n";
  getall += "var results = await db.GetConnection().query(sql);\n\n";
  getall += "return results;";
  getall += "\n";
  getall += "}\n\n";
  return getall;
}

async function GenerateInsertContent(tablename, columns, primarykeys) {
  var insert = "exports.Insert = async function(data) {\n";
  insert += "var sql = `";
  insert += "INSERT INTO \\`" + tablename + "\\` (\n";

  for (var tmp = 0; tmp < columns.length; tmp++) {
    if (tmp != 0) {
      insert += ", ";
    }

    insert += "\\`" + columns[tmp].COLUMN_NAME + "\\`\n";
  }

  insert += ") VALUES (";
  var params = ", ?".repeat(columns.length);
  params = params.substr(1);
  insert += params;
  insert += ")`;\n\n";
  insert += "var results = await db.GetConnection().execute(sql, [\n";

  for (var tmp = 0; tmp < columns.length; tmp++) {
    if (tmp != 0) {
      insert += ", ";
    }

    insert += "data." + columns[tmp].COLUMN_NAME + "\n";
  }

  insert += "]);\n\n";
  insert += "return results;\n";
  insert += "}\n\n";

  return insert;
}

async function GenerateUpdateContent(tablename, columns, primarykeys) {
  var update = "exports.Update = async function(data) {\n";
  update += "var sql = `UPDATE \\`" + tablename + "\\` SET \n";
  for (var tmp = 0; tmp < columns.length; tmp++) {
    if (tmp != 0) {
      update += ", ";
    }
    update += "\\`" + columns[tmp].COLUMN_NAME + "\\` = ?\n";
  }
  update += "WHERE {primarykeyswhere}`;\n\n";
  update +=
    "var results = await db.GetConnection().execute(sql, {params});\n\n";
  update += "return results;\n";
  update += "}\n\n";
  var primarykeysstr = primarykeys.join(", ");
  var primarykeyswhere = "";
  for (var tmp = 0; tmp < primarykeys.length; tmp++) {
    if (tmp != 0) {
      primarykeyswhere += " AND ";
    }

    primarykeyswhere += "\\`" + primarykeys[tmp] + "\\` = ?\n";
  }
  params = "[\n";
  for (var tmp = 0; tmp < columns.length; tmp++) {
    if (tmp != 0) {
      params += ", ";
    }
    params += "data." + columns[tmp].COLUMN_NAME + "\n";
  }
  for (var tmp = 0; tmp < primarykeys.length; tmp++) {
    params += ", data." + primarykeys[tmp] + "\n";
  }
  params += "]";

  update = update.replace(/{primarykeys}/g, primarykeysstr);
  update = update.replace(/{primarykeyswhere}/g, primarykeyswhere);
  update = update.replace(/{params}/g, params);
  return update;
}

async function GenerateGetSingleContent(tablename, columns, primarykeys) {
  var primarykeysstr = primarykeys.join(", ");
  var primarykeyswhere = "";
  for (var tmp = 0; tmp < primarykeys.length; tmp++) {
    if (tmp != 0) {
      primarykeyswhere += " AND ";
    }

    primarykeyswhere += "\\`" + primarykeys[tmp] + "\\` = ?\n";
  }
  var getbyid = "exports.GetSingle = async function({primarykeys}) {\n";
  getbyid +=
    "var sql = `SELECT * FROM \\`" +
    tablename +
    "\\` WHERE {primarykeyswhere}`;\n\n";
  getbyid += "var results = await db.GetConnection().query(sql, {params});\n\n";
  getbyid += "return results;\n";
  getbyid += "}\n\n";
  getbyid = getbyid.replace(/{primarykeys}/g, primarykeysstr);
  getbyid = getbyid.replace(/{primarykeyswhere}/g, primarykeyswhere);
  params = "[\n";
  for (var tmp = 0; tmp < primarykeys.length; tmp++) {
    if (tmp != 0) {
      params += ", ";
    }
    params += "data." + primarykeys[tmp] + "\n";
  }
  params += "]";
  getbyid = getbyid.replace(/{params}/g, params);
  return getbyid;
}

async function WriteRepositoryJs(tablename, columns) {
  var filename = path.resolve(repository_folder, tablename + "_repository.js");
  await fs.ensureDir(repository_folder);
  await fs.remove(filename);
  var primarykeys = [];
  for (var tmp = 0; tmp < columns.length; tmp++) {
    if (columns[tmp].COLUMN_KEY == "PRI") {
      primarykeys.push(columns[tmp].COLUMN_NAME);
    }
  }

  var getall = await GenerateGetAllContent(tablename, columns, primarykeys);
  var insert = await GenerateInsertContent(tablename, columns, primarykeys);
  var update = await GenerateUpdateContent(tablename, columns, primarykeys);
  var getbyid = await GenerateGetSingleContent(tablename, columns, primarykeys);

  write.sync(filename, getall + insert + update + getbyid, { overwrite: true });
}

async function Generate(host, user, dbname) {
  await WriteDatabaseJs(host, user, dbname);
  var tables = (await GetTables(schemaName))[0];
  if (tables && tables.length > 0) {
    for (i = 0; i < tables.length; i++) {
      var columns = await GetColumnInfo(tables[i].TABLE_NAME, schemaName);
      await WriteDataModelJs(tables[i].TABLE_NAME, columns[0]);
      await WriteRepositoryJs(tables[i].TABLE_NAME, columns[0]);
    }
  }
  await testing.Get10Orders();
  return;
}

Generate('localhost', 'root', 'easymarketingdemo');
