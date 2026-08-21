const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const { exec } = require('child_process');
const { spawn } = require('child_process');
require('dotenv').config();
const { exportDatabaseToJson, exportToGoogleSheets, importFromGoogleSheets, importJsonToMySQL } = require('./GExel');

const app = express();
const PORT = process.env.PORT || 3000;

// Check and configure MySQL on startup
const checkAndConfigureMySQL = async () => {
  console.log('🔍 Checking MySQL status...');

  // Skip auto-installation on Windows
  if (process.platform === 'win32') {
    console.log('ℹ️  Windows detected - skipping MySQL auto-installation');
    console.log('ℹ️  Please ensure MySQL is installed and running');
    return;
  }

  // Try different methods to check/start MySQL
  const whichResult = await execPromise('which mysql');
  if (whichResult.error) {
    console.log('⚠️  MySQL is not installed on this system');
    console.log('📦 Attempting to install MySQL automatically...');
    console.log('⏳ This may take a few minutes, please wait...');
    
    // Install MySQL automatically using spawn for better progress tracking
    try {
      await spawnPromise('sudo', ['apt-get', 'update']);
      console.log('✅ Package list updated');
      
      await spawnPromise('sudo', ['apt-get', 'install', '-y', 'mysql-server']);
      console.log('✅ MySQL installed successfully');
      
      // Start MySQL after installation
      await startMySQL();
    } catch (installError) {
      console.error('❌ Failed to install MySQL automatically:', installError);
      console.log('ℹ️  Server will continue running without MySQL');
      console.log('ℹ️  You can install MySQL manually or use Docker');
    }
  } else {
    // MySQL is installed, try to check status
    await startMySQL();
  }
};

// Helper function to execute commands with promises
const execPromise = (command) => {
  return new Promise((resolve) => {
    exec(command, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
};

// Helper function to spawn commands with promises and timeout
const spawnPromise = (command, args, timeoutMs = 30000) => {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args);
    let output = '';
    
    process.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      output += data.toString();
    });
    
    // Add timeout
    const timeout = setTimeout(() => {
      process.kill();
      reject(new Error(`Command timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    
    process.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Command failed with code ${code}: ${output}`));
      }
    });
  });
};

const startMySQL = async () => {
  const statusResult = await execPromise('sudo service mysql status');
  if (statusResult.error) {
    console.log('⚠️  MySQL is not running. Attempting to start...');
    
    // Try service command first
    const startResult = await execPromise('sudo service mysql start');
    if (startResult.error) {
      // If service command fails, try mysqld_safe
      console.log('⚠️  service command failed, trying mysqld_safe...');
      const safeResult = await execPromise('mysqld_safe --user=mysql &');
      if (safeResult.error) {
        console.log('⚠️  Could not start MySQL automatically');
        console.log('ℹ️  Server will continue running without MySQL');
        console.log('ℹ️  Please start MySQL manually if needed');
        return;
      }
      console.log('✅ MySQL started via mysqld_safe');
      await configureMySQL();
    } else {
      console.log('✅ MySQL started successfully via service');
      await configureMySQL();
    }
  } else {
    console.log('✅ MySQL is already running');
    await configureMySQL();
  }
};

const configureMySQL = async () => {
  // Wait a bit for MySQL to be fully ready
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Configure MySQL root password
  console.log('🔧 Configuring MySQL root password...');
  const configResult = await execPromise('sudo mysql -e "ALTER USER \'root\'@\'localhost\' IDENTIFIED WITH mysql_native_password BY \'root\'; FLUSH PRIVILEGES;"');
  if (configResult.error) {
    console.log('⚠️  Could not configure MySQL password (may already be configured)');
  } else {
    console.log('✅ MySQL password configured successfully');
  }

  // Skip start.sh script since it would cause an infinite loop
  // start.sh contains 'node server.js' which would restart the server
  console.log('⏭️  Skipping start.sh to avoid infinite loop');

  // Import from Google Sheets after MySQL is configured
  await new Promise(resolve => setTimeout(resolve, 2000));
  console.log('📥 Importing data from Google Sheets...');
  try {
    await importFromGoogleSheets();
    console.log('✅ Import from Google Sheets completed');
  } catch (importError) {
    console.log('⚠️  Import from Google Sheets failed:', importError.message);
  }
};

// Run MySQL check on startup, then start server
(async () => {
  // Skip automatic MySQL installation in Codespaces - use Docker instead
  // await checkAndConfigureMySQL();
  
  // Wait for MySQL to start up (important for Docker MySQL)
  console.log('⏳ Waiting for MySQL to start up...');
  await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second delay
  console.log('✅ MySQL startup delay completed');
  
  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Log all incoming requests (simplified)
  app.use((req, res, next) => {
    console.log(`📡 ${req.method} ${req.url}`);
    next();
  });

  // MySQL Database Connection for main database
let db = null;

// Try to connect to main database, but continue if it fails
const initializeMainDb = () => {
  return new Promise((resolve) => {
    // First try to connect without database to create it if needed
    const tempDb = mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      port: process.env.DB_PORT || 3306
    });
    
    tempDb.connect((err) => {
      if (err) {
        console.warn('⚠️  Main database server connection failed:', err.message);
        console.warn('⚠️  Server will continue running without main database connection');
        console.warn('⚠️  You can restore the database from cloud backup when ready');
        resolve();
        return;
      }
      
      const createDbSql = 'CREATE DATABASE IF NOT EXISTS iwantdz_db';
      
      tempDb.query(createDbSql, (err) => {
        if (err) {
          console.warn('⚠️  Error creating main database:', err.message);
          console.warn('⚠️  Server will continue running without main database connection');
          console.warn('⚠️  You can restore the database from cloud backup when ready');
          tempDb.end();
          resolve();
          return;
        }
        
        console.log('Main database checked/created');
        tempDb.end();
        
        // Now connect to the specific database
        db = mysql.createConnection({
          host: process.env.DB_HOST || 'localhost',
          user: process.env.DB_USER || 'root',
          password: process.env.DB_PASSWORD || '',
          database: process.env.DB_NAME || 'iwantdz_db',
          port: process.env.DB_PORT || 3306
        });
        
        db.connect((err) => {
          if (err) {
            console.warn('⚠️  Main database connection failed:', err.message);
            console.warn('⚠️  Server will continue running without main database connection');
            console.warn('⚠️  You can restore the database from cloud backup when ready');
            resolve();
            return;
          }
          
          console.log('Connected to main MySQL database');
          
          // Ensure SineWithId table exists
          ensureSineWithIdTableExists((err) => {
            if (err) {
              console.warn('⚠️  Failed to create SineWithId table:', err.message);
            }
            resolve();
          });
        });
      });
    });
  });
};

// MySQL Database Connection for user tables database
let userTablesDb = null;

// First, create the database if it doesn't exist, then connect to it
const initializeUserTablesDb = () => {
  return new Promise((resolve) => {
    // First connect without database to create it if needed
    const tempDb = mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      port: process.env.DB_PORT || 3306
    });
    
    tempDb.connect((err) => {
      if (err) {
        console.warn('⚠️  Temp database connection failed:', err.message);
        console.warn('⚠️  Server will continue running without user tables database connection');
        console.warn('⚠️  You can restore the database from cloud backup when ready');
        resolve();
        return;
      }
      
      const createDbSql = 'CREATE DATABASE IF NOT EXISTS iwantdz_user_tables';
      
      tempDb.query(createDbSql, (err) => {
        if (err) {
          console.warn('⚠️  Error creating user tables database:', err.message);
          console.warn('⚠️  Server will continue running without user tables database connection');
          console.warn('⚠️  You can restore the database from cloud backup when ready');
          tempDb.end();
          resolve();
          return;
        }
        
        console.log('User tables database checked/created');
        tempDb.end();
        
        // Now connect to the specific database
        userTablesDb = mysql.createConnection({
          host: process.env.DB_HOST || 'localhost',
          user: process.env.DB_USER || 'root',
          password: process.env.DB_PASSWORD || '',
          database: 'iwantdz_user_tables',
          port: process.env.DB_PORT || 3306
        });
        
        userTablesDb.connect((err) => {
          if (err) {
            console.warn('⚠️  User tables database connection failed:', err.message);
            console.warn('⚠️  Server will continue running without user tables database connection');
            console.warn('⚠️  You can restore the database from cloud backup when ready');
            resolve();
            return;
          }
          
          console.log('Connected to user tables database');
          resolve();
        });
      });
    });
  });
};

// Initialize databases before starting the server
Promise.all([initializeMainDb(), initializeUserTablesDb()]).then(() => {
  console.log('Database initialization completed');
}).catch(err => {
  console.error('Some databases failed to initialize:', err);
  console.warn('Server will continue running despite database initialization failures');
});

// Function to generate unique BID
function generateBID() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let bid = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) bid += '-';
    bid += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return bid;
}

// Basic Routes
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to iwantdz backend API' });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    database: db && db.state === 'connected' ? 'connected' : 'disconnected',
    userTablesDb: userTablesDb && userTablesDb.state === 'connected' ? 'connected' : 'disconnected'
  });
});

// Example API endpoint for containers
app.get('/api/containers', (req, res) => {
  if (!db) {
    res.status(503).json({ error: 'Database not connected' });
    return;
  }
  const sql = 'SELECT * FROM containers';
  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching containers:', err);
      res.status(500).json({ error: 'Database error' });
      return;
    }
    res.json(results);
  });
});

