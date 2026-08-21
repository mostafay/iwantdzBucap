# API Links Reference

## Database Setup (Manual)

### Create iwantdz_db database:
```sql
CREATE DATABASE iwantdz_db;
```

### Create iwantdz_user_tables database:
```sql
CREATE DATABASE iwantdz_user_tables;
```

## Table Creation Links

### 1. Create User table in iwantdz_db:
```bash
curl -X POST http://localhost:3000/api/create-table -H "Content-Type: application/json" -d "{\"tableName\":\"User\",\"columns\":[{\"name\":\"id\",\"type\":\"INT\",\"constraints\":\"AUTO_INCREMENT PRIMARY KEY\"},{\"name\":\"username\",\"type\":\"VARCHAR(255)\",\"constraints\":\"NOT NULL UNIQUE\"},{\"name\":\"email\",\"type\":\"VARCHAR(255)\",\"constraints\":\"NOT NULL UNIQUE\"},{\"name\":\"password\",\"type\":\"VARCHAR(255)\",\"constraints\":\"NOT NULL\"},{\"name\":\"BID\",\"type\":\"VARCHAR(255)\",\"constraints\":\"NOT NULL UNIQUE\"},{\"name\":\"date\",\"type\":\"TIMESTAMP\",\"constraints\":\"DEFAULT CURRENT_TIMESTAMP\"},{\"name\":\"Lastupdate\",\"type\":\"TIMESTAMP\",\"constraints\":\"\"},{\"name\":\"position\",\"type\":\"VARCHAR(255)\",\"constraints\":\"\"},{\"name\":\"LastPosition\",\"type\":\"VARCHAR(255)\",\"constraints\":\"\"},{\"name\":\"points\",\"type\":\"INT\",\"constraints\":\"DEFAULT 0\"},{\"name\":\"posts\",\"type\":\"INT\",\"constraints\":\"DEFAULT 0\"},{\"name\":\"gets\",\"type\":\"INT\",\"constraints\":\"DEFAULT 0\"},{\"name\":\"prexs\",\"type\":\"INT\",\"constraints\":\"DEFAULT 0\"},{\"name\":\"other1\",\"type\":\"TEXT\",\"constraints\":\"\"},{\"name\":\"other2\",\"type\":\"TEXT\",\"constraints\":\"\"},{\"name\":\"info\",\"type\":\"TEXT\",\"constraints\":\"\"}]}"
```

### 2. Create SineWithId table in iwantdz_db:
```bash
curl -X POST http://localhost:3000/api/create-table -H "Content-Type: application/json" -d "{\"tableName\":\"SineWithId\",\"columns\":[{\"name\":\"id\",\"type\":\"INT\",\"constraints\":\"AUTO_INCREMENT PRIMARY KEY\"},{\"name\":\"username\",\"type\":\"VARCHAR(255)\",\"constraints\":\"NOT NULL\"},{\"name\":\"Oid\",\"type\":\"VARCHAR(255)\",\"constraints\":\"NOT NULL\"},{\"name\":\"dateTime\",\"type\":\"TIMESTAMP\",\"constraints\":\"DEFAULT CURRENT_TIMESTAMP\"},{\"name\":\"Device\",\"type\":\"VARCHAR(255)\",\"constraints\":\"\"}]}"
```

### 3. Create Taskes table in iwantdz_db:
```bash
curl -X POST http://localhost:3000/api/create-table -H "Content-Type: application/json" -d "{\"tableName\":\"Taskes\",\"columns\":[{\"name\":\"id\",\"type\":\"INT\",\"constraints\":\"AUTO_INCREMENT PRIMARY KEY\"},{\"name\":\"dateTime\",\"type\":\"TIMESTAMP\",\"constraints\":\"DEFAULT CURRENT_TIMESTAMP\"},{\"name\":\"Order\",\"type\":\"VARCHAR(255)\",\"constraints\":\"\"},{\"name\":\"OrderType\",\"type\":\"VARCHAR(255)\",\"constraints\":\"\"},{\"name\":\"OrderUser\",\"type\":\"VARCHAR(255)\",\"constraints\":\"\"},{\"name\":\"OrderIndex\",\"type\":\"INT\",\"constraints\":\"\"},{\"name\":\"OrderPosision\",\"type\":\"VARCHAR(255)\",\"constraints\":\"\"},{\"name\":\"Orderdate\",\"type\":\"TIMESTAMP\",\"constraints\":\"DEFAULT CURRENT_TIMESTAMP\"},{\"name\":\"OrderLast\",\"type\":\"TIMESTAMP\",\"constraints\":\"\"},{\"name\":\"OrderPrex\",\"type\":\"VARCHAR(255)\",\"constraints\":\"\"},{\"name\":\"OrderOid\",\"type\":\"VARCHAR(255)\",\"constraints\":\"\"},{\"name\":\"OrderOther\",\"type\":\"TEXT\",\"constraints\":\"\"},{\"name\":\"OrderExpired\",\"type\":\"DATETIME\",\"constraints\":\"\"},{\"name\":\"Orderinfo\",\"type\":\"TEXT\",\"constraints\":\"\"}]}"
```

