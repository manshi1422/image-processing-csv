// server.js
import express from 'express';
import multer from 'multer';
import csv from 'fast-csv';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import sharp from 'sharp';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import Job from './models/Job.js';

// MongoDB connection
const MONGODB_URI = 'mongodb://localhost:27017/csv-processing'; // update as needed
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

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

    // Return the output file path (or URL)
    return outputFilePath;
  } catch (err) {
    console.error(`Error processing image ${imageUrl}:`, err.message);
    return null;
  }
}

// Process CSV file: read input, process images, and write output CSV.
async function processCsvFile(filePath, jobDoc) {
  try {
    const rows = [];
    const stream = fs.createReadStream(filePath)
      .pipe(csv.parse({ headers: true }))
      .on('error', error => {
        console.error('CSV Parsing Error:', error);
        jobDoc.status = 'failed';
        jobDoc.errorMessage = error.message;
        jobDoc.save();
      })
      .on('data', row => {
        // Validate required columns
        if (!row['Serial Number'] || !row['Product Name'] || !row['Input Image Urls']) {
          jobDoc.status = 'failed';
          jobDoc.errorMessage = 'Missing required columns in CSV.';
          jobDoc.save();
          stream.destroy(); // Stop further processing
          return;
        }
        rows.push(row);
      })
      .on('end', async rowCount => {
        // Update total rows
        jobDoc.totalRows = rows.length;
        await jobDoc.save();

        for (let row of rows) {
          const productName = row['Product Name'];
          const inputUrls = row['Input Image Urls'].split(',').map(url => url.trim());
          const outputUrls = [];

          for (let i = 0; i < inputUrls.length; i++) {
            const outUrl = await processImage(inputUrls[i], productName, i);
            outputUrls.push(outUrl || '');
          }
          row['Output Image Urls'] = outputUrls.join(',');
          jobDoc.processedRows++;
          await jobDoc.save();
        }

        const outputFilePath = path.join(outputDir, `${jobDoc.requestId}.csv`);
        const ws = fs.createWriteStream(outputFilePath);
        csv.write(rows, { headers: true }).pipe(ws);

        jobDoc.outputFile = outputFilePath;
        jobDoc.status = 'completed';
        await jobDoc.save();
      });
  } catch (err) {
    console.error('Error processing CSV:', err);
    jobDoc.status = 'failed';
    jobDoc.errorMessage = err.message;
    await jobDoc.save();
  }
}

// Setup Express and multer for file uploads
const app = express();
const upload = multer({ dest: uploadsDir });
const PORT = process.env.PORT || 3000;

// Upload API Endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file || !req.file.originalname.endsWith('.csv')) {
    return res.status(400).json({ error: 'Invalid file format. Please upload a CSV file.' });
  }

  // Generate unique request ID and create a new Job document
  const requestId = uuidv4();
  const jobDoc = new Job({ requestId });
  await jobDoc.save();

  // Start CSV processing asynchronously
  processCsvFile(req.file.path, jobDoc);

  // Return the request ID
  res.json({ requestId });
});

// Status API Endpoint
app.get('/api/status/:requestId', async (req, res) => {
  const { requestId } = req.params;
  const jobDoc = await Job.findOne({ requestId });
  if (!jobDoc) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json({
    requestId: jobDoc.requestId,
    status: jobDoc.status,
    processedRows: jobDoc.processedRows,
    totalRows: jobDoc.totalRows,
    outputFile: jobDoc.outputFile,
    errorMessage: jobDoc.errorMessage,
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