// API endpoint to create table with custom schema from request
app.post('/api/create-table', (req, res) => {
  if (!db) {
    res.status(503).json({ error: 'Database not connected' });
    return;
  }
  
  const { tableName, columns } = req.body;
  
  if (!tableName || !columns || !Array.isArray(columns)) {
    res.status(400).json({ error: 'Missing tableName or columns in request body' });
    return;
  }
  
  // Build CREATE TABLE SQL from columns array
  const columnsDef = columns.map(col => {
    // Escape reserved words with backticks
    const colName = ['Order', 'OrderType', 'OrderUser', 'OrderIndex', 'OrderPosision', 'OrderPrex', 'OrderOid', 'OrderOther', 'OrderExpired', 'Orderinfo', 'Orderdate', 'OrderLast', 'status', 'type', 'isRead'].includes(col.name) ? `\`${col.name}\`` : col.name;
    return `${colName} ${col.type}${col.constraints ? ' ' + col.constraints : ''}`;
  }).join(', ');
  
  const sql = `CREATE TABLE IF NOT EXISTS ${tableName} (${columnsDef})`;
  
  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error creating table:', err);
      res.status(500).json({ error: 'Database error', details: err.message });
      return;
    }
    
    // Get table schema after creation
    const schemaSql = `DESCRIBE ${tableName}`;
    db.query(schemaSql, (schemaErr, schemaResults) => {
      if (schemaErr) {
        console.error('Error fetching table schema:', schemaErr);
        res.json({ 
          message: 'Table created successfully', 
          table: tableName,
          columns: columns
        });
        return;
      }
      
      res.json({ 
        message: 'Table created successfully', 
        table: tableName,
        columns: schemaResults,
        requestedSchema: columns
      });
    });
  });
});

// API endpoint to get table schema/details
app.get('/api/table-schema', (req, res) => {
  if (!db) {
    res.status(503).json({ error: 'Database not connected' });
    return;
  }
  const sql = 'DESCRIBE containers';
  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching table schema:', err);
      res.status(500).json({ error: 'Database error', details: err.message });
      return;
    }
    res.json({ 
      table: 'containers',
      columns: results,
      schema: {
        id: 'INT AUTO_INCREMENT PRIMARY KEY',
        name: 'VARCHAR(255) NOT NULL',
        description: 'TEXT',
        latitude: 'DECIMAL(10, 8)',
        longitude: 'DECIMAL(11, 8)',
        created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
      }
    });
  });
});

// API endpoint to drop table
app.post('/api/drop-table', (req, res) => {
  if (!db) {
    res.status(503).json({ error: 'Database not connected' });
    return;
  }
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 REQUEST REPORT: Drop Table');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('⏰ Received Time:', new Date().toISOString());
  console.log('📦 Received Data:', JSON.stringify(req.body, null, 2));
  
  const { tableName } = req.body;
  
  if (!tableName) {
    console.log('❌ ERROR: Missing tableName');
    res.status(400).json({ error: 'Missing tableName in request body' });
    return;
  }
  
  const sql = `DROP TABLE IF EXISTS ${tableName}`;
  
  console.log('🔍 SQL Query:', sql);
  
  db.query(sql, (err, results) => {
    if (err) {
      console.log('❌ DATABASE ERROR:', err.message);
      res.status(500).json({ error: 'Database error', details: err.message });
      return;
    }
    
    console.log('✅ Table dropped successfully');
    res.json({ 
      message: 'Table dropped successfully', 
      table: tableName
    });
  });
});

// API endpoint to insert row into table
app.post('/api/insert-row', (req, res) => {
  if (!db) {
    res.status(503).json({ error: 'Database not connected' });
    return;
  }
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 REQUEST REPORT: Insert Row Request Received');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('⏰ Received Time:', new Date().toISOString());
  console.log('📦 Received Data:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  • tableName:', req.body.tableName);
  console.log('  • data:', JSON.stringify(req.body.data, null, 2));
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const { tableName, data } = req.body;
  
  if (!tableName || !data || typeof data !== 'object') {
    console.log('❌ ERROR: Invalid data');
    console.log('   • tableName:', tableName);
    console.log('   • data:', data);
    console.log('═══════════════════════════════════════════════════════════════');
    res.status(400).json({ error: 'Missing tableName or data in request body' });
    return;
  }
  
  console.log('✅ Data is valid for processing');
  console.log('📊 Number of columns:', Object.keys(data).length);
  console.log('📋 Column list:', Object.keys(data).join(', '));
  
  const columns = Object.keys(data);
  const values = Object.values(data);
  const placeholders = values.map(() => '?').join(', ');
  
  // Escape reserved words with backticks
  const escapedColumns = columns.map(col => {
    return ['Order', 'OrderType', 'OrderUser', 'OrderIndex', 'OrderPosision', 'OrderPrex', 'OrderOid', 'OrderOther', 'OrderExpired', 'Orderinfo', 'Orderdate', 'OrderLast', 'status', 'type', 'isRead'].includes(col) ? `\`${col}\`` : col;
  }).join(', ');
  
  const sql = `INSERT INTO ${tableName} (${escapedColumns}) VALUES (${placeholders})`;
  
  console.log('🔍 SQL Query:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(sql);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📥 Prepared values:', values);
  
  console.log('⏰ Starting query execution:', new Date().toISOString());
  
  db.query(sql, values, (err, results) => {
    if (err) {
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('❌ ❌ ❌ DATABASE ERROR ❌ ❌ ❌');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('💥 Details:', err.message);
      console.log('🔍 Error code:', err.code);
      console.log('⏰ Error time:', new Date().toISOString());
      console.log('═══════════════════════════════════════════════════════════════');
      res.status(500).json({ error: 'Database error', details: err.message });
      return;
    }
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ ✅ ✅ INSERT SUCCESSFUL ✅ ✅ ✅');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🆔 Insert ID:', results.insertId);
    console.log('📊 Affected rows:', results.affectedRows);
    console.log('⏰ Completion time:', new Date().toISOString());
    console.log('═══════════════════════════════════════════════════════════════');
    
    res.json({ 
      message: 'Row inserted successfully', 
      table: tableName,
      insertedId: results.insertId,
      affectedRows: results.affectedRows,
      data: data
    });
  });
});

// API endpoint to query/filter rows with conditions
app.post('/api/query', (req, res) => {
  if (!db) {
    res.status(503).json({ error: 'Database not connected' });
    return;
  }
  const { tableName, conditions, orderBy, limit } = req.body;
  
  if (!tableName) {
    res.status(400).json({ error: 'Missing tableName in request body' });
    return;
  }
  
  let sql = `SELECT * FROM ${tableName}`;
  const values = [];
  
  // Add WHERE conditions if provided
  if (conditions && typeof conditions === 'object' && Object.keys(conditions).length > 0) {
    const whereClauses = [];
    for (const [column, value] of Object.entries(conditions)) {
      if (value !== null && value !== undefined) {
        whereClauses.push(`${column} = ?`);
        values.push(value);
      }
    }
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }
  }
  
  // Add ORDER BY if provided
  if (orderBy) {
    sql += ` ORDER BY ${orderBy}`;
  }
  
  // Add LIMIT if provided
  if (limit) {
    sql += ` LIMIT ${limit}`;
  }
  
  db.query(sql, values, (err, results) => {
    if (err) {
      console.error('Error querying table:', err);
      res.status(500).json({ error: 'Database error', details: err.message });
      return;
    }
    
    res.json({ 
      table: tableName,
      count: results.length,
      rows: results,
      conditions: conditions
    });
  });
});

// API endpoint to update connection status
app.post('/api/update-connection-status', (req, res) => {
  if (!db) {
    res.status(503).json({ error: 'Database not connected' });
    return;
  }
  const { Oid, BID, username, status } = req.body;
  
  if (!Oid) {
    res.status(400).json({ error: 'Missing Oid in request body' });
    return;
  }
  
  const connectionStatus = status || 'online';
  const connectionTime = new Date();
  
  const sql = `INSERT INTO ActiveUsers (Oid, BID, username, lastSeen, connectionTime, status) VALUES (?, ?, ?, ?, ?, ?) 
               ON DUPLICATE KEY UPDATE BID = VALUES(BID), lastSeen = VALUES(lastSeen), status = VALUES(status)`;
  
  const values = [Oid, BID || '', username || '', connectionTime, connectionTime, connectionStatus];
  
  db.query(sql, values, (err, results) => {
    if (err) {
      console.log('❌ Connection status update failed:', err.message);
      res.status(500).json({ error: 'Database error', details: err.message });
      return;
    }
    
    // console.log(`✅ ${username || 'User'} ${connectionStatus}`);
    
    // Broadcast active users update when connection status changes (both online and offline)
    broadcastActiveUsersUpdate();
    
    res.json({ 
      message: 'Connection status updated successfully', 
      Oid: Oid,
      status: connectionStatus,
      lastSeen: connectionTime,
      affectedRows: results.affectedRows
    });
  });
});

