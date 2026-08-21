const mysql = require('mysql2/promise');
const fs = require('fs');
const { google } = require('googleapis');
require('dotenv').config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'iwantdz_db'
};

// Function to export entire database to JSON and save to iwantdz_db.text
async function exportDatabaseToJson() {
  let connection;
  
  try {
    // Create database connection
    connection = await mysql.createConnection(dbConfig);
    // console.log('Connected to database successfully');
    
    // Get all table names in the database
    const [tables] = await connection.execute('SHOW TABLES');
    const tableNames = tables.map(row => Object.values(row)[0]);
    // console.log(`Found ${tableNames.length} tables in database`);
    
    const databaseData = {};
    
    // Export data from each table
    for (const tableName of tableNames) {
      const [rows] = await connection.execute(`SELECT * FROM ${tableName}`);
      // console.log(`Found ${rows.length} rows in table ${tableName}`);
      
      // Remove sensitive data (password) if table is User
      let safeRows = rows;
      if (tableName === 'User') {
        safeRows = rows.map(row => {
          const { password, ...safeRow } = row;
          return safeRow;
        });
      }
      
      databaseData[tableName] = safeRows;
    }
    
    // Convert to JSON string
    const jsonData = JSON.stringify(databaseData, null, 2);
    
    // Save to iwantdz_db.text file
    fs.writeFileSync('iwantdz_db.text', jsonData, 'utf8');
    // console.log('Database exported to iwantdz_db.text successfully');
    
    // Now export iwantdz_user_tables database
    // console.log('Starting export of iwantdz_user_tables database...');
    
    // Close current connection and create new one for iwantdz_user_tables
    await connection.end();
    
    const userTablesDbConfig = {
      ...dbConfig,
      database: 'iwantdz_user_tables'
    };
    
    const userTablesConnection = await mysql.createConnection(userTablesDbConfig);
    // console.log('Connected to iwantdz_user_tables database successfully');
    
    // Get all table names in iwantdz_user_tables
    const [userTables] = await userTablesConnection.execute('SHOW TABLES');
    const userTableNames = userTables.map(row => Object.values(row)[0]);
    // console.log(`Found ${userTableNames.length} tables in iwantdz_user_tables`);
    
    const userTablesData = {};
    
    // Export data from each table in iwantdz_user_tables
    for (const tableName of userTableNames) {
      const [rows] = await userTablesConnection.execute(`SELECT * FROM ${tableName}`);
      // console.log(`Found ${rows.length} rows in table ${tableName}`);
      userTablesData[tableName] = rows;
    }
    
    // Convert to JSON string
    const userTablesJson = JSON.stringify(userTablesData, null, 2);
    
    // Save to iwantdz_user_tables.text file
    fs.writeFileSync('iwantdz_user_tables.text', userTablesJson, 'utf8');
    // console.log('iwantdz_user_tables exported to iwantdz_user_tables.text successfully');
    
    // Close user tables connection
    await userTablesConnection.end();
    
    return {
      success: true,
      message: 'Both databases exported successfully',
      mainDb: {
        tablesCount: tableNames.length,
        filePath: 'iwantdz_db.text'
      },
      userTablesDb: {
        tablesCount: userTableNames.length,
        filePath: 'iwantdz_user_tables.text'
      }
    };
    
  } catch (error) {
    console.error('Error exporting database:', error);
    return {
      success: false,
      message: 'Failed to export database',
      error: error.message
    };
  }
}

