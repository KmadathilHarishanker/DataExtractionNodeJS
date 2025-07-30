var express = require('express');
var router = express.Router();
var multer = require('multer');
var fs = require('fs');
var path = require('path');
var csv = require('csv-parser');
var xml2js = require('xml2js');
var db = require('../database');
const jwt = require('jsonwebtoken');

// Power BI API integration
const PowerBI = require('powerbi-client');

// Power BI configuration (replace with your actual values)
const POWERBI_ACCESS_TOKEN = 'YOUR_POWERBI_ACCESS_TOKEN';
const POWERBI_WORKSPACE_ID = 'YOUR_WORKSPACE_ID';
const POWERBI_DATASET_ID = 'YOUR_DATASET_ID';

// Metabase embedding config (replace with your actual values)
const METABASE_SITE_URL = "http://localhost:3000";
const METABASE_SECRET_KEY = "YOUR_METABASE_EMBEDDING_SECRET_KEY"; // <-- set this!
const RECENT_FILES_DASHBOARD_ID = 1; // <-- set your dashboard ID

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = ['.csv', '.json', '.xml'];
    const fileExt = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(fileExt)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV, JSON, and XML files are allowed'));
    }
  }
});

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

/* GET Database viewer */
router.get('/database-viewer', function(req, res) {
  res.render('database-viewer', { 
    title: 'Database Viewer'
  });
});

/* GET Latest file Power BI report */
router.get('/latest-report', async function(req, res) {
  try {
    // Get the most recent upload
    const uploads = await db.getUploads();
    if (!uploads || uploads.length === 0) {
      return res.render('latest-report', { 
        title: 'Latest Power BI Report',
        hasData: false,
        message: 'No files have been uploaded yet.'
      });
    }

    const latestUpload = uploads[0]; // Most recent upload
    const tableName = latestUpload.table_name;
    
    // Get records from the latest file
    const records = await db.getFileRecords(tableName, 1000); // Get up to 1000 records
    
    // Generate Power BI embed URL for the latest file
    const powerBIEmbedUrl = await generatePowerBIEmbedUrl(tableName, latestUpload);
    
    res.render('latest-report', { 
      title: 'Latest Power BI Report',
      hasData: true,
      powerBIEmbedUrl: powerBIEmbedUrl,
      upload: latestUpload,
      recordCount: records.length
    });
  } catch (error) {
    console.error('Error generating latest Power BI report:', error);
    res.status(500).render('latest-report', { 
      title: 'Latest Power BI Report',
      hasData: false,
      message: 'Error generating Power BI report. Please try again.'
    });
  }
});

/* GET API endpoint for latest Power BI report data */
router.get('/api/latest-report', async function(req, res) {
  try {
    const uploads = await db.getUploads();
    if (!uploads || uploads.length === 0) {
      return res.json({ error: 'No files uploaded yet' });
    }

    const latestUpload = uploads[0];
    const tableName = latestUpload.table_name;
    const records = await db.getFileRecords(tableName, 1000);
    
    // Generate Power BI embed URL
    const powerBIEmbedUrl = await generatePowerBIEmbedUrl(tableName, latestUpload);
    
    res.json({
      success: true,
      powerBIEmbedUrl: powerBIEmbedUrl,
      upload: latestUpload,
      recordCount: records.length
    });
  } catch (error) {
    console.error('Error getting latest Power BI report data:', error);
    res.status(500).json({ error: 'Failed to generate Power BI report data' });
  }
});