// API endpoint to get active users
app.get('/api/get-active-users', (req, res) => {
  if (!db) {
    res.status(503).json({ error: 'Database not connected' });
    return;
  }
  const { BID } = req.query;
  
  // تصفية: إرسال القائمة فقط للمستخدمين الذين يحتوي BID الخاص بهم على "Admin"
  if (!BID || !BID.includes('Admin')) {
    console.log('⏭️ Active users request rejected (non-Admin BID)');
    res.json({ 
      count: 0,
      users: []
    });
    return;
  }
  
  // Update lastSeen for the requesting user to keep them active
  const updateLastSeenSql = `UPDATE ActiveUsers SET lastSeen = NOW() WHERE BID = ? AND status = 'online'`;
  db.query(updateLastSeenSql, [BID], (updateErr) => {
    if (updateErr) {
      console.error('Error updating lastSeen:', updateErr);
    }
    
    const sql = `SELECT DISTINCT Oid, BID, username, status, MAX(lastSeen) as lastSeen, MAX(connectionTime) as connectionTime FROM ActiveUsers WHERE status = 'online' GROUP BY Oid, BID, username, status ORDER BY MAX(lastSeen) DESC`;
    
    db.query(sql, (err, results) => {
    if (err) {
      console.log('❌ Failed to fetch active users:', err.message);
      res.status(500).json({ error: 'Database error', details: err.message });
      return;
    }
    
    console.log(`✅ Active users list sent to ${BID} (${results.length} users)`);
    
    res.json({ 
      count: results.length,
      users: results
    });
    });
  });
});

// API endpoint to manually update user BID (for testing purposes)
app.post('/api/update-user-bid', (req, res) => {
  if (!db) {
    res.status(503).json({ error: 'Database not connected' });
    return;
  }
  const { username, newBID } = req.body;
  
  if (!username || !newBID) {
    res.status(400).json({ error: 'Missing username or newBID in request body' });
    return;
  }
  
  const sql = `UPDATE User SET BID = ? WHERE username = ?`;
  
  db.query(sql, [newBID, username], (err, results) => {
    if (err) {
      console.log('❌ BID update failed:', err.message);
      res.status(500).json({ error: 'Database error', details: err.message });
      return;
    }
    
    console.log(`✅ BID updated for ${username} → ${newBID}`);
    
    res.json({ 
      success: true,
      affectedRows: results.affectedRows,
      message: 'BID updated successfully'
    });
  });
});

// Helper function to ensure SineWithId table exists
function ensureSineWithIdTableExists(callback) {
  const createTableSql = `
    CREATE TABLE IF NOT EXISTS SineWithId (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(255) NOT NULL,
      Oid VARCHAR(255) NOT NULL,
      dateTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      Device VARCHAR(255)
    )
  `;
  
  db.query(createTableSql, (err, results) => {
    if (err) {
      console.error('❌ Error creating SineWithId table:', err);
      callback(err);
    } else {
      console.log('✅ SineWithId table checked/created');
      callback(null);
    }
  });
}

