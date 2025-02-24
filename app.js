// const fs = require('fs');
// const csv = require('fast-csv');
// const axios = require('axios');
// const sharp = require('sharp');
// const path = require('path');

// // Define paths for input and output CSV files
// const inputCsvPath = './Book1.csv';
// const outputCsvPath = './Book2.csv';

// // Directory to save processed images
// const outputImagesDir = './processed_images';
// if (!fs.existsSync(outputImagesDir)) {
//     fs.mkdirSync(outputImagesDir);
// }

// // Dummy image processing function using sharp (e.g., resize)
// async function processImage(imageUrl, productName, index) {
//     try {
//         // Download image data
//         const response = await axios({
//             url: imageUrl,
//             responseType: 'arraybuffer',
//         });
//         const imageBuffer = Buffer.from(response.data, 'binary');

//         // Process the image using sharp
//         const processedBuffer = await sharp(imageBuffer)
//             .resize(200) // Example resize to width 200px
//             .toBuffer();

//         // Save the processed image locally (for demonstration)
//         // You can later upload to cloud storage if needed.
//         const outputFileName = `${productName.replace(/\s+/g, '_')}_${index}.jpg`;
//         const outputFilePath = path.join(outputImagesDir, outputFileName);
//         fs.writeFileSync(outputFilePath, processedBuffer);

//         // For demonstration, return a file path or a hosted URL
//         return outputFilePath;
//     } catch (err) {
//         console.error(`Error processing image ${imageUrl}:`, err);
//         return null;
//     }
// }

// // Process the CSV file
// async function processCSV() {
//     const rows = [];
//     // Read input CSV
//     fs.createReadStream(inputCsvPath)
//         .pipe(csv.parse({ headers: true }))
//         .on('error', error => console.error(error))
//         .on('data', row => rows.push(row))
//         .on('end', async rowCount => {
//             console.log(`Parsed ${rowCount} rows`);
//             // Process each row sequentially or concurrently as needed
//             for (let row of rows) {
//                 const serialNumber = row['Serial Number'];
//                 const productName = row['Product Name'];
//                 const inputUrls = row['Input Image Urls'].split(',').map(url => url.trim());

//                 // Process each image and obtain output URL
//                 const outputUrls = [];
//                 for (let i = 0; i < inputUrls.length; i++) {
//                     const outputUrl = await processImage(inputUrls[i], productName, i);
//                     outputUrls.push(outputUrl);
//                 }

//                 // Add output URLs as comma separated string in the row
//                 row['Output Image Urls'] = outputUrls.join(',');
//             }

//             // Write results to the output CSV file
//             const ws = fs.createWriteStream(outputCsvPath);
//             csv.write(rows, { headers: true }).pipe(ws);
//             console.log('CSV processing completed. Output file:', outputCsvPath);
//         });
// }

// processCSV();
// server.js
import express from 'express';
import multer from 'multer';
import csv from 'fast-csv';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';

// Create directories if they do not exist
const uploadsDir = path.join(process.cwd(), 'uploads');
const outputDir = path.join(process.cwd(), 'output');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

// Dummy image processing function (replace with your own logic)
async function processImage(imageUrl, productName, index) {
  try {
    // Download image data
    const response = await axios({
      url: imageUrl,
      responseType: 'arraybuffer',
      timeout: 10000,
    });
    const imageBuffer = Buffer.from(response.data, 'binary');

    // Process the image (example: resize to width 200px)
    const processedBuffer = await sharp(imageBuffer)
      .resize(200)
      .toBuffer();

    // Save processed image locally
    const safeName = productName.replace(/\s+/g, '_');
    const outputFileName = `${safeName}_${index}.jpg`;
    const outputFilePath = path.join(outputDir, outputFileName);
    fs.writeFileSync(outputFilePath, processedBuffer);

    // Return the output file path or URL (for demo, we return the local path)
    return outputFilePath;
  } catch (err) {
    console.error(`Error processing image ${imageUrl}:`, err.message);
    return null;
  }
}

// Process CSV file: read input, process images, and write output CSV.
async function processCsvFile(filePath, job) {
  try {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv.parse({ headers: true }))
      .on('error', error => {
        console.error('CSV Parsing Error:', error);
        job.status = 'failed';
      })
      .on('data', row => {
        // Basic CSV header validation (adjust as needed)
        if (!row['S. No.'] || !row['Product Name'] || !row['Input Image Urls']) {
          job.status = 'failed';
          console.error('CSV Format Error: Missing required columns.');
          return;
        }
        rows.push(row);
      })
      .on('end', async rowCount => {
        if (job.status === 'failed') return;
        job.totalRows = rows.length;
        job.processedRows = 0;
        // Process each CSV row
        for (let row of rows) {
          const serialNumber = row['Serial Number'];
          const productName = row['Product Name'];
          // Split comma-separated URLs and trim each one
          const inputUrls = row['Input Image Urls'].split(',').map(url => url.trim());
          const outputUrls = [];

          // Process each image URL sequentially (or consider parallel processing)
          for (let i = 0; i < inputUrls.length; i++) {
            const outUrl = await processImage(inputUrls[i], productName, i);
            outputUrls.push(outUrl || '');
          }

          // Add the output image URLs (comma separated) to the row
          row['Output Image Urls'] = outputUrls.join(',');
          job.processedRows++;
        }
        // Write the updated CSV with a new column for output image URLs
        const outputFilePath = path.join(outputDir, `${job.requestId}.csv`);
        const ws = fs.createWriteStream(outputFilePath);
        csv.write(rows, { headers: true }).pipe(ws);
        job.outputFile = outputFilePath;
        job.status = 'completed';
      });
  } catch (err) {
    console.error('Error processing CSV:', err);
    job.status = 'failed';
  }
}

// In-memory job store (in production, use a database)
const jobStore = {};

// Configure Express and multer for file uploads
const app = express();
const upload = multer({ dest: uploadsDir });
const PORT = process.env.PORT || 3000;

// Upload API Endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  // Validate file exists and has a .csv extension
  if (!req.file || !req.file.originalname.endsWith('.csv')) {
    return res.status(400).json({ error: 'Invalid file format. Please upload a CSV file.' });
  }

  // Generate unique request ID and create a job record
  const requestId = uuidv4();
  jobStore[requestId] = {
    requestId,
    status: 'processing',
    processedRows: 0,
    totalRows: 0,
    outputFile: null,
  };

  // Start CSV processing in the background
  processCsvFile(req.file.path, jobStore[requestId]);

  // Return the request ID to the client
  res.json({ requestId });
});

// Status API Endpoint
app.get('/api/status/:requestId', (req, res) => {
  const { requestId } = req.params;
  const job = jobStore[requestId];
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json({
    requestId: job.requestId,
    status: job.status,
    processedRows: job.processedRows,
    totalRows: job.totalRows,
    outputFile: job.outputFile, // In production, you might provide a download URL
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