// Function to export iwantdz_db.text to Google Sheets
async function exportToGoogleSheets() {
  try {
    // First export database to JSON to get fresh data
    // console.log('Exporting database to JSON files first...');
    await exportDatabaseToJson();

    // Export iwantdz_db.text
    const jsonData = fs.readFileSync('iwantdz_db.text', 'utf8');
    const databaseData = JSON.parse(jsonData);

    // Print last row of User table from database before export
    if (databaseData.User && databaseData.User.length > 0) {
      const lastUserRow = databaseData.User[databaseData.User.length - 1];
      console.log('📊 Last User row from database BEFORE export:', JSON.stringify(lastUserRow));
    }

    // Google Sheets authentication
    const auth = new google.auth.GoogleAuth({
      keyFile: 'ky.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = '19f6DGtJCUVOwUyY4azxEOUQay8csb6ZxyaXEALkwgro';
    
    // Get existing sheets
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const existingSheets = spreadsheet.data.sheets;

    console.log(`📋 Found ${existingSheets.length} existing sheets in iwantdz_db spreadsheet`);

    // Get table names once
    const tableNames = Object.keys(databaseData);

    // Handle empty spreadsheet (no sheets)
    if (existingSheets.length === 0) {
      console.log('⚠️  Spreadsheet is empty, creating first sheet');
      if (tableNames.length > 0) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: tableNames[0]
                  }
                }
              }
            ]
          }
        });
      }
    } else {
      // Delete all existing sheets except the first one
      for (let i = 1; i < existingSheets.length; i++) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                deleteSheet: {
                  sheetId: existingSheets[i].properties.sheetId
                }
              }
            ]
          }
        });
      }

      // Clear the first sheet using its actual name
      const firstSheetName = existingSheets[0].properties.title;
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${firstSheetName}!A1:Z10000`
      });

      // Rename the first sheet to the first table name
      if (tableNames.length > 0) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                updateSheetProperties: {
                  properties: {
                    sheetId: existingSheets[0].properties.sheetId,
                    title: tableNames[0]
                  },
                  fields: 'title'
                }
              }
            ]
          }
        });
      }
    }
    
    // Add data for each table
    for (let i = 0; i < tableNames.length; i++) {
      const tableName = tableNames[i];
      const tableData = databaseData[tableName];

      if (tableData.length === 0) continue;

      // Get column names from the first row
      const columns = Object.keys(tableData[0]);

      // Create sheet if it doesn't exist (for tables after the first one)
      if (i > 0) {
        // Check if sheet already exists
        const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
        const existingSheets = spreadsheet.data.sheets;
        const sheetExists = existingSheets.some(sheet =>
          sheet.properties.title.toLowerCase() === tableName.toLowerCase()
        );

        if (!sheetExists) {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
              requests: [
                {
                  addSheet: {
                    properties: {
                      title: tableName
                    }
                  }
                }
              ]
            }
          });
        } else {
          // Clear existing sheet instead of creating new one
          console.log(`🗑️  Clearing existing sheet: ${tableName}`);
          await sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: `${tableName}!A1:Z10000`
          });
        }
      }

      // Prepare data for the sheet (headers + rows)
      const sheetData = [columns];
      tableData.forEach(row => {
        const rowData = columns.map(col => row[col] !== null && row[col] !== undefined ? String(row[col]) : '');
        sheetData.push(rowData);
      });

      console.log(`📝 Writing ${sheetData.length} rows to sheet: ${tableName}`);

      // Write data to the sheet
      const updateResult = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tableName}!A1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: sheetData
        }
      });

      console.log(`✅ Exported table ${tableName} to Google Sheets (updated rows: ${updateResult.data.updatedRows})`);

      // Print last row from Google Sheets after export if it's the User table
      if (tableName === 'User') {
        const result = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: 'User!A1:Z10000'
        });
        const rows = result.data.values;
        if (rows && rows.length > 1) {
          const lastRow = rows[rows.length - 1];
          console.log('📊 Last User row from Google Sheets AFTER export:', JSON.stringify(lastRow));
        }
      }
    }
    
    // Now export iwantdz_user_tables.text
    // console.log('Starting export of iwantdz_user_tables.text to Google Sheets...');
    
    const userTablesJson = fs.readFileSync('iwantdz_user_tables.text', 'utf8');
    const userTablesData = JSON.parse(userTablesJson);
    
    const userTablesSpreadsheetId = '1eSzuBpEVG3L-qZOAKskt5y8p94h2Oy_7v_62YwD5oPE';

    console.log(`🔗 Exporting to iwantdz_user_tables spreadsheet: ${userTablesSpreadsheetId}`);

    // Get existing sheets in user tables spreadsheet
    const userSpreadsheet = await sheets.spreadsheets.get({ spreadsheetId: userTablesSpreadsheetId });
    const userExistingSheets = userSpreadsheet.data.sheets;

    console.log(`📋 Found ${userExistingSheets.length} existing sheets in iwantdz_user_tables spreadsheet`);

    // Get table names once
    const userTableNames = Object.keys(userTablesData);

    // Handle empty spreadsheet (no sheets)
    if (userExistingSheets.length === 0) {
      console.log('⚠️  User tables spreadsheet is empty, creating first sheet');
      if (userTableNames.length > 0) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: userTablesSpreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: userTableNames[0]
                  }
                }
              }
            ]
          }
        });
      }
    } else {
      // Delete all existing sheets except the first one
      for (let i = 1; i < userExistingSheets.length; i++) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: userTablesSpreadsheetId,
          requestBody: {
            requests: [
              {
                deleteSheet: {
                  sheetId: userExistingSheets[i].properties.sheetId
                }
              }
            ]
          }
        });
      }

      // Clear the first sheet using its actual name
      const userFirstSheetName = userExistingSheets[0].properties.title;
      await sheets.spreadsheets.values.clear({
        spreadsheetId: userTablesSpreadsheetId,
        range: `${userFirstSheetName}!A1:Z10000`
      });

      // Rename the first sheet to the first table name
      if (userTableNames.length > 0) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: userTablesSpreadsheetId,
          requestBody: {
            requests: [
              {
                updateSheetProperties: {
                  properties: {
                    sheetId: userExistingSheets[0].properties.sheetId,
                    title: userTableNames[0]
                  },
                  fields: 'title'
                }
              }
            ]
          }
        });
      }
    }

    // Add data for each user table
    for (let i = 0; i < userTableNames.length; i++) {
      const tableName = userTableNames[i];
      const tableData = userTablesData[tableName];
      
      if (tableData.length === 0) continue;
      
      // Get column names from the first row
      const columns = Object.keys(tableData[0]);
      
      // Create sheet if it doesn't exist (for tables after the first one)
      if (i > 0) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: userTablesSpreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: tableName
                  }
                }
              }
            ]
          }
        });
      }
      
      // Prepare data for the sheet (headers + rows)
      const sheetData = [columns];
      tableData.forEach(row => {
        const rowData = columns.map(col => row[col] !== null && row[col] !== undefined ? String(row[col]) : '');
        sheetData.push(rowData);
      });
      
      // Write data to the sheet
      await sheets.spreadsheets.values.update({
        spreadsheetId: userTablesSpreadsheetId,
        range: `${tableName}!A1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: sheetData
        }
      });
      
      // console.log(`Exported user table ${tableName} to Google Sheets`);
    }
    
    return {
      success: true,
      message: 'Both databases exported to Google Sheets successfully',
      mainDb: {
        tablesCount: tableNames.length,
        spreadsheetId: spreadsheetId
      },
      userTablesDb: {
        tablesCount: userTableNames.length,
        spreadsheetId: userTablesSpreadsheetId
      }
    };
    
  } catch (error) {
    console.error('Error exporting to Google Sheets:', error);
    return {
      success: false,
      message: 'Failed to export to Google Sheets',
      error: error.message
    };
  }
}