// Helper function to ensure Notifications table exists
function ensureNotificationsTableExists(callback) {
  const createTableSql = `
    CREATE TABLE IF NOT EXISTS Notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      receiverBID VARCHAR(20),
      senderBID VARCHAR(20),
      message TEXT,
      type VARCHAR(50),
      isRead BOOLEAN DEFAULT false,
      notificationStart TIMESTAMP,
      notificationEnd TIMESTAMP,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  
  db.query(createTableSql, (err, results) => {
    if (err) {
      console.error('❌ Error creating Notifications table:', err);
      callback(err);
    } else {
      callback(null);
    }
  });
}

// API endpoint to send notification
app.post('/api/send-notification', (req, res) => {
  if (!db) {
    res.status(503).json({ error: 'Database not connected' });
    return;
  }
  const { targetBID, senderBID, message, type, durationMinutes } = req.body;
  
  if (!targetBID || !message) {
    res.status(400).json({ error: 'Missing targetBID or message in request body' });
    return;
  }
  
  const notificationType = type || 'info';
  const createdAt = new Date();
  const notificationStart = new Date();
  
  // Calculate notification end time (default 5 minutes for messages)
  const duration = durationMinutes || 5;
  const notificationEnd = new Date(notificationStart.getTime() + duration * 60 * 1000);
  
  // Ensure Notifications table exists before proceeding
  ensureNotificationsTableExists((err) => {
    if (err) {
      res.status(500).json({ error: 'Failed to create Notifications table', details: err.message });
      return;
    }
    
    if (targetBID === 'all') {
    // Send to all active users
    const sql = `SELECT BID FROM ActiveUsers WHERE status = 'online'`;
    
    db.query(sql, (err, results) => {
      if (err) {
        console.log('❌ Failed to send notifications to all:', err.message);
        res.status(500).json({ error: 'Database error', details: err.message });
        return;
      }
      
      const insertPromises = results.map(user => {
        return new Promise((resolve, reject) => {
          const insertSql = `INSERT INTO Notifications (receiverBID, senderBID, message, type, isRead, notificationStart, notificationEnd, createdAt) VALUES (?, ?, ?, ?, false, ?, ?, ?)`;
          const values = [user.BID, senderBID || '', message, notificationType, notificationStart, notificationEnd, createdAt];
          
          db.query(insertSql, values, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        });
      });
      
      Promise.all(insertPromises)
        .then(() => {
          console.log(`✅ Notification sent to all ${results.length} users`);
          res.json({ 
            message: 'Notifications sent to all users successfully', 
            count: results.length,
            duration: duration
          });
        })
        .catch(err => {
          console.log('❌ Error sending notifications:', err.message);
          res.status(500).json({ error: 'Error sending notifications', details: err.message });
        });
    });
  } else {
    // Send to specific user
    const sql = `INSERT INTO Notifications (receiverBID, senderBID, message, type, isRead, notificationStart, notificationEnd, createdAt) VALUES (?, ?, ?, ?, false, ?, ?, ?)`;
    const values = [targetBID, senderBID || '', message, notificationType, notificationStart, notificationEnd, createdAt];
    
    db.query(sql, values, (err, results) => {
      if (err) {
        console.log('❌ Failed to send notification:', err.message);
        res.status(500).json({ error: 'Database error', details: err.message });
        return;
      }
      
      console.log(`✅ Notification sent to ${targetBID}`);
      res.json({ 
        message: 'Notification sent successfully', 
        notificationId: results.insertId,
        targetBID: targetBID,
        notificationStart: notificationStart,
        notificationEnd: notificationEnd,
        duration: duration
      });
    });
  }
  });
});

// API endpoint to get notifications
app.get('/api/get-notifications', (req, res) => {
  if (!db) {
    res.status(503).json({ error: 'Database not connected' });
    return;
  }
  const { BID, unreadOnly } = req.query;
  
  if (!BID) {
    res.status(400).json({ error: 'Missing BID in query params' });
    return;
  }
  
  let sql = `SELECT * FROM Notifications`;
  const values = [];
  
  // If BID is 'all', don't filter by BID (for admin)
  if (BID !== 'all') {
    sql += ` WHERE receiverBID = ?`;
    values.push(BID);
  }
  
  if (unreadOnly === 'true') {
    sql += BID === 'all' ? ` WHERE isRead = false` : ` AND isRead = false`;
  }
  
  sql += ` ORDER BY createdAt DESC`;
  
  db.query(sql, values, (err, results) => {
    if (err) {
      // Silently ignore if table doesn't exist
      if (err.code !== 'ER_NO_SUCH_TABLE') {
        console.log('❌ Failed to fetch notifications:', err.message);
      }
      res.status(500).json({ error: 'Database error', details: err.message });
      return;
    }
    
    // Replace senderBID with senderUsername for each notification
    const usernamePromises = results.map(notification => {
      return new Promise((resolve) => {
        const modifiedNotification = { ...notification };
        if (notification.senderBID) {
          const getUserSql = 'SELECT username FROM User WHERE BID = ?';
          db.query(getUserSql, [notification.senderBID], (err, userResults) => {
            if (!err && userResults.length > 0) {
              modifiedNotification.senderUsername = userResults[0].username;
            } else {
              modifiedNotification.senderUsername = notification.senderBID; // Fallback to BID
            }
            resolve(modifiedNotification);
          });
        } else {
          modifiedNotification.senderUsername = 'Unknown';
          resolve(modifiedNotification);
        }
      });
    });
    
    Promise.all(usernamePromises).then(notificationsWithUsernames => {
      res.json({ 
        count: results.length,
        notifications: notificationsWithUsernames
      });
    });
  });
});

// API endpoint to mark notification as read
app.post('/api/mark-notification-read', (req, res) => {
  if (!db) {
    res.status(503).json({ error: 'Database not connected' });
    return;
  }
  const { notificationId } = req.body;
  
  if (!notificationId) {
    res.status(400).json({ error: 'Missing notificationId in request body' });
    return;
  }
  
  const sql = `UPDATE Notifications SET isRead = true WHERE id = ?`;
  
  db.query(sql, [notificationId], (err, results) => {
    if (err) {
      console.log('❌ Failed to mark notification as read:', err.message);
      res.status(500).json({ error: 'Database error', details: err.message });
      return;
    }
    
    console.log(`✅ Notification ${notificationId} marked as read`);
    res.json({ 
      message: 'Notification marked as read successfully',
      affectedRows: results.affectedRows
    });
  });
});

// API endpoint to update Notifications table structure for BID-based system
app.post('/api/update-notifications-schema', (req, res) => {
  if (!db) {
    res.status(503).json({ error: 'Database not connected' });
    return;
  }
  // Check if receiverBID column exists
  const checkSql = `SHOW COLUMNS FROM Notifications LIKE 'receiverBID'`;
  
  db.query(checkSql, (err, results) => {
    if (err) {
      console.log('❌ Schema update failed:', err.message);
      res.status(500).json({ error: 'Database error', details: err.message });
      return;
    }
    
    if (results.length > 0) {
      console.log('✅ Notifications schema already up to date');
      res.json({ 
        message: 'Notifications table already has BID-based columns',
        changes: 'No changes needed'
      });
      return;
    }
    
    // Add receiverBID and senderBID columns
    const alterSql = `
      ALTER TABLE Notifications 
      ADD COLUMN receiverBID VARCHAR(20),
      ADD COLUMN senderBID VARCHAR(20)
    `;
    
    db.query(alterSql, (err, results) => {
      if (err) {
        console.log('❌ Schema update failed:', err.message);
        res.status(500).json({ error: 'Database error', details: err.message });
        return;
      }
      
      console.log('✅ Notifications schema updated');
      res.json({ 
        message: 'Notifications table schema updated successfully',
        changes: 'Added receiverBID and senderBID columns'
      });
    });
  });
});

// API endpoint to update User table structure for currentOid field
app.post('/api/update-user-schema', (req, res) => {
  if (!db) {
    res.status(503).json({ error: 'Database not connected' });
    return;
  }
  const alterSql = `
    ALTER TABLE User 
    ADD COLUMN IF NOT EXISTS currentOid VARCHAR(20)
  `;
  
  db.query(alterSql, (err, results) => {
    if (err) {
      console.log('❌ User schema update failed:', err.message);
      res.status(500).json({ error: 'Database error', details: err.message });
      return;
    }
    
    console.log('✅ User schema updated');
    res.json({ 
      message: 'User table schema updated successfully',
      changes: 'Added currentOid column'
    });
  });
});

// API endpoint to update ActiveUsers table structure for BID field
app.post('/api/update-active-users-schema', (req, res) => {
  if (!db) {
    res.status(503).json({ error: 'Database not connected' });
    return;
  }
  // First check if column exists
  const checkSql = `SHOW COLUMNS FROM ActiveUsers LIKE 'BID'`;
  
  db.query(checkSql, (err, results) => {
    if (err) {
      console.log('❌ ActiveUsers schema update failed:', err.message);
      res.status(500).json({ error: 'Database error', details: err.message });
      return;
    }
    
    if (results.length > 0) {
      console.log('✅ ActiveUsers schema already up to date');
      res.json({ 
        message: 'BID column already exists in ActiveUsers table',
        changes: 'No changes needed'
      });
      return;
    }
    
    // Column doesn't exist, add it
    const alterSql = `ALTER TABLE ActiveUsers ADD COLUMN BID VARCHAR(20)`;
    
    db.query(alterSql, (err, results) => {
      if (err) {
        console.log('❌ ActiveUsers schema update failed:', err.message);
        res.status(500).json({ error: 'Database error', details: err.message });
        return;
      }
      
      console.log('✅ ActiveUsers schema updated');
      res.json({ 
        message: 'ActiveUsers table schema updated successfully',
        changes: 'Added BID column'
      });
    });
  });
});

// API endpoint to register new user with validation
app.post('/api/register-user', (req, res) => {
  if (!db) {
    res.status(503).json({ error: 'Database not connected' });
    return;
  }
  const { username, email, password } = req.body;
  
  // Validate required fields
  if (!username || !email || !password) {
    res.status(400).json({ 
      success: false,
      message: 'Missing required fields',
      error: 'username, email, and password are required'
    });
    return;
  }
  
  const report = {
    steps: [],
    success: false,
    message: '',
    user: null
  };
  
  // Step 1: Check if username already exists
  report.steps.push({ step: 1, action: 'Checking username existence', status: 'in_progress' });
  const checkUsernameSql = 'SELECT * FROM User WHERE username = ?';
  db.query(checkUsernameSql, [username], (err, usernameResults) => {
    if (err) {
      console.log('❌ Registration failed (username check):', err.message);
      report.steps[0].status = 'failed';
      report.steps[0].error = err.message;
      report.message = 'Database error during username check';
      res.status(500).json(report);
      return;
    }
    
    report.steps[0].status = 'completed';
    report.steps[0].result = 'Username check passed';
    
    if (usernameResults.length > 0) {
      console.log('❌ Registration failed: Username already exists');
      report.message = 'Username already exists';
      res.status(409).json(report);
      return;
    }
    
    // Step 2: Check if email already exists
    report.steps.push({ step: 2, action: 'Checking email existence', status: 'in_progress' });
    const checkEmailSql = 'SELECT * FROM User WHERE email = ?';
    db.query(checkEmailSql, [email], (err, emailResults) => {
      if (err) {
        console.log('❌ Registration failed (email check):', err.message);
        report.steps[1].status = 'failed';
        report.steps[1].error = err.message;
        report.message = 'Database error during email check';
        res.status(500).json(report);
        return;
      }
      
      report.steps[1].status = 'completed';
      report.steps[1].result = 'Email check passed';
      
      if (emailResults.length > 0) {
        console.log('❌ Registration failed: Email already exists');
        report.message = 'Email already exists';
        res.status(409).json(report);
        return;
      }
      
      // Step 3: Insert new user
      report.steps.push({ step: 3, action: 'Creating new user', status: 'in_progress' });
      const bid = generateBID();
      
      const insertSql = 'INSERT INTO User (username, email, password, BID, date, Lastupdate) VALUES (?, ?, ?, ?, NOW(), NOW())';
      db.query(insertSql, [username, email, password, bid], (err, insertResults) => {
        if (err) {
          console.log('❌ Registration failed (user creation):', err.message);
          report.steps[2].status = 'failed';
          report.steps[2].error = err.message;
          report.message = 'Database error during user creation';
          res.status(500).json(report);
          return;
        }
        
        console.log(`✅ User registered: ${username} (${bid})`);
        
        report.steps[2].status = 'completed';
        report.steps[2].result = `User created with ID ${insertResults.insertId}`;
        
        // Step 4: Retrieve created user
        report.steps.push({ step: 4, action: 'Retrieving created user', status: 'in_progress' });
        
        const getUserSql = 'SELECT id, username, email, password, BID, date, Lastupdate, position, LastPosition FROM User WHERE username = ?';
        db.query(getUserSql, [username], (err, userResults) => {
          if (err) {
            report.steps[3].status = 'failed';
            report.steps[3].error = err.message;
            report.message = 'User created but retrieval failed';
            report.success = true;
            report.user = { id: insertResults.insertId, username: username, email: email };
            res.status(201).json(report);
            return;
          }
          
          report.steps[3].status = 'completed';
          report.steps[3].result = `User retrieved successfully`;
          
          if (userResults.length === 0) {
            report.steps[3].status = 'failed';
            report.steps[3].error = 'User not found after creation';
            report.message = 'User created but retrieval failed';
            report.success = true;
            report.user = { id: insertResults.insertId, username: username, email: email };
            res.status(201).json(report);
            return;
          }
          
          const user = userResults[0];
          // Use insertId from INSERT operation if user.id is still null
          if (!user.id) {
            user.id = insertResults.insertId;
          }
          const actualUsername = user.username;
          
          // Step 5: Create user-specific table
          report.steps.push({ step: 5, action: 'Creating user-specific table', status: 'in_progress' });
          // console.log('🔍 Step 5: Creating user-specific table...');
          
          const tableName = `tb_${actualUsername.toLowerCase()}`;
          // console.log('📋 Table name:', tableName);
          // console.log('🗄️ Database: iwantdz_user_tables');
          
          const createTableSql = `
            CREATE TABLE IF NOT EXISTS ${tableName} (
              id INT AUTO_INCREMENT PRIMARY KEY,
              dateTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              \`Order\` VARCHAR(255),
              \`OrderType\` VARCHAR(255),
              \`OrderIndex\` INT,
              \`OrderPosision\` VARCHAR(255),
              \`OrderPrex\` VARCHAR(255),
              \`OrderOid\` VARCHAR(255),
              \`OrderOther\` TEXT,
              \`OrderExpired\` TIMESTAMP,
              \`Orderinfo\` TEXT
            )
          `;
          
          // console.log('🔍 SQL Query:', createTableSql);
          
          // Check if userTablesDb is available
          if (!userTablesDb) {
            console.log('❌ userTablesDb is null/not initialized');
            report.steps[4].status = 'failed';
            report.steps[4].error = 'userTablesDb is null/not initialized';
            report.message = 'User created but table creation failed - database not initialized';
            report.success = true;
            report.user = user;
            res.status(201).json(report);
            return;
          }
          
          userTablesDb.query(createTableSql, (err, tableResults) => {
            if (err) {
              console.log('❌ Step 5 failed:', err.message);
              console.log('❌ Error code:', err.code);
              console.log('❌ Error details:', err);
              report.steps[4].status = 'failed';
              report.steps[4].error = err.message;
              report.message = 'User created but table creation failed';
              report.success = true;
              report.user = user;
              res.status(201).json(report);
              return;
            }
            
            report.steps[4].status = 'completed';
            report.steps[4].result = `Table "${tableName}" created successfully in user tables database`;
            // console.log('✅ Step 5 completed:', report.steps[4].result);
            
            // Verify table was created by checking if it exists
            const checkTableSql = `SHOW TABLES LIKE '${tableName}'`;
            userTablesDb.query(checkTableSql, (checkErr, checkResults) => {
              if (checkErr) {
                // console.log('⚠️ Warning: Could not verify table creation:', checkErr.message);
              } else {
                // console.log('🔍 Table verification results:', checkResults);
                if (checkResults.length === 0) {
                  // console.log('❌ Table was not actually created despite no error!');
                } else {
                  // console.log('✅ Table verified to exist:', tableName);
                }
              }
            });
            
            // Step 6: Insert "Sine Up" order
            report.steps.push({ step: 6, action: 'Inserting "Sine Up" order', status: 'in_progress' });
            
            const orderOid = generateOrderOid();
            const insertOrderSql = `
              INSERT INTO ${tableName} (\`Order\`, \`OrderType\`, \`OrderOid\`, \`Orderinfo\`)
              VALUES (?, ?, ?, ?)
            `;
            
            userTablesDb.query(insertOrderSql, ['Sine Up', 'Registration', orderOid, 'User registration order'], (err, orderResults) => {
              if (err) {
                report.steps[5].status = 'failed';
                report.steps[5].error = err.message;
                report.message = 'User and table created but "Sine Up" order insertion failed';
                report.success = true;
                report.user = user;
                report.userTable = tableName;
                report.userTableDatabase = 'iwantdz_user_tables';
                res.status(201).json(report);
                return;
              }
              
              report.steps[5].status = 'completed';
              report.steps[5].result = `"Sine Up" order inserted with OrderOid: ${orderOid}`;
              
              // Step 7: Insert record in SineWithId table
              report.steps.push({ step: 7, action: 'Inserting record in SineWithId', status: 'in_progress' });
              
              const sineWithIdOid = generateOrderOid();
              const insertSineWithIdSql = `
                INSERT INTO SineWithId (username, Oid, Device)
                VALUES (?, ?, ?)
              `;
              
              db.query(insertSineWithIdSql, [username, sineWithIdOid, 'Registration'], (err, sineWithIdResults) => {
                if (err) {
                  report.steps[6].status = 'failed';
                  report.steps[6].error = err.message;
                  report.message = 'User registered but SineWithId insertion failed';
                  report.success = true;
                  report.user = user;
                  report.userTable = tableName;
                  report.userTableDatabase = 'iwantdz_user_tables';
                  report.sineUpOrder = {
                    Order: 'Sine Up',
                    OrderType: 'Registration',
                    OrderOid: orderOid,
                    Orderinfo: 'User registration order'
                  };
                  res.status(201).json(report);
                  return;
                }
                
                report.success = true;
                report.message = 'User registered successfully with personal table and "Sine Up" order';
                const { password, ...safeUser } = user;
                report.user = safeUser;
                report.userTable = tableName;
                report.userTableDatabase = 'iwantdz_user_tables';
                report.sineUpOrder = {
                  Order: 'Sine Up',
                  OrderType: 'Registration',
                  OrderOid: orderOid,
                  Orderinfo: 'User registration order'
                };
                report.oid = sineWithIdOid;
                report.user.BID = user.BID;
                report.BID = user.BID;
                
                console.log(`✅ User registered: ${username} (${bid})`);
                // console.log('==========================================');
                // console.log('🎉 REGISTRATION ATTEMPT COMPLETED SUCCESSFULLY');
                // console.log('==========================================');
                
                // Add user to ActiveUsers table before broadcasting
                const addActiveUserSql = `INSERT INTO ActiveUsers (Oid, BID, username, lastSeen, connectionTime, status) VALUES (?, ?, ?, ?, ?, ?) 
                                           ON DUPLICATE KEY UPDATE BID = VALUES(BID), lastSeen = VALUES(lastSeen), status = VALUES(status)`;
                const connectionTime = new Date();
                const activeUserValues = [sineWithIdOid, user.BID || '', username, connectionTime, connectionTime, 'online'];
                
                db.query(addActiveUserSql, activeUserValues, (activeUserErr, activeUserResults) => {
                  if (activeUserErr) {
                    console.error('❌ Error adding user to ActiveUsers:', activeUserErr);
                  }
                  
                  // Fetch active users list to include in response
                  const activeUsersSql = `SELECT DISTINCT Oid, BID, username, status, MAX(lastSeen) as lastSeen, MAX(connectionTime) as connectionTime FROM ActiveUsers WHERE status = 'online' GROUP BY Oid, BID, username, status ORDER BY MAX(lastSeen) DESC`;
                  db.query(activeUsersSql, (activeUsersErr, activeUsersResults) => {
                    if (!activeUsersErr) {
                      report.activeUsers = activeUsersResults;
                      report.activeUsersCount = activeUsersResults.length;
                    }
                    
                    // Broadcast active users update to all connected clients
                    broadcastActiveUsersUpdate();
                    
                    res.status(201).json(report);
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});

// API endpoint to login user with order insertion
app.post('/api/login-user', (req, res) => {
  if (!db) {
    res.status(503).json({ error: 'Database not connected' });
    return;
  }
  const { username, email, password } = req.body;
  
  // Validate required fields - accept either username or email
  const identifier = username || email;
  if (!identifier || !password) {
    res.status(400).json({ 
      success: false,
      message: 'Missing required fields',
      error: 'username/email and password are required'
    });
    return;
  }
  
  const report = {
    steps: [],
    success: false,
    message: '',
    user: null,
    loginOrder: null
  };
  
  // Step 1: Check if user exists (by username OR email)
  report.steps.push({ step: 1, action: 'Checking user existence', status: 'in_progress' });
  const checkUserSql = 'SELECT * FROM User WHERE username = ? OR email = ?';
  db.query(checkUserSql, [identifier, identifier], (err, userResults) => {
    if (err) {
      console.log('❌ Login failed (user check):', err.message);
      report.steps[0].status = 'failed';
      report.steps[0].error = err.message;
      report.message = 'Database error during user check';
      res.status(500).json(report);
      return;
    }
    
    report.steps[0].status = 'completed';
    report.steps[0].result = 'User found';
    
    if (userResults.length === 0) {
      console.log('❌ Login failed: User not found');
      report.message = 'User not found';
      res.status(404).json(report);
      return;
    }
    
    const user = userResults[0];
    const actualUsername = user.username;
    
    // Step 2: Verify password
    report.steps.push({ step: 2, action: 'Verifying password', status: 'in_progress' });
    if (user.password !== password) {
      console.log('❌ Login failed: Password incorrect');
      report.steps[1].status = 'completed';
      report.steps[1].result = 'Password incorrect';
      
      // Step 3: Insert "Sine Failed" order
      report.steps.push({ step: 3, action: 'Inserting "Sine Failed" order', status: 'in_progress' });
      // console.log('🔍 Step 3: Inserting "Sine Failed" order...');
      
      const tableName = `tb_${actualUsername.toLowerCase()}`;
      const orderOid = generateOrderOid();
      const insertOrderSql = `
        INSERT INTO ${tableName} (\`Order\`, \`OrderType\`, \`OrderOid\`, \`Orderinfo\`)
        VALUES (?, ?, ?, ?)
      `;
      
      userTablesDb.query(insertOrderSql, ['Sine Failed', 'Login Failed', orderOid, 'Login attempt failed - incorrect password'], (err, orderResults) => {
        if (err) {
          console.log('❌ Step 3 failed:', err.message);
          report.steps[2].status = 'failed';
          report.steps[2].error = err.message;
        } else {
          console.log('✅ Step 3 completed: "Sine Failed" order inserted');
          report.steps[2].status = 'completed';
          report.steps[2].result = `"Sine Failed" order inserted with OrderOid: ${orderOid}`;
          report.loginOrder = {
            Order: 'Sine Failed',
            OrderType: 'Login Failed',
            Orderinfo: 'Login attempt failed - incorrect password'
          };
        }
        
        console.log('❌ Login failed - incorrect password');
        report.message = 'Login failed - incorrect password';
        res.status(401).json(report);
      });
      
      return;
    }
    
    console.log('✅ Step 2 completed: Password verified successfully');
    report.steps[1].status = 'completed';
    report.steps[1].result = 'Password verified successfully';
    
    // Step 3: Insert "Sine In" order
    report.steps.push({ step: 3, action: 'Inserting "Sine In" order', status: 'in_progress' });
    // console.log('🔍 Step 3: Inserting "Sine In" order...');
    
    const tableName = `tb_${actualUsername.toLowerCase()}`;
    const orderOid = generateOrderOid();
    const insertOrderSql = `
      INSERT INTO ${tableName} (\`Order\`, \`OrderType\`, \`OrderOid\`, \`Orderinfo\`)
      VALUES (?, ?, ?, ?)
    `;
    
    userTablesDb.query(insertOrderSql, ['Sine In', 'Login Success', orderOid, 'User logged in successfully'], (err, orderResults) => {
      if (err) {
        console.log('❌ Step 3 failed:', err.message);
        report.steps[2].status = 'failed';
        report.steps[2].error = err.message;
        report.message = 'Login successful but order insertion failed';
        report.success = true;
        report.user = user;
        res.status(200).json(report);
        return;
      }
      
      report.steps[2].status = 'completed';
      report.steps[2].result = `"Sine In" order inserted with OrderOid: ${orderOid}`;
      
      // Step 4: Insert record in SineWithId table
      report.steps.push({ step: 4, action: 'Inserting record in SineWithId', status: 'in_progress' });
      
      const sineWithIdOid = generateOrderOid();
      const insertSineWithIdSql = `
        INSERT INTO SineWithId (username, Oid, Device)
        VALUES (?, ?, ?)
      `;
      
      db.query(insertSineWithIdSql, [actualUsername, sineWithIdOid, 'Login'], (err, sineWithIdResults) => {
        if (err) {
          report.steps[3].status = 'failed';
          report.steps[3].error = err.message;
          report.message = 'Login successful but SineWithId insertion failed';
          report.success = true;
          const { password, ...safeUser } = user;
          report.user = safeUser;
          report.loginOrder = {
            Order: 'Sine In',
            OrderType: 'Login Success',
            Orderinfo: 'User logged in successfully'
          };
          res.status(200).json(report);
          return;
        }
        
        report.steps[3].status = 'completed';
        report.steps[3].result = `SineWithId record inserted with Oid: ${sineWithIdOid}`;
        
        report.success = true;
        report.message = 'Login successful';
        console.log(`✅ User logged in: ${actualUsername}`);
        const { password, ...safeUser } = user;
        report.user = safeUser;
        report.user.BID = user.BID; // Ensure BID is included
        report.oid = sineWithIdOid; // Include Oid in response (lowercase for consistency with registration)
        report.BID = user.BID; // Include BID in response
        report.loginOrder = {
          Order: 'Sine In',
          OrderType: 'Login Success',
          Orderinfo: 'User logged in successfully'
        };
        // Don't include sineWithId in response for security
        
        // Add user to ActiveUsers table before broadcasting
        const addActiveUserSql = `INSERT INTO ActiveUsers (Oid, BID, username, lastSeen, connectionTime, status) VALUES (?, ?, ?, ?, ?, ?) 
                                   ON DUPLICATE KEY UPDATE BID = VALUES(BID), lastSeen = VALUES(lastSeen), status = VALUES(status)`;
        const connectionTime = new Date();
        const activeUserValues = [sineWithIdOid, user.BID || '', actualUsername, connectionTime, connectionTime, 'online'];
        
        db.query(addActiveUserSql, activeUserValues, (activeUserErr, activeUserResults) => {
          if (activeUserErr) {
            console.error('❌ Error adding user to ActiveUsers:', activeUserErr);
          } else {
            console.log('✅ User added to ActiveUsers, fetching active users list...');
          }
          
          // Fetch active users list to include in response
          const activeUsersSql = `SELECT DISTINCT Oid, BID, username, status, MAX(lastSeen) as lastSeen, MAX(connectionTime) as connectionTime FROM ActiveUsers WHERE status = 'online' GROUP BY Oid, BID, username, status ORDER BY MAX(lastSeen) DESC`;
          db.query(activeUsersSql, (activeUsersErr, activeUsersResults) => {
            if (!activeUsersErr) {
              report.activeUsers = activeUsersResults;
              report.activeUsersCount = activeUsersResults.length;
              console.log(`✅ Active users list included in response (${activeUsersResults.length} users)`);
            } else {
              console.error('❌ Error fetching active users list:', activeUsersErr);
            }
            
            // Broadcast active users update to all connected clients
            broadcastActiveUsersUpdate();
            
            res.status(200).json(report);
          });
        });
      });
    });
  });
});

// API endpoint to login by Oid
app.post('/api/login-by-oid', (req, res) => {
  if (!db) {
    res.status(503).json({ error: 'Database not connected' });
    return;
  }
  const { Oid } = req.body;
  
  // Validate required fields
  if (!Oid) {
    res.status(400).json({ 
      success: false,
      message: 'Missing required field',
      error: 'Oid is required'
    });
    return;
  }
  
  const report = {
    steps: [],
    success: false,
    message: '',
    user: null,
    loginOrder: null,
    sineWithId: null
  };
  
  // Step 1: Check if Oid exists in SineWithId
  report.steps.push({ step: 1, action: 'Checking Oid in SineWithId', status: 'in_progress' });
  
  const checkOidSql = 'SELECT * FROM SineWithId WHERE Oid = ?';
  
  db.query(checkOidSql, [Oid], (err, sineWithIdResults) => {
    if (err) {
      console.log('❌ Login by OID failed (Oid check):', err.message);
      if (report.steps[0]) {
        report.steps[0].status = 'failed';
        report.steps[0].error = err.message;
      }
      report.message = 'Database error during Oid check';
      res.status(500).json(report);
      return;
    }
    
    if (sineWithIdResults.length === 0) {
      console.log('❌ Login by OID failed: Oid not found');
      if (report.steps[0]) {
        report.steps[0].status = 'completed';
        report.steps[0].result = 'Oid not found in database';
      }
      report.message = 'Oid not found';
      res.status(404).json(report);
      return;
    }
    
    if (report.steps[0]) {
      report.steps[0].status = 'completed';
      report.steps[0].result = 'Oid found in SineWithId table';
    }
    
    const sineWithIdRecord = sineWithIdResults[0];
    const username = sineWithIdRecord.username;
    
    // Step 2: Get user details
    report.steps.push({ step: 2, action: 'Retrieving user details', status: 'in_progress' });
    
    // Try to get user with password column first, fallback without password
    const getUserSql = 'SELECT id, username, email, BID, date, Lastupdate, position, LastPosition FROM User WHERE username = ?';
    
    db.query(getUserSql, [username], (err, userResults) => {
      if (err) {
        console.log('❌ Login by OID failed (user retrieval):', err.message);
        if (report.steps[1]) {
          report.steps[1].status = 'failed';
          report.steps[1].error = err.message;
        }
        report.message = 'Database error during user retrieval';
        res.status(500).json(report);
        return;
      }
      
      if (userResults.length === 0) {
        console.log('❌ Login by OID failed: User not found');
        if (report.steps[1]) {
          report.steps[1].status = 'completed';
          report.steps[1].result = 'User not found in database';
        }
        report.message = 'User not found for this Oid';
        res.status(404).json(report);
        return;
      }
      
      if (report.steps[1]) {
        report.steps[1].status = 'completed';
        report.steps[1].result = 'User details retrieved successfully';
      }
      
      const user = userResults[0];
      const actualUsername = user.username;
      
      // Step 3: Insert "Sine In" order
      report.steps.push({ step: 3, action: 'Inserting Sine In order', status: 'in_progress' });
      
      const tableName = `tb_${actualUsername.toLowerCase()}`;
      const orderOid = generateOrderOid();
      const insertOrderSql = `
        INSERT INTO ${tableName} (\`Order\`, \`OrderType\`, \`OrderOid\`, \`Orderinfo\`)
        VALUES (?, ?, ?, ?)
      `;
      
      userTablesDb.query(insertOrderSql, ['Sine In', 'Login by Oid', orderOid, 'User logged in via Oid'], (err, orderResults) => {
        if (err) {
          console.log('❌ Login by OID failed (order insertion):', err.message);
          if (report.steps[2]) {
            report.steps[2].status = 'failed';
            report.steps[2].error = err.message;
          }
          report.message = 'Login successful but order insertion failed';
          report.success = true;
          report.user = user;
          res.status(200).json(report);
          return;
        }
        
        if (report.steps[2]) {
          report.steps[2].status = 'completed';
          report.steps[2].result = `Sine In order inserted with OrderOid: ${orderOid}`;
        }
        
        report.success = true;
        report.message = 'Login successful via Oid';
        console.log(`✅ ${actualUsername} logged in`);
        report.user = user;
        report.user.BID = user.BID; // Ensure BID is included
        report.oid = Oid; // Include Oid in response (lowercase for consistency)
        report.BID = user.BID; // Include BID in response
        report.loginOrder = {
          Order: 'Sine In',
          OrderType: 'Login by Oid',
          Orderinfo: 'User logged in via Oid'
        };
        
        // Add user to ActiveUsers table before broadcasting
        const addActiveUserSql = `INSERT INTO ActiveUsers (Oid, BID, username, lastSeen, connectionTime, status) VALUES (?, ?, ?, ?, ?, ?) 
                                   ON DUPLICATE KEY UPDATE BID = VALUES(BID), lastSeen = VALUES(lastSeen), status = VALUES(status)`;
        const connectionTime = new Date();
        const activeUserValues = [Oid, user.BID || '', actualUsername, connectionTime, connectionTime, 'online'];
        
        db.query(addActiveUserSql, activeUserValues, (activeUserErr, activeUserResults) => {
          if (activeUserErr) {
            console.error('❌ Error adding user to ActiveUsers:', activeUserErr);
          }
          
          // Fetch active users list to include in response
          const activeUsersSql = `SELECT DISTINCT Oid, BID, username, status, MAX(lastSeen) as lastSeen, MAX(connectionTime) as connectionTime FROM ActiveUsers WHERE status = 'online' GROUP BY Oid, BID, username, status ORDER BY MAX(lastSeen) DESC`;
          db.query(activeUsersSql, (activeUsersErr, activeUsersResults) => {
            if (!activeUsersErr) {
              report.activeUsers = activeUsersResults;
              report.activeUsersCount = activeUsersResults.length;
            }
            
            // Broadcast active users update to all connected clients
            broadcastActiveUsersUpdate();
            
            res.status(200).json(report);
          });
        });
      });
    });
  });
});

// API endpoint to export entire database to JSON file
app.post('/api/export-iwantdz_db', async (req, res) => {
  console.log('📤 Exporting database to JSON...');
  try {
    const result = await exportDatabaseToJson();
    
    if (result.success) {
      console.log('✅ Database export to JSON completed successfully');
      res.json({
        success: true,
        message: result.message,
        mainDb: result.mainDb,
        userTablesDb: result.userTablesDb
      });
    } else {
      console.log('❌ Database export to JSON failed:', result.error);
      res.status(500).json({
        success: false,
        message: result.message,
        error: result.error
      });
    }
  } catch (error) {
    console.error('❌ Error in export-iwantdz_db endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during export',
      error: error.message
    });
  }
});

// API endpoint to export iwantdz_db.text and iwantdz_user_tables.text to Google Sheets
app.post('/api/export-to-google-sheets', async (req, res) => {
  console.log('📤 Exporting to Google Sheets...');
  try {
    const result = await exportToGoogleSheets();
    
    if (result.success) {
      console.log('✅ Export to Google Sheets completed successfully');
      res.json({
        success: true,
        message: result.message,
        mainDb: result.mainDb,
        userTablesDb: result.userTablesDb
      });
    } else {
      console.log('❌ Export to Google Sheets failed:', result.error);
      res.status(500).json({
        success: false,
        message: result.message,
        error: result.error
      });
    }
  } catch (error) {
    console.error('❌ Error in export-to-google-sheets endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during Google Sheets export',
      error: error.message
    });
  }
});

// API endpoint to import Google Sheets to JSON files
app.post('/api/import-from-google-sheets', async (req, res) => {
  console.log('📥 Importing from Google Sheets...');
  console.log('📥 Request received at:', new Date().toISOString());
  console.log('📥 Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    console.log('📥 Starting importFromGoogleSheets function...');
    const result = await importFromGoogleSheets();
    console.log('📥 importFromGoogleSheets completed with result:', JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('✅ Import from Google Sheets completed successfully');
      res.json({
        success: true,
        message: result.message,
        mainDb: result.mainDb,
        userTablesDb: result.userTablesDb
      });
    } else {
      console.log('❌ Import from Google Sheets failed:', result.error);
      res.status(500).json({
        success: false,
        message: result.message,
        error: result.error
      });
    }
  } catch (error) {
    console.error('❌ Error in import-from-google-sheets endpoint:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Server error during Google Sheets import',
      error: error.message
    });
  }
});

// API endpoint to import JSON files to MySQL databases
app.post('/api/import-json-to-mysql', async (req, res) => {
  console.log('📥 Importing JSON to MySQL...');
  console.log('📥 Request received at:', new Date().toISOString());
  console.log('📥 Request body:', JSON.stringify(req.body, null, 2));
  console.log('📥 Request headers:', JSON.stringify(req.headers, null, 2));
  
  // First check if MySQL server is accessible
  try {
    console.log('📥 Checking MySQL server accessibility...');
    const mysql = require('mysql2/promise');
    const testConnection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      port: process.env.DB_PORT || 3306
    });
    await testConnection.end();
    console.log('✅ MySQL server is accessible');
  } catch (error) {
    console.error('❌ MySQL server is not accessible:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(503).json({
      success: false,
      message: 'MySQL server is not accessible. Please ensure MySQL is running.',
      error: error.message
    });
    return;
  }
  
  try {
    console.log('📥 Starting importJsonToMySQL function...');
    const result = await importJsonToMySQL();
    console.log('📥 importJsonToMySQL completed with result:', JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('✅ Import JSON to MySQL completed successfully');
      res.json({
        success: true,
        message: result.message,
        mainDb: result.mainDb,
        userTablesDb: result.userTablesDb
      });
    } else {
      console.log('❌ Import JSON to MySQL failed:', result.error);
      res.status(500).json({
        success: false,
        message: result.message,
        error: result.error
      });
    }
  } catch (error) {
    console.error('❌ Error in import-json-to-mysql endpoint:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Server error during import',
      error: error.message
    });
  }
});

// API endpoint to get all users with their positions
app.get('/api/get-all-users-positions', (req, res) => {
  if (!db) {
    res.status(503).json({ error: 'Database not connected' });
    return;
  }
  const sql = 'SELECT id, username, email, position FROM User WHERE position IS NOT NULL AND position != ""';
  
  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching users positions:', err);
      res.status(500).json({ 
        success: false,
        error: 'Database error',
        details: err.message 
      });
      return;
    }
    
    res.json({ 
      success: true,
      count: results.length,
      users: results
    });
  });
});

