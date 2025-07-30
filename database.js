const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
    constructor() {
        this.dbPath = path.join(__dirname, 'data', 'fileparser.db');
        this.ensureDataDirectory();
        this.init();
    }

    ensureDataDirectory() {
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
    }

    init() {
        this.db = new sqlite3.Database(this.dbPath, (err) => {
            if (err) {
                console.error('Error opening database:', err);
            } else {
                console.log('Connected to SQLite database');
                this.createTables();
            }
        });
    }

    createTables() {
        // Table to track uploaded files
        const uploadsTable = `
            CREATE TABLE IF NOT EXISTS uploads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                file_type TEXT NOT NULL,
                record_count INTEGER NOT NULL,
                upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                file_path TEXT NOT NULL,
                table_name TEXT UNIQUE NOT NULL
            )
        `;

        // Table to track statistics
        const statsTable = `
            CREATE TABLE IF NOT EXISTS stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                total_uploads INTEGER DEFAULT 0,
                total_records INTEGER DEFAULT 0,
                csv_files INTEGER DEFAULT 0,
                json_files INTEGER DEFAULT 0,
                xml_files INTEGER DEFAULT 0,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;

        this.db.serialize(() => {
            this.db.run(uploadsTable);
            this.db.run(statsTable);
            
            // Initialize stats if empty
            this.db.get("SELECT COUNT(*) as count FROM stats", (err, row) => {
                if (row.count === 0) {
                    this.db.run("INSERT INTO stats (total_uploads, total_records, csv_files, json_files, xml_files) VALUES (0, 0, 0, 0, 0)");
                }
            });
        });
    }

    // Create a new table for a specific file
    createFileTable(tableName, headers) {
        return new Promise((resolve, reject) => {
            // Create a dynamic table based on the headers
            let columns = headers.map(header => {
                // Clean header name for SQL (remove special characters)
                const cleanHeader = header.replace(/[^a-zA-Z0-9_]/g, '_');
                return `"${cleanHeader}" TEXT`;
            }).join(', ');

            const createTableSQL = `
                CREATE TABLE IF NOT EXISTS "${tableName}" (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ${columns}
                )
            `;

            this.db.run(createTableSQL, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    // Insert records into a file's table
    insertRecords(tableName, records) {
        return new Promise((resolve, reject) => {
            if (records.length === 0) {
                resolve(0);
                return;
            }

            // Get headers from first record
            const headers = Object.keys(records[0]);
            const placeholders = headers.map(() => '?').join(', ');
            const columnNames = headers.map(h => `"${h.replace(/[^a-zA-Z0-9_]/g, '_')}"`).join(', ');

            const insertSQL = `INSERT INTO "${tableName}" (${columnNames}) VALUES (${placeholders})`;

            const stmt = this.db.prepare(insertSQL);
            let insertedCount = 0;

            records.forEach((record, index) => {
                const values = headers.map(header => record[header] || '');
                stmt.run(values, function(err) {
                    if (err) {
                        reject(err);
                        return;
                    }
                    insertedCount++;
                    
                    if (index === records.length - 1) {
                        stmt.finalize((err) => {
                            if (err) {
                                reject(err);
                            } else {
                                resolve(insertedCount);
                            }
                        });
                    }
                });
            });
        });
    }

    // Add upload record to uploads table
    addUpload(filename, fileType, recordCount, filePath, tableName) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO uploads (filename, file_type, record_count, file_path, table_name)
                VALUES (?, ?, ?, ?, ?)
            `;
            
            this.db.run(sql, [filename, fileType, recordCount, filePath, tableName], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    // Update statistics
    updateStats(fileType, recordCount) {
        return new Promise((resolve, reject) => {
            const updateSQL = `
                UPDATE stats 
                SET total_uploads = total_uploads + 1,
                    total_records = total_records + ?,
                    ${fileType}_files = ${fileType}_files + 1,
                    last_updated = CURRENT_TIMESTAMP
            `;
            
            this.db.run(updateSQL, [recordCount], (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    // Get all uploads
    getUploads() {
        return new Promise((resolve, reject) => {
            const sql = "SELECT * FROM uploads ORDER BY upload_date DESC LIMIT 20";
            this.db.all(sql, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Get statistics
    getStats() {
        return new Promise((resolve, reject) => {
            const sql = "SELECT * FROM stats LIMIT 1";
            this.db.get(sql, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    // Get records from a specific file table
    getFileRecords(tableName, limit = 100) {
        return new Promise((resolve, reject) => {
            const sql = `SELECT * FROM "${tableName}" LIMIT ?`;
            this.db.all(sql, [limit], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Get all file records for Power BI
    getAllRecords() {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT u.filename, u.file_type, u.record_count, u.upload_date, u.table_name
                FROM uploads u
                ORDER BY u.upload_date DESC
            `;
            
            this.db.all(sql, (err, uploads) => {
                if (err) {
                    reject(err);
                } else {
                    // For each upload, get sample records
                    const promises = uploads.map(upload => 
                        this.getFileRecords(upload.table_name, 10)
                            .then(records => ({
                                ...upload,
                                sample_records: records
                            }))
                    );
                    
                    Promise.all(promises)
                        .then(results => resolve(results))
                        .catch(reject);
                }
            });
        });
    }

    // Close database connection
    close() {
        this.db.close((err) => {
            if (err) {
                console.error('Error closing database:', err);
            } else {
                console.log('Database connection closed');
            }
        });
    }
}

module.exports = new Database(); 