/* GET Export latest file data as CSV for Power BI */
router.get('/api/export-latest-csv', async function(req, res) {
  try {
    const uploads = await db.getUploads();
    if (!uploads || uploads.length === 0) {
      return res.status(404).json({ error: 'No files uploaded yet' });
    }

    const latestUpload = uploads[0];
    const tableName = latestUpload.table_name;
    const records = await db.getFileRecords(tableName, 10000); // Get up to 10,000 records
    
    if (records.length === 0) {
      return res.status(404).json({ error: 'No data found in the latest file' });
    }

    // Convert to CSV
    const headers = Object.keys(records[0]);
    const csvContent = [
      headers.join(','),
      ...records.map(record => 
        headers.map(header => {
          const value = record[header] || '';
          // Escape commas and quotes
          return `"${String(value).replace(/"/g, '""')}"`;
        }).join(',')
      )
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="latest-data-${Date.now()}.csv"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

/* GET Export latest file data as JSON for Power BI */
router.get('/api/export-latest-json', async function(req, res) {
  try {
    const uploads = await db.getUploads();
    if (!uploads || uploads.length === 0) {
      return res.status(404).json({ error: 'No files uploaded yet' });
    }

    const latestUpload = uploads[0];
    const tableName = latestUpload.table_name;
    const records = await db.getFileRecords(tableName, 10000); // Get up to 10,000 records
    
    if (records.length === 0) {
      return res.status(404).json({ error: 'No data found in the latest file' });
    }

    // Add metadata to the JSON
    const exportData = {
      metadata: {
        filename: latestUpload.filename,
        fileType: latestUpload.file_type,
        uploadDate: latestUpload.upload_date,
        recordCount: records.length,
        tableName: latestUpload.table_name
      },
      records: records
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="latest-data-${Date.now()}.json"`);
    res.json(exportData);
  } catch (error) {
    console.error('Error exporting JSON:', error);
    res.status(500).json({ error: 'Failed to export JSON' });
  }
});

/* GET Export all uploads summary for Power BI */
router.get('/api/export-uploads-summary', async function(req, res) {
  try {
    const uploads = await db.getUploads();
    const stats = await db.getStats();
    
    const summaryData = {
      uploads: uploads.map(upload => ({
        filename: upload.filename,
        fileType: upload.file_type,
        fileSize: upload.file_size,
        uploadDate: upload.upload_date,
        tableName: upload.table_name
      })),
      stats: stats
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="uploads-summary-${Date.now()}.json"`);
    res.json(summaryData);
  } catch (error) {
    console.error('Error exporting uploads summary:', error);
    res.status(500).json({ error: 'Failed to export uploads summary' });
  }
});

/* POST file upload */
router.post('/upload', upload.single('file'), async function(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const fileType = path.extname(req.file.originalname).toLowerCase();
    const filename = req.file.originalname;
    
    // Generate unique table name for this file
    const tableName = `file_${Date.now()}_${Math.round(Math.random() * 1E9)}`;
    
    let records = [];
    let recordCount = 0;

    // Parse file based on type
    switch (fileType) {
      case '.csv':
        records = await parseCSV(filePath);
        recordCount = records.length;
        break;
      case '.json':
        records = await parseJSON(filePath);
        recordCount = records.length;
        break;
      case '.xml':
        records = await parseXML(filePath);
        recordCount = records.length;
        break;
      default:
        return res.status(400).json({ error: 'Unsupported file type' });
    }

    // Store records in database
    if (records.length > 0) {
      // Get headers from first record
      const headers = Object.keys(records[0]);
      
      // Create table for this file
      await db.createFileTable(tableName, headers);
      
      // Insert all records
      await db.insertRecords(tableName, records);
    }

    // Add upload record to database
    await db.addUpload(filename, fileType.substring(1), recordCount, filePath, tableName);
    
    // Update statistics
    await db.updateStats(fileType.substring(1), recordCount);

    res.json({ 
      message: `File uploaded successfully! Processed ${recordCount} records.`,
      recordCount: recordCount,
      tableName: tableName
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'File processing failed: ' + error.message });
  }
});

/* GET statistics */
router.get('/api/stats', async function(req, res) {
  try {
    const stats = await db.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

/* GET uploads history */
router.get('/api/uploads', async function(req, res) {
  try {
    const uploads = await db.getUploads();
    res.json({ uploads: uploads });
  } catch (error) {
    console.error('Uploads error:', error);
    res.status(500).json({ error: 'Failed to get uploads' });
  }
});

/* GET records from a specific file */
router.get('/api/file/:tableName', async function(req, res) {
  try {
    const { tableName } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    const records = await db.getFileRecords(tableName, limit);
    res.json({ records: records });
  } catch (error) {
    console.error('File records error:', error);
    res.status(500).json({ error: 'Failed to get file records' });
  }
});

// Secure Metabase dashboard embed route
router.get('/metabase-embed/dashboard', (req, res) => {
  const payload = {
    resource: { dashboard: RECENT_FILES_DASHBOARD_ID },
    params: {},
    exp: Math.round(Date.now() / 1000) + (60 * 10) // 10 min expiry
  };
  const token = jwt.sign(payload, METABASE_SECRET_KEY);
  const iframeUrl = `${METABASE_SITE_URL}/embed/dashboard/${token}#bordered=true&titled=true`;
  res.render('metabase-embed', { iframeUrl });
});

// Refresh Power BI dataset
router.post('/api/powerbi/refresh', async function(req, res) {
  try {
    // This would require setting up Power BI API authentication
    // For now, we'll return a success message
    res.json({ 
      message: 'Power BI refresh initiated',
      status: 'success'
    });
  } catch (error) {
    console.error('Power BI refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh Power BI' });
  }
});

// Get Power BI dashboard embed info
router.get('/api/powerbi/embed-info', async function(req, res) {
  try {
    // This would return the embed URL and token
    res.json({
      embedUrl: 'https://app.powerbi.com/view?r=eyJrIjoiYOUR_DASHBOARD_ID_HERE',
      reportId: 'YOUR_REPORT_ID',
      workspaceId: POWERBI_WORKSPACE_ID
    });
  } catch (error) {
    console.error('Power BI embed info error:', error);
    res.status(500).json({ error: 'Failed to get Power BI embed info' });
  }
});

// Helper functions for file parsing
async function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

async function parseJSON(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) reject(err);
      try {
        const jsonData = JSON.parse(data);
        // Handle both arrays and single objects
        const records = Array.isArray(jsonData) ? jsonData : [jsonData];
        resolve(records);
      } catch (parseErr) {
        reject(parseErr);
      }
    });
  });
}