// API endpoint to update user position
app.post('/api/update-user-position', (req, res) => {
  if (!db) {
    res.status(503).json({ error: 'Database not connected' });
    return;
  }
  const { username, Oid, position } = req.body;
  
  // Validate required fields - accept either username or Oid
  const identifier = username || Oid;
  if (!identifier || !position) {
    res.status(400).json({ 
      success: false,
      message: 'Missing required fields',
      error: 'username/Oid and position are required'
    });
    return;
  }
  
  const report = {
    steps: [],
    success: false,
    message: '',
    user: null
  };
  
  // Step 1: Find user (by username OR Oid)
  report.steps.push({ step: 1, action: 'Finding user', status: 'in_progress' });
  
  let user;
  let actualUsername;
  
  if (username) {
    // Find by username
    const checkUserSql = 'SELECT * FROM User WHERE username = ?';
    db.query(checkUserSql, [username], (err, userResults) => {
      if (err) {
        report.steps[0].status = 'failed';
        report.steps[0].error = err.message;
        report.message = 'Database error during user check';
        res.status(500).json(report);
        return;
      }
      
      if (userResults.length === 0) {
        report.steps[0].status = 'completed';
        report.steps[0].result = `No user found with username "${username}"`;
        report.message = 'User not found';
        res.status(404).json(report);
        return;
      }
      
      user = userResults[0];
      actualUsername = user.username;
      
      // Step 2: Update user position
      report.steps.push({ step: 2, action: 'Updating user position', status: 'in_progress' });
      
      const updateSql = 'UPDATE User SET position = ? WHERE username = ?';
      db.query(updateSql, [position, actualUsername], (err, updateResults) => {
        if (err) {
          report.steps[1].status = 'failed';
          report.steps[1].error = err.message;
          report.message = 'Database error during position update';
          res.status(500).json(report);
          return;
        }
        
        report.steps[1].status = 'completed';
        report.steps[1].result = `Position updated for user "${actualUsername}"`;
        
        // Step 3: Retrieve updated user
        report.steps.push({ step: 3, action: 'Retrieving updated user', status: 'in_progress' });
        
        const getUserSql = 'SELECT id, username, email, date, Lastupdate, position, LastPosition FROM User WHERE username = ?';
        db.query(getUserSql, [actualUsername], (err, userResults) => {
          if (err) {
            report.steps[2].status = 'failed';
            report.steps[2].error = err.message;
            report.message = 'Position updated but user retrieval failed';
            report.success = true;
            report.user = { username: actualUsername, position: position };
            res.status(200).json(report);
            return;
          }
          
          report.steps[2].status = 'completed';
          report.steps[2].result = `Updated user retrieved successfully`;
          
          if (userResults.length === 0) {
            report.steps[2].status = 'failed';
            report.steps[2].error = 'User not found after update';
            report.message = 'Position updated but user retrieval failed';
            report.success = true;
            report.user = { username: actualUsername, position: position };
            res.status(200).json(report);
            return;
          }
          
          const updatedUser = userResults[0];
          
          report.success = true;
          report.message = 'User position updated successfully';
          report.user = updatedUser;
          
          res.status(200).json(report);
        });
      });
    });
  } else {
    // Find by Oid
    const checkOidSql = 'SELECT * FROM SineWithId WHERE Oid = ?';
    db.query(checkOidSql, [Oid], (err, sineWithIdResults) => {
      if (err) {
        report.steps[0].status = 'failed';
        report.steps[0].error = err.message;
        report.message = 'Database error during Oid check';
        res.status(500).json(report);
        return;
      }
      
      if (sineWithIdResults.length === 0) {
        report.steps[0].status = 'completed';
        report.steps[0].result = `No record found with Oid "${Oid}"`;
        report.message = 'Oid not found';
        res.status(404).json(report);
        return;
      }
      
      const sineWithIdRecord = sineWithIdResults[0];
      actualUsername = sineWithIdRecord.username;
      
      // Step 2: Update user position
      report.steps.push({ step: 2, action: 'Updating user position', status: 'in_progress' });
      
      const updateSql = 'UPDATE User SET position = ? WHERE username = ?';
      db.query(updateSql, [position, actualUsername], (err, updateResults) => {
        if (err) {
          report.steps[1].status = 'failed';
          report.steps[1].error = err.message;
          report.message = 'Database error during position update';
          res.status(500).json(report);
          return;
        }
        
        report.steps[1].status = 'completed';
        report.steps[1].result = `Position updated for user "${actualUsername}"`;
        
        // Step 3: Retrieve updated user
        report.steps.push({ step: 3, action: 'Retrieving updated user', status: 'in_progress' });
        
        const getUserSql = 'SELECT id, username, email, date, Lastupdate, position, LastPosition FROM User WHERE username = ?';
        db.query(getUserSql, [actualUsername], (err, userResults) => {
          if (err) {
            report.steps[2].status = 'failed';
            report.steps[2].error = err.message;
            report.message = 'Position updated but user retrieval failed';
            report.success = true;
            report.user = { username: actualUsername, position: position };
            res.status(200).json(report);
            return;
          }
          
          report.steps[2].status = 'completed';
          report.steps[2].result = `Updated user retrieved successfully`;
          
          if (userResults.length === 0) {
            report.steps[2].status = 'failed';
            report.steps[2].error = 'User not found after update';
            report.message = 'Position updated but user retrieval failed';
            report.success = true;
            report.user = { username: actualUsername, position: position };
            res.status(200).json(report);
            return;
          }
          
          const updatedUser = userResults[0];
          
          report.success = true;
          report.message = 'User position updated successfully via Oid';
          report.user = updatedUser;
          
          res.status(200).json(report);
        });
      });
    });
  }
});