// Function to import Google Sheets to JSON files
async function importFromGoogleSheets() {
  try {
    // Google Sheets authentication
    const auth = new google.auth.GoogleAuth({
      keyFile: 'ky.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    
    const sheets = google.sheets({ version: 'v4', auth });
    
    // Import from api_iwantdz_db
    // console.log('Starting import from api_iwantdz_db...');
    const mainSpreadsheetId = '19f6DGtJCUVOwUyY4azxEOUQay8csb6ZxyaXEALkwgro';
    
    // Get all sheets in the spreadsheet
    const mainSpreadsheet = await sheets.spreadsheets.get({ spreadsheetId: mainSpreadsheetId });
    const mainSheets = mainSpreadsheet.data.sheets;
    
    const mainDbData = {};
    
    // Read data from each sheet
    for (const sheet of mainSheets) {
      const sheetTitle = sheet.properties.title;
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: mainSpreadsheetId,
        range: `${sheetTitle}!A:Z`
      });
      
      const values = response.data.values;
      if (values && values.length > 0) {
        const headers = values[0];
        const rows = [];
        
        for (let i = 1; i < values.length; i++) {
          const row = {};
          for (let j = 0; j < headers.length; j++) {
            row[headers[j]] = values[i][j] || '';
          }
          rows.push(row);
        }
        
        mainDbData[sheetTitle] = rows;
        // console.log(`Imported ${rows.length} rows from sheet ${sheetTitle}`);
      }
    }
    
    // Save to iwantdz_db.text
    const mainDbJson = JSON.stringify(mainDbData, null, 2);
    fs.writeFileSync('iwantdz_db.text', mainDbJson, 'utf8');
    // console.log('api_iwantdz_db imported to iwantdz_db.text successfully');
    
    // Import from api_iwantdz_user_tables
    // console.log('Starting import from api_iwantdz_user_tables...');
    const userTablesSpreadsheetId = '1eSzuBpEVG3L-qZOAKskt5y8p94h2Oy_7v_62YwD5oPE';
    
    // Get all sheets in the spreadsheet
    const userSpreadsheet = await sheets.spreadsheets.get({ spreadsheetId: userTablesSpreadsheetId });
    const userSheets = userSpreadsheet.data.sheets;
    
    const userTablesData = {};
    
    // Read data from each sheet
    for (const sheet of userSheets) {
      const sheetTitle = sheet.properties.title;
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: userTablesSpreadsheetId,
        range: `${sheetTitle}!A:Z`
      });
      
      const values = response.data.values;
      if (values && values.length > 0) {
        const headers = values[0];
        const rows = [];
        
        for (let i = 1; i < values.length; i++) {
          const row = {};
          for (let j = 0; j < headers.length; j++) {
            row[headers[j]] = values[i][j] || '';
          }
          rows.push(row);
        }
        
        userTablesData[sheetTitle] = rows;
        // console.log(`Imported ${rows.length} rows from user table sheet ${sheetTitle}`);
      }
    }
    
    // Save to iwantdz_user_tables.text
    const userTablesJson = JSON.stringify(userTablesData, null, 2);
    fs.writeFileSync('iwantdz_user_tables.text', userTablesJson, 'utf8');
    // console.log('api_iwantdz_user_tables imported to iwantdz_user_tables.text successfully');
    
    return {
      success: true,
      message: 'Both Google Sheets imported to JSON files successfully',
      mainDb: {
        tablesCount: Object.keys(mainDbData).length,
        filePath: 'iwantdz_db.text'
      },
      userTablesDb: {
        tablesCount: Object.keys(userTablesData).length,
        filePath: 'iwantdz_user_tables.text'
      }
    };
    
  } catch (error) {
    console.error('Error importing from Google Sheets:', error);
    return {
      success: false,
      message: 'Failed to import from Google Sheets',
      error: error.message
    };
  }
}