async function parseXML(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) reject(err);
      
      const parser = new xml2js.Parser();
      parser.parseString(data, (err, result) => {
        if (err) reject(err);
        
        // Convert XML to records
        const records = convertXMLToRecords(result);
        resolve(records);
      });
    });
  });
}

function convertXMLToRecords(xmlObj) {
  // Convert XML object to array of records
  const records = [];
  
  // Look for common XML patterns
  const possibleRecordArrays = [
    xmlObj.root?.record,
    xmlObj.root?.item,
    xmlObj.root?.entry,
    xmlObj.data?.record,
    xmlObj.data?.item,
    xmlObj.records?.record,
    xmlObj.items?.item
  ];
  
  for (const array of possibleRecordArrays) {
    if (Array.isArray(array) && array.length > 0) {
      return array.map(item => flattenObject(item));
    }
  }
  
  // If no array found, treat the whole object as a single record
  return [flattenObject(xmlObj)];
}

function flattenObject(obj, prefix = '') {
  const flattened = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}_${key}` : key;
    
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(flattened, flattenObject(value, newKey));
    } else {
      flattened[newKey] = Array.isArray(value) ? value.join(', ') : String(value);
    }
  }
  
  return flattened;
}

// Generate Power BI embed URL for the latest file
async function generatePowerBIEmbedUrl(tableName, upload) {
  try {
    // For now, return a placeholder URL that you can replace with your actual Power BI report
    // In a real implementation, you would:
    // 1. Create/update a Power BI dataset with the latest file data
    // 2. Generate an embed token
    // 3. Return the embed URL
    
    // Placeholder - replace with your actual Power BI report URL
    const baseUrl = 'https://app.powerbi.com/view?r=';
    const reportId = 'YOUR_REPORT_ID_HERE'; // Replace with your actual report ID
    
    // You can also create a dynamic report based on the table name
    const dynamicUrl = `${baseUrl}${reportId}&filter=${tableName}`;
    
    return dynamicUrl;
  } catch (error) {
    console.error('Error generating Power BI embed URL:', error);
    // Return a fallback URL
    return 'https://app.powerbi.com/view?r=eyJrIjoiYOUR_DASHBOARD_ID_HERE';
  }
}

module.exports = router;