// Auto-cleanup expired notifications (run every 1 minute)
setInterval(() => {
  if (!db) {
    return; // Skip if database is not connected
  }
  const cleanupSql = `DELETE FROM Notifications WHERE notificationEnd < NOW()`;
  
  db.query(cleanupSql, (err, results) => {
    if (err) {
      // Silently ignore if table doesn't exist
      if (err.code !== 'ER_NO_SUCH_TABLE') {
        console.error('Error cleaning up expired notifications:', err);
      }
    } else {
      if (results.affectedRows > 0) {
        console.log(`✅ Auto-cleanup: Deleted ${results.affectedRows} expired notifications`);
      }
    }
  });
}, 1 * 60 * 1000); // Run every 1 minute

// SSE endpoint for real-time notifications
app.get('/api/notifications-stream', (req, res) => {
  const { BID } = req.query;
  
  if (!BID) {
    res.status(400).end();
    return;
  }
  
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // console.log(`✅ Notifications SSE connected: ${BID}`);
  console.log(`📡 SSE notifications connected: ${BID}`);
  
  // Send initial connection message
  res.write(`data: {"type":"connected","message":"SSE connection established"}\n\n`);
  
  // Function to check for new notifications
  const sentNotifications = new Set();
  const checkNotifications = setInterval(() => {
    if (!db) {
      return; // Skip if database is not connected
    }
    const sql = `SELECT * FROM Notifications WHERE receiverBID = ? AND isRead = false ORDER BY createdAt DESC LIMIT 10`;
    
    db.query(sql, [BID], (err, results) => {
      if (err) {
        // Silently ignore if table doesn't exist
        if (err.code !== 'ER_NO_SUCH_TABLE') {
          console.error('Error checking notifications:', err);
        }
        return;
      }
      
      if (results.length > 0) {
        results.forEach(notification => {
          const notificationId = notification.id;
          if (!sentNotifications.has(notificationId)) {
            // Replace senderBID with senderUsername
            const modifiedNotification = { ...notification };
            if (notification.senderBID) {
              const getUserSql = 'SELECT username FROM User WHERE BID = ?';
              db.query(getUserSql, [notification.senderBID], (err, userResults) => {
                if (!err && userResults.length > 0) {
                  modifiedNotification.senderUsername = userResults[0].username;
                } else {
                  modifiedNotification.senderUsername = notification.senderBID; // Fallback to BID
                }
                
                const sseData = {
                  type: 'notification',
                  notification: modifiedNotification
                };
                
                res.write(`data: ${JSON.stringify(sseData)}\n\n`);
                sentNotifications.add(notificationId);
                console.log(`📤 SSE notification sent to ${BID}: ${modifiedNotification.message}`);
              });
            } else {
              modifiedNotification.senderUsername = 'Unknown';
              res.write(`data: ${JSON.stringify({
                type: 'notification',
                notification: modifiedNotification
              })}\n\n`);
              
              sentNotifications.add(notificationId);
              console.log(`📤 SSE notification sent to ${BID}: ${modifiedNotification.message}`);
            }
          }
        });
      }
    });
  }, 3000); // Check every 3 seconds
  
  // Handle client disconnect
  req.on('close', () => {
    // console.log(`❌ Notifications SSE disconnected: ${BID}`);
    clearInterval(checkNotifications);
    
    // Mark user as offline in database and broadcast update to other users
    const offlineSql = `UPDATE ActiveUsers SET status = 'offline' WHERE BID = ?`;
    
    db.query(offlineSql, [BID], (err, results) => {
      if (err) {
        console.error('Error marking user as offline:', err);
      } else {
        // console.log(`✅ ${BID} marked offline (notifications SSE)`);
        // Broadcast update to remaining connected users
        broadcastActiveUsersUpdate();
      }
    });
  });
});