// Function to convert ISO 8601 date to MySQL DATETIME format
function convertISOToMySQLDate(isoDate) {
  if (!isoDate || typeof isoDate !== 'string' || isoDate.trim() === '') return null;
  
  // Check if it's already in ISO format
  if (isoDate.includes('T') && isoDate.includes('Z')) {
    const date = new Date(isoDate);
    // Format: YYYY-MM-DD HH:MM:SS
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
  
  return isoDate;
}

// Function to convert date values in a row
// FIX: empty strings / null / undefined are now explicitly converted to NULL
// instead of being silently skipped (which used to leave '' in place and
// caused "Incorrect datetime value: ''" errors on INSERT).
function convertDatesInRow(row, dateColumns) {
  const convertedRow = { ...row };
  for (const col of dateColumns) {
    const value = convertedRow[col];

    if (value === '' || value === null || value === undefined) {
      convertedRow[col] = null;
      continue;
    }

    const converted = convertISOToMySQLDate(value);
    convertedRow[col] = converted !== null ? converted : null;
  }
  return convertedRow;
}

// Function to import JSON files to MySQL databases
async function importJsonToMySQL() {
  let connection;
  let userTablesConnection;
  
  try {
    // Create connection without database to check/create databases
    const baseConfig = {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || ''
    };
    
    const baseConnection = await mysql.createConnection(baseConfig);
    // console.log('Connected to MySQL server successfully');
    
    // Check and create iwantdz_db if not exists
    await baseConnection.query(`CREATE DATABASE IF NOT EXISTS iwantdz_db`);
    // console.log('Database iwantdz_db checked/created');
    
    // Check and create iwantdz_user_tables if not exists
    await baseConnection.query(`CREATE DATABASE IF NOT EXISTS iwantdz_user_tables`);
    // console.log('Database iwantdz_user_tables checked/created');
    
    await baseConnection.end();
    
    // Read iwantdz_db.text
    // console.log('Starting import of iwantdz_db.text to MySQL...');
    const mainDbJson = fs.readFileSync('iwantdz_db.text', 'utf8');
    const mainDbData = JSON.parse(mainDbJson);
    
    // Create connection to iwantdz_db
    connection = await mysql.createConnection(dbConfig);
    // console.log('Connected to iwantdz_db successfully');
    
    // Import each table
    for (const tableName of Object.keys(mainDbData)) {
      const tableData = mainDbData[tableName];
      
      // Skip lowercase 'user' table - only use 'User' table
      if (tableName === 'user') {
        console.log(`⏭️  Skipping table '${tableName}' - using 'User' table instead`);
        continue;
      }
      
      if (tableData.length === 0) continue;
      
      // Get column names from first row
      const columns = Object.keys(tableData[0]);
      
      // Identify date columns
      const dateColumns = columns.filter(col => 
        ['dateTime', 'OrderExpired', 'date', 'Lastupdate', 'notificationStart', 'notificationEnd', 'createdAt', 'lastSeen', 'connectionTime'].includes(col)
      );
      
      // Check if table exists
      const [tables] = await connection.query(`SHOW TABLES LIKE '${tableName}'`);
      
      if (tables.length === 0) {
        // Create table with inferred schema
        // console.log(`Creating table ${tableName}...`);
        const columnDefs = columns.map(col => {
          // Detect column type based on column name and data
          if (col === 'id') {
            return `\`${col}\` INT AUTO_INCREMENT PRIMARY KEY`;
          } else if (col === 'OrderIndex' || col === 'OrderPosision') {
            return `\`${col}\` TEXT`;
          } else if (col === 'password') {
            return `\`${col}\` VARCHAR(255)`;
          } else if (col === 'dateTime' || col === 'date' || col === 'Lastupdate') {
            return `\`${col}\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP`;
          } else if (col === 'OrderExpired' || col === 'notificationStart' || col === 'notificationEnd' || col === 'createdAt' || col === 'lastSeen' || col === 'connectionTime') {
            return `\`${col}\` DATETIME NULL`;
          } else {
            return `\`${col}\` TEXT`;
          }
        }).join(', ');
        await connection.query(`CREATE TABLE \`${tableName}\` (${columnDefs})`);
      } else {
        // Drop existing table and recreate with correct schema
        // console.log(`Dropping and recreating table ${tableName}...`);
        await connection.query(`DROP TABLE \`${tableName}\``);
        const columnDefs = columns.map(col => {
          // Detect column type based on column name and data
          if (col === 'id') {
            return `\`${col}\` INT AUTO_INCREMENT PRIMARY KEY`;
          } else if (col === 'OrderIndex' || col === 'OrderPosision') {
            return `\`${col}\` TEXT`;
          } else if (col === 'password') {
            return `\`${col}\` VARCHAR(255)`;
          } else if (col === 'dateTime' || col === 'date' || col === 'Lastupdate') {
            return `\`${col}\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP`;
          } else if (col === 'OrderExpired' || col === 'notificationStart' || col === 'notificationEnd' || col === 'createdAt' || col === 'lastSeen' || col === 'connectionTime') {
            return `\`${col}\` DATETIME NULL`;
          } else {
            return `\`${col}\` TEXT`;
          }
        }).join(', ');
        await connection.query(`CREATE TABLE \`${tableName}\` (${columnDefs})`);
      }
      
      // Clear existing data
      await connection.query(`DELETE FROM \`${tableName}\``);
      
      // Insert data
      // console.log(`Inserting ${tableData.length} rows into table ${tableName}...`);
      for (const row of tableData) {
        // Convert date columns
        const convertedRow = convertDatesInRow(row, dateColumns);
        
        const cols = Object.keys(convertedRow);
        const values = Object.values(convertedRow);
        const placeholders = values.map(() => '?').join(', ');
        const escapedCols = cols.map(col => `\`${col}\``).join(', ');
        await connection.query(
          `INSERT INTO \`${tableName}\` (${escapedCols}) VALUES (${placeholders})`,
          values
        );
      }
      
      // console.log(`Imported table ${tableName} successfully`);
    }
    
    await connection.end();
    
    // Read iwantdz_user_tables.text
    // console.log('Starting import of iwantdz_user_tables.text to MySQL...');
    const userTablesJson = fs.readFileSync('iwantdz_user_tables.text', 'utf8');
    const userTablesData = JSON.parse(userTablesJson);
    
    // Create connection to iwantdz_user_tables
    const userTablesDbConfig = {
      ...dbConfig,
      database: 'iwantdz_user_tables'
    };
    
    userTablesConnection = await mysql.createConnection(userTablesDbConfig);
    // console.log('Connected to iwantdz_user_tables successfully');
    
    // Import each user table
    for (const tableName of Object.keys(userTablesData)) {
      const tableData = userTablesData[tableName];
      
      if (tableData.length === 0) continue;
      
      // Get column names from first row
      const columns = Object.keys(tableData[0]);
      
      // Identify date columns
      const dateColumns = columns.filter(col => 
        ['dateTime', 'OrderExpired', 'date', 'Lastupdate', 'notificationStart', 'notificationEnd', 'createdAt', 'lastSeen', 'connectionTime'].includes(col)
      );
      
      // Check if table exists
      const [tables] = await userTablesConnection.query(`SHOW TABLES LIKE '${tableName}'`);
      
      if (tables.length === 0) {
        // Create table with inferred schema
        // console.log(`Creating user table ${tableName}...`);
        const columnDefs = columns.map(col => {
          // Detect column type based on column name and data
          if (col === 'id') {
            return `\`${col}\` INT AUTO_INCREMENT PRIMARY KEY`;
          } else if (col === 'OrderIndex' || col === 'OrderPosision') {
            return `\`${col}\` TEXT`;
          } else if (col === 'password') {
            return `\`${col}\` VARCHAR(255)`;
          } else if (col === 'dateTime' || col === 'date' || col === 'Lastupdate') {
            return `\`${col}\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP`;
          } else if (col === 'OrderExpired' || col === 'notificationStart' || col === 'notificationEnd' || col === 'createdAt' || col === 'lastSeen' || col === 'connectionTime') {
            return `\`${col}\` DATETIME NULL`;
          } else {
            return `\`${col}\` TEXT`;
          }
        }).join(', ');
        await userTablesConnection.query(`CREATE TABLE \`${tableName}\` (${columnDefs})`);
      } else {
        // Drop existing table and recreate with correct schema
        // console.log(`Dropping and recreating user table ${tableName}...`);
        await userTablesConnection.query(`DROP TABLE \`${tableName}\``);
        const columnDefs = columns.map(col => {
          // Detect column type based on column name and data
          if (col === 'id') {
            return `\`${col}\` INT AUTO_INCREMENT PRIMARY KEY`;
          } else if (col === 'OrderIndex' || col === 'OrderPosision') {
            return `\`${col}\` TEXT`;
          } else if (col === 'password') {
            return `\`${col}\` VARCHAR(255)`;
          } else if (col === 'dateTime' || col === 'date' || col === 'Lastupdate') {
            return `\`${col}\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP`;
          } else if (col === 'OrderExpired' || col === 'notificationStart' || col === 'notificationEnd' || col === 'createdAt' || col === 'lastSeen' || col === 'connectionTime') {
            return `\`${col}\` DATETIME NULL`;
          } else {
            return `\`${col}\` TEXT`;
          }
        }).join(', ');
        await userTablesConnection.query(`CREATE TABLE \`${tableName}\` (${columnDefs})`);
      }
      
      // Clear existing data
      await userTablesConnection.query(`DELETE FROM \`${tableName}\``);
      
      // Insert data
      // console.log(`Inserting ${tableData.length} rows into user table ${tableName}...`);
      for (const row of tableData) {
        // Convert date columns
        const convertedRow = convertDatesInRow(row, dateColumns);
        
        const cols = Object.keys(convertedRow);
        const values = Object.values(convertedRow);
        const placeholders = values.map(() => '?').join(', ');
        const escapedCols = cols.map(col => `\`${col}\``).join(', ');
        await userTablesConnection.query(
          `INSERT INTO \`${tableName}\` (${escapedCols}) VALUES (${placeholders})`,
          values
        );
      }
      
      // console.log(`Imported user table ${tableName} successfully`);
    }
    
    await userTablesConnection.end();
    
    return {
      success: true,
      message: 'Both JSON files imported to MySQL databases successfully',
      mainDb: {
        tablesCount: Object.keys(mainDbData).length,
        database: 'iwantdz_db'
      },
      userTablesDb: {
        tablesCount: Object.keys(userTablesData).length,
        database: 'iwantdz_user_tables'
      }
    };
    
  } catch (error) {
    console.error('Error importing JSON to MySQL:', error);
    if (connection) await connection.end();
    if (userTablesConnection) await userTablesConnection.end();
    return {
      success: false,
      message: 'Failed to import JSON to MySQL', 
      error: error.message
    };
  }
}

module.exports = { exportDatabaseToJson, exportToGoogleSheets, importFromGoogleSheets, importJsonToMySQL };