### 4. Create ActiveUsers table in iwantdz_db:
```bash
curl -X POST http://localhost:3000/api/create-table -H "Content-Type: application/json" -d "{\"tableName\":\"ActiveUsers\",\"columns\":[{\"name\":\"id\",\"type\":\"INT\",\"constraints\":\"AUTO_INCREMENT PRIMARY KEY\"},{\"name\":\"Oid\",\"type\":\"VARCHAR(255)\",\"constraints\":\"NOT NULL UNIQUE\"},{\"name\":\"BID\",\"type\":\"VARCHAR(255)\",\"constraints\":\"\"},{\"name\":\"username\",\"type\":\"VARCHAR(255)\",\"constraints\":\"\"},{\"name\":\"lastSeen\",\"type\":\"TIMESTAMP\",\"constraints\":\"DEFAULT CURRENT_TIMESTAMP\"},{\"name\":\"connectionTime\",\"type\":\"TIMESTAMP\",\"constraints\":\"DEFAULT CURRENT_TIMESTAMP\"},{\"name\":\"status\",\"type\":\"VARCHAR(50)\",\"constraints\":\"DEFAULT 'online'\"}]}"
```

### 5. Create Notifications table in iwantdz_db (BID-based):
```bash
curl -X POST http://localhost:3000/api/create-table -H "Content-Type: application/json" -d "{\"tableName\":\"Notifications\",\"columns\":[{\"name\":\"id\",\"type\":\"INT\",\"constraints\":\"AUTO_INCREMENT PRIMARY KEY\"},{\"name\":\"receiverBID\",\"type\":\"VARCHAR(255)\",\"constraints\":\"NOT NULL\"},{\"name\":\"senderBID\",\"type\":\"VARCHAR(255)\",\"constraints\":\"\"},{\"name\":\"message\",\"type\":\"TEXT\",\"constraints\":\"\"},{\"name\":\"type\",\"type\":\"VARCHAR(50)\",\"constraints\":\"DEFAULT 'info'\"},{\"name\":\"isRead\",\"type\":\"BOOLEAN\",\"constraints\":\"DEFAULT false\"},{\"name\":\"notificationStart\",\"type\":\"TIMESTAMP\",\"constraints\":\"DEFAULT CURRENT_TIMESTAMP\"},{\"name\":\"notificationEnd\",\"type\":\"TIMESTAMP\",\"constraints\":\"\"},{\"name\":\"createdAt\",\"type\":\"TIMESTAMP\",\"constraints\":\"DEFAULT CURRENT_TIMESTAMP\"}]}"
```

## User Authentication Links

### 1. Register new user:
```bash
curl -X POST http://localhost:3000/api/register-user -H "Content-Type: application/json" -d "{\"username\":\"DemoUser\",\"email\":\"demo@gmail.com\",\"password\":\"12345678\"}"
```

### 2. Login with username and password:
```bash
curl -X POST http://localhost:3000/api/login-user -H "Content-Type: application/json" -d "{\"username\":\"DemoUser\",\"password\":\"12345678\"}"
```

### 3. Login by Oid:
```bash
curl -X POST http://localhost:3000/api/login-by-oid -H "Content-Type: application/json" -d "{\"Oid\":\"ABCD-1234-EFGH-5678\"}"
```

### 4. Update user position:
```bash
curl -X POST http://localhost:3000/api/update-user-position -H "Content-Type: application/json" -d "{\"username\":\"DemoUser\",\"position\":\"40.7128,-74.0060\"}"
```

### 5. Get all users with their positions:
```bash
curl -X GET http://localhost:3000/api/get-all-users-positions
```

## Data Manipulation Links

### 1. Insert row into table:
```bash
curl -X POST http://localhost:3000/api/insert-row -H "Content-Type: application/json" -d "{\"tableName\":\"SineWithId\",\"data\":{\"username\":\"DemoUser\",\"Oid\":\"ABCD-1234-EFGH-5678\",\"Device\":\"Mobile\"}}"
```