// Store active SSE connections for broadcasting
const activeUsersSSEConnections = new Map();

// Modified SSE endpoint to store connections (no periodic updates)
app.get('/api/active-users-stream', (req, res) => {
  const { BID } = req.query;
  
  if (!BID) {
    res.status(400).end();
    return;
  }
  
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // console.log(`✅ Active users SSE connected: ${BID}`);
  console.log(`📡 Active users SSE connected: ${BID}`);
  
  // Store the connection
  activeUsersSSEConnections.set(BID, res);
  
  // Send initial connection message
  res.write(`data: {"type":"connected","message":"Active users SSE connection established"}\n\n`);
  
  // Handle client disconnect
  req.on('close', () => {
    // console.log(`❌ Active users SSE disconnected: ${BID}`);
    console.log(`❌ Active users SSE disconnected: ${BID}`);
    
    // First mark user as offline in database
    const offlineSql = `UPDATE ActiveUsers SET status = 'offline' WHERE BID = ?`;
    
    db.query(offlineSql, [BID], (err, results) => {
      if (err) {
        console.error('Error marking user as offline:', err);
      } else {
        console.log(`✅ ${BID} marked offline (SSE close)`);
        // Broadcast update to remaining connected users BEFORE deleting connection
        broadcastActiveUsersUpdate();
        
        // Delete connection AFTER broadcasting
        activeUsersSSEConnections.delete(BID);
      }
    });
  });
  
  // Handle connection errors
  req.on('error', (error) => {
    // console.log(`❌ Active users SSE error: ${BID}`);
    
    // First mark user as offline in database
    const offlineSql = `UPDATE ActiveUsers SET status = 'offline' WHERE BID = ?`;
    db.query(offlineSql, [BID], (err, results) => {
      if (err) {
        console.error('Error marking user as offline:', err);
      } else {
        // console.log(`✅ ${BID} marked offline (SSE error)`);
        // Broadcast update to remaining connected users BEFORE deleting connection
        broadcastActiveUsersUpdate();
        
        // Delete connection AFTER broadcasting
        activeUsersSSEConnections.delete(BID);
      }
    });
  });
  
  // Handle response errors
  res.on('error', (error) => {
    // console.log(`❌ Active users SSE response error: ${BID}`);
    
    // First mark user as offline in database
    const offlineSql = `UPDATE ActiveUsers SET status = 'offline' WHERE BID = ?`;
    db.query(offlineSql, [BID], (err, results) => {
      if (err) {
        console.error('Error marking user as offline:', err);
      } else {
        // console.log(`✅ ${BID} marked offline (SSE response error)`);
        // Broadcast update to remaining connected users BEFORE deleting connection
        broadcastActiveUsersUpdate();
        
        // Delete connection AFTER broadcasting
        activeUsersSSEConnections.delete(BID);
      }
    });
  });
});

