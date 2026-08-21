#!/bin/bash

if ! command -v mysql &> /dev/null; then
    sudo apt update
    sudo apt install -y mysql-server
    sudo mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'root'; FLUSH PRIVILEGES;"
fi

sudo service mysql start
cd backend
node server.js