### 2. Insert row into Taskes table:
```bash
curl -X POST http://$HOST:3000/api/insert-row -H "Content-Type: application/json" -d "{\"tableName\":\"Taskes\",\"data\":{\"Order\":\"Test Order\",\"OrderType\":\"Test\",\"OrderUser\":\"DemoUser\",\"OrderIndex\":1,\"OrderPosision\":\"Position 1\",\"Orderdate\":\"2026-08-14 10:00:00\",\"OrderLast\":\"2026-08-14 12:00:00\",\"OrderPrex\":\"Prex\",\"OrderOid\":\"TEST-1234-TEST-5678\",\"OrderOther\":\"Other info\",\"Orderinfo\":\"Test order info\"}}"
```

### 3. Query/filter rows from table:
```bash
curl -X POST http://localhost:3000/api/query -H "Content-Type: application/json" -d "{\"tableName\":\"SineWithId\"}"
```

### 4. Query with conditions:
```bash
curl -X POST http://localhost:3000/api/query -H "Content-Type: application/json" -d "{\"tableName\":\"SineWithId\",\"conditions\":{\"username\":\"DemoUser\"}}"
```

### 5. Get table schema:
```bash
curl -X GET http://localhost:3000/api/table-schema?tableName=SineWithId
```

## Database Export Links

### Export both iwantdz_db and iwantdz_user_tables databases to JSON files:
```bash
curl -X POST http://localhost:3000/api/export-iwantdz_db
```
This will export:
- iwantdz_db → iwantdz_db.text
- iwantdz_user_tables → iwantdz_user_tables.text

### Export both iwantdz_db.text and iwantdz_user_tables.text to Google Sheets:
```bash
curl -X POST http://localhost:3000/api/export-to-google-sheets
```
This will export:
- iwantdz_db.text → Google Sheets (api_iwantdz_db) with a sheet for each table
- iwantdz_user_tables.text → Google Sheets (api_iwantdz_user_tables) with a sheet for each table

### Import both Google Sheets to JSON files:
```bash
curl -X POST http://localhost:3000/api/import-from-google-sheets
```
This will import:
- Google Sheets (api_iwantdz_db) → iwantdz_db.text
- Google Sheets (api_iwantdz_user_tables) → iwantdz_user_tables.text

### Import both JSON files to MySQL databases:
```bash
curl -X POST http://localhost:3000/api/import-json-to-mysql
```
This will import:
- iwantdz_db.text → MySQL database iwantdz_db
- iwantdz_user_tables.text → MySQL database iwantdz_user_tables

## Health Check

### Check server health:
```bash
curl -X GET http://localhost:3000/api/health
```

## Connection Status & Notifications

### Update connection status:
```bash
curl -X POST http://localhost:3000/api/update-connection-status -H "Content-Type: application/json" -d "{\"Oid\":\"ABCD-1234-EFGH-5678\",\"username\":\"DemoUser\",\"status\":\"online\"}"
```

### Get active users:
```bash
curl -X GET http://localhost:3000/api/get-active-users
```

### Send notification to specific user:
```bash
curl -X POST http://localhost:3000/api/send-notification -H "Content-Type: application/json" -d "{\"targetBID\":\"ZOD0-V7QB-15A4-5TPA\",\"senderBID\":\"ABCD-1234-EFGH-5678\",\"message\":\"Hello!\",\"type\":\"info\"}"
```

### Send notification to all users:
```bash
curl -X POST http://localhost:3000/api/send-notification -H "Content-Type: application/json" -d "{\"targetBID\":\"all\",\"senderBID\":\"ABCD-1234-EFGH-5678\",\"message\":\"Broadcast message\",\"type\":\"info\"}"
```

### Get notifications for user:
```bash
curl -X GET "http://localhost:3000/api/get-notifications?BID=ZOD0-V7QB-15A4-5TPA&unreadOnly=true"
```

### Mark notification as read:
```bash
curl -X POST http://localhost:3000/api/mark-notification-read -H "Content-Type: application/json" -d "{\"notificationId\":1}"
```

## Notes

- All table creation links use the main database `iwantdz_db`
- User-specific tables (tb_username) are created automatically in `iwantdz_user_tables` during registration
- Reserved SQL words (Order, OrderType, etc.) are automatically escaped with backticks
- The server runs on port 3000 by default
- Use nodemon for auto-reload during development: `npm run dev`
