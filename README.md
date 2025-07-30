# File Parser Dashboard

A Node.js web application for uploading and parsing CSV, JSON, and XML files with Power BI integration capabilities.

## Features

- **File Upload**: Drag-and-drop or click-to-upload interface
- **Multi-format Support**: CSV, JSON, and XML file parsing
- **Real-time Statistics**: Track uploads, records, and file types
- **Power BI Integration**: API endpoint for Power BI data connection
- **Modern UI**: Responsive dashboard with beautiful design
- **File Size Limit**: 10MB maximum file size

## Technology Stack

- **Backend**: Node.js, Express.js
- **Frontend**: EJS templates, vanilla JavaScript
- **File Processing**: Multer, csv-parser, xml2js
- **Deployment**: Azure Web App (configured)

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd DataExtractionNodeJS
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the application**
   ```bash
   npm start
   ```

4. **Access the application**
   - Open your browser and go to `http://localhost:3000`
   - The dashboard will be available at the root URL

## API Endpoints

### File Upload
- **POST** `/upload`
  - Upload CSV, JSON, or XML files
  - Returns: `{ message: string, recordCount: number }`

### Statistics
- **GET** `/api/stats`
  - Returns upload statistics
  - Response: `{ total_uploads, total_records, csv_files, json_files, xml_files }`

### Upload History
- **GET** `/api/uploads`
  - Returns recent upload history
  - Response: `{ uploads: Array }`

### Power BI Integration
- **GET** `/api/powerbi-data`
  - Returns formatted data for Power BI
  - Response: `{ data: Array, metadata: Object }`

## Power BI Integration

To connect this application to Power BI:

1. Open Power BI Desktop
2. Go to **Get Data** → **Web**
3. Enter the API endpoint: `http://localhost:3000/api/powerbi-data`
4. Configure refresh settings as needed
5. The data will be available for visualization

## File Format Support

### CSV Files
- Standard comma-separated values
- Headers are automatically detected
- Records are counted by rows

### JSON Files
- Supports both arrays and objects
- Arrays count as multiple records
- Single objects count as one record

### XML Files
- Basic XML parsing support
- Records counted by common XML elements
- Supports `<record>`, `<item>`, `<entry>` tags

## Project Structure

```
DataExtractionNodeJS/
├── bin/
│   └── www                 # Server startup script
├── routes/
│   ├── index.js           # Main routes and API endpoints
│   └── users.js           # User routes (placeholder)
├── views/
│   ├── index.ejs          # Main dashboard view
│   └── error.ejs          # Error page
├── public/
│   └── stylesheets/       # Static assets
├── uploads/               # Uploaded files (created automatically)
├── app.js                 # Express application setup
├── package.json           # Dependencies and scripts
└── README.md             # This file
```

## Development

### Adding New File Types

To support additional file formats:

1. Add the file extension to the `allowedTypes` array in `routes/index.js`
2. Create a new parsing function (e.g., `parseYAML`)
3. Add the case to the switch statement in the upload handler
4. Update the stats tracking

### Database Integration

Currently, the application uses in-memory storage. For production:

1. Install a database driver (e.g., `mongoose` for MongoDB)
2. Replace the in-memory arrays with database operations
3. Add proper error handling and data validation

## Deployment

The application is configured for Azure Web App deployment via GitHub Actions:

1. Push changes to the `main` branch
2. GitHub Actions will automatically build and deploy
3. The application will be available at your Azure Web App URL

## Environment Variables

- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment mode (development/production)

## Security Considerations

- File uploads are validated for type and size
- Uploaded files are stored in a separate directory
- Consider implementing authentication for production use
- Add rate limiting for API endpoints
- Implement proper error handling and logging

## Troubleshooting

### Common Issues

1. **Port already in use**
   - Change the port in `bin/www` or set `PORT` environment variable

2. **File upload fails**
   - Check file size (max 10MB)
   - Verify file format (CSV, JSON, XML only)
   - Ensure uploads directory has write permissions

3. **Power BI connection fails**
   - Verify the API endpoint is accessible
   - Check CORS settings if needed
   - Ensure the application is running

## License

This project is licensed under the MIT License.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request 