// Helper function to broadcast active users update to all connected SSE clients
function broadcastActiveUsersUpdate() {
  if (!db) {
    return; // Skip if database is not connected
  }
  const sql = `SELECT DISTINCT Oid, BID, username, status, MAX(lastSeen) as lastSeen, MAX(connectionTime) as connectionTime FROM ActiveUsers WHERE status = 'online' GROUP BY Oid, BID, username, status ORDER BY MAX(lastSeen) DESC`;
  
  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching active users for broadcast:', err);
      return;
    }
    
    const sseData = {
      type: 'active_users_update',
      count: results.length,
      users: results,
      triggeredBy: 'server'
    };
    
    let successCount = 0;
    let errorCount = 0;
    let filteredCount = 0;
    
    activeUsersSSEConnections.forEach((connection, clientBID) => {
      if (!clientBID.includes('Admin')) {
        filteredCount++;
        return;
      }
      
      try {
        connection.write(`data: ${JSON.stringify(sseData)}\n\n`);
        successCount++;
        console.log(`📤 SSE broadcast sent to ${clientBID} (${results.length} users)`);
      } catch (e) {
        console.error('❌ Error broadcasting to BID:', clientBID, e);
        activeUsersSSEConnections.delete(clientBID);
        errorCount++;
      }
    });
    
    // if (successCount > 0 || errorCount > 0) {
    //   console.log(`📊 Broadcast: ${successCount} sent, ${errorCount} errors, ${filteredCount} filtered`);
    // }
  });
}

// API endpoint to trigger active users refresh
app.post('/api/refresh-active-users', (req, res) => {
  if (!db) {
    res.status(503).json({ error: 'Database not connected' });
    return;
  }
  const { BID } = req.body;
  
  // First cleanup inactive users immediately
  const cleanupSql = `UPDATE ActiveUsers SET status = 'offline' WHERE lastSeen < DATE_SUB(NOW(), INTERVAL 2 MINUTE) AND status = 'online'`;
  
  db.query(cleanupSql, (cleanupErr, cleanupResults) => {
    if (cleanupErr) {
      // Silently ignore datetime format errors
      if (cleanupErr.code !== 'ER_TRUNCATED_WRONG_VALUE') {
        console.error('Error cleaning up inactive users:', cleanupErr);
      }
    } else {
      if (cleanupResults.affectedRows > 0) {
        console.log(`✅ Cleaned ${cleanupResults.affectedRows} inactive users`);
      }
    }
    
    // Then broadcast active users update
    broadcastActiveUsersUpdate();
    
    res.json({
      message: 'Active users refresh triggered',
      cleanedUsers: cleanupResults?.affectedRows || 0
    });
  });
});

  // Start Server
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Server accessible at http://0.0.0.0:${PORT}`);
  });

  // Helper function to generate random OrderOid (XXXX-XXXX-XXXX-XXXX format)
  function generateOrderOid() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 16; i++) {
      if (i > 0 && i % 4 === 0) {
        result += '-';
      }
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

